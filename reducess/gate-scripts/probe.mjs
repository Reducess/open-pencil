// uso: bun probe.mjs <label> <query> [--full]
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const require = createRequire('/home/davidson-assis/workspace/mineer/app/package.json')
const { chromium } = require('playwright-core')
const [label, query = ''] = process.argv.slice(2)
const full = process.argv.includes('--full')
const OUT = process.env.OUT
const BASE = process.env.BASE ?? 'http://localhost:18931'
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
const reqs = [], cons = [], fails = []
page.on('response', (r) => { const u = new URL(r.url()); if (u.protocol.startsWith('http')) reqs.push({ host: u.host, path: u.pathname, status: r.status(), type: r.headers()['content-type'] ?? '', len: r.headers()['content-length'] ?? '' }) })
page.on('requestfailed', (r) => fails.push({ url: r.url(), err: r.failure()?.errorText }))
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) cons.push(`[${m.type()}] ${m.text().slice(0, 300)}`) })
page.on('pageerror', (e) => cons.push(`[pageerror] ${String(e).slice(0, 400)}`))
const res = { label, query }
await page.goto(`${BASE}/demo/editor${query}`, { waitUntil: 'load' })
try {
  await page.waitForFunction(() => !!window.__gate, null, { timeout: 15000 })
  res.fonts = await page.evaluate(() => window.__gate.ready())
  res.status = 'ready'
} catch (e) { res.status = 'FALHOU: ' + String(e).slice(0, 300) }
await page.waitForTimeout(800)
res.layers = await page.locator('[data-testid=layer-row]').allInnerTexts().catch(() => [])
res.toolbar = await page.locator('[data-testid=toolbar] button').count().catch(() => 0)
res.canvas = await page.evaluate(() => { const c = document.querySelector('canvas'); return c ? { w: c.width, h: c.height, ready: c.dataset.ready, err: c.dataset.surfaceError } : null })
await page.screenshot({ path: `${OUT}/screenshot-${label}.png` })
if (res.status === 'ready') {
  // provoca os caminhos que poderiam sair para a rede
  res.probe = await page.evaluate(async () => {
    const fm = window.__gate.fontManager
    const out = { providers: fm.enabledOnlineFontProviders() }
    try { out.roboto = !!(await fm.loadFont('Roboto', 'Regular')) } catch (e) { out.roboto = 'erro ' + e }
    try { out.families = (await fm.listFamilyOptions()).length } catch (e) { out.families = 'erro ' + e }
    return out
  })
  await page.waitForTimeout(1500)
}
if (full && res.status === 'ready') {
  const g = (fn, ...a) => page.evaluate(fn, ...a)
  const ids = await g(() => window.__gate.ids)
  res.ids = ids
  res.titleNode = await g((id) => { const n = window.__gate.editor.graph.getNode(id); return { w: n.width, h: n.height, fontSize: n.fontSize, lineHeight: n.lineHeight } }, ids.title)
  writeFileSync(`${OUT}/scene.json`, await g(() => window.__gate.serialize()))
  for (const [fmt, ext, opt] of [['svg', 'svg'], ['png', 'png', { scale: 1 }], ['pdf', 'pdf']]) {
    try {
      const r = await g(([f, id, o]) => window.__gate.exportB64(f, id, o), [fmt, ids.frame, opt])
      writeFileSync(`${OUT}/export-browser.${ext}`, r.text ?? Buffer.from(r.b64, 'base64'))
      res['export_' + fmt] = 'ok ' + (r.text ? r.text.length : r.n) + ' bytes'
    } catch (e) { res['export_' + fmt] = 'FALHOU ' + String(e).slice(0, 300) }
  }
  try {
    res.textLines = await g((id) => window.__gate.textLines(id), ids.title)
    const svgText = require('node:fs').readFileSync(`${OUT}/export-browser.svg`, 'utf8')
    const gid = 'node-' + ids.title.replace(/[^A-Za-z0-9_-]/g, '-')
    const re = new RegExp(`(<g id="${gid}"[^>]*>\\s*<text )x="0" y="[^"]*"([^>]*)>[^<]*</text>`)
    const fixed = svgText.replace(re, (_m, a, b) => `${a}${b.trim()}>` + res.textLines.map((l) => `<tspan x="0" y="${Math.round(l.baseline * 100) / 100}">${l.text}</tspan>`).join('') + '</text>')
    res.svgFixedChanged = fixed !== svgText
    writeFileSync(`${OUT}/export-browser.lines-fixed.svg`, fixed)
    // rasteriza os dois SVG no Chromium, com a Inter do pacote
    for (const [name, src] of [['svg-render-original', svgText], ['svg-render-lines-fixed', fixed]]) {
      const p2 = await browser.newPage({ viewport: { width: 1080, height: 1350 } })
      await p2.goto(`${BASE}/demo/`)
      await p2.setContent(`<style>@font-face{font-family:Inter;font-weight:700;src:url(${BASE}/demo/openpencil/fonts/Inter-Bold.ttf)}body{margin:0}</style>${src.replace(/<\?xml[^>]*>/, '')}`)
      await p2.evaluate(() => document.fonts.ready); await p2.waitForTimeout(300)
      await p2.screenshot({ path: `${OUT}/${name}.png` }); await p2.close()
    }
  } catch (e) { res.textLines = 'FALHOU ' + String(e).slice(0, 300) }
  // ---- tools de IA
  const shot = async (n) => { await page.waitForTimeout(400); const b = await page.locator('canvas').screenshot({ path: `${OUT}/tools-${n}.png` }); return require('node:crypto').createHash('sha256').update(b).digest('hex').slice(0, 12) }
  const t = {}
  t.total = await g(() => window.__gate.toolNames.length)
  t.h0 = await shot('0-inicial')
  t.create = await g((p) => window.__gate.tools.create_shape.run({ type: 'RECTANGLE', x: 0, y: 0, width: 400, height: 120, name: 'IA rect', parent_id: p }), ids.frame)
  t.h1 = await shot('1-create')
  const newId = t.create?.id
  t.fill = await g((id) => window.__gate.tools.set_fill.run({ id, color: '#e11d48' }), newId)
  t.h2 = await shot('2-fill')
  t.grad = await g((id) => window.__gate.tools.set_fill.run({ id, color: '#ff0000', color_end: '#0000ff', gradient: 'left-right' }), newId)
  t.hg = await shot('2b-gradient-left-right')
  await g(() => window.__gate.editor.undoAction())
  t.text = await g((id) => window.__gate.tools.set_text.run({ id, text: 'Texto trocado pela tool' }), ids.title)
  t.h3 = await shot('3-text')
  t.undoStack = await g(() => { const u = window.__gate.editor.undo; return { canUndo: u.canUndo, canRedo: u.canRedo } })
  await g(() => window.__gate.editor.undoAction()); t.afterUndo1 = await g((id) => window.__gate.editor.graph.getNode(id).text, ids.title); t.u1 = await shot('4-undo-text')
  await g(() => window.__gate.editor.undoAction()); t.afterUndo2 = await g((id) => JSON.stringify(window.__gate.editor.graph.getNode(id)?.fills?.[0]?.color), newId); t.u2 = await shot('5-undo-fill')
  await g(() => window.__gate.editor.undoAction()); t.afterUndo3 = await g((id) => !!window.__gate.editor.graph.getNode(id), newId); t.u3 = await shot('6-undo-create')
  const img = await g((id) => window.__gate.tools.export_image.run({ ids: [id], format: 'PNG', scale: 1 }), ids.selo)
  t.exportImage = img && img.base64 ? { mimeType: img.mimeType, bytes: Buffer.from(img.base64, 'base64').length, keys: Object.keys(img) } : img
  if (img?.base64) writeFileSync(`${OUT}/tool-export_image-selo.png`, Buffer.from(img.base64, 'base64'))
  res.tools = t
}
res.external = reqs.filter((r) => !r.host.startsWith('localhost'))
res.local = reqs.filter((r) => r.host.startsWith('localhost')).map((r) => `${r.status} ${r.path} ${r.type.split(';')[0]} ${r.len}`)
res.failed = fails
res.console = cons
writeFileSync(`${OUT}/probe-${label}.json`, JSON.stringify(res, null, 2))
console.log(JSON.stringify(res, null, 1))
await browser.close()
