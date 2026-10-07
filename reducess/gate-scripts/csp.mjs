import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const require = createRequire('/home/davidson-assis/workspace/mineer/app/package.json')
const { chromium } = require('playwright-core')
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const BASE = "default-src 'none'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; worker-src 'self'; font-src 'self'; "
const out = {}
for (const [label, script] of [
  ['minima (self + inline do Nuxt + wasm-unsafe-eval)', "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'"],
  ['sem wasm-unsafe-eval', "script-src 'self' 'unsafe-inline'"],
]) {
  const page = await browser.newPage(); const log = []
  await page.route('**/demo/editor*', async (route) => { const r = await route.fetch(); await route.fulfill({ response: r, headers: { ...r.headers(), 'content-security-policy': BASE + script } }) })
  page.on('console', (m) => ['error'].includes(m.type()) && log.push(m.text().slice(0, 260)))
  page.on('pageerror', (e) => log.push('pageerror: ' + String(e).slice(0, 200)))
  const r = {}
  try {
    await page.goto('http://localhost:18931/demo/editor?fix=1&online=off'); await page.waitForFunction(() => !!window.__gate, null, { timeout: 10000 })
    r.ready = await page.evaluate(() => Promise.race([window.__gate.ready().then(() => 'ok'), new Promise((res) => setTimeout(() => res('timeout'), 12000))]))
    if (r.ready === 'ok') {
      const ids = await page.evaluate(() => window.__gate.ids)
      const ev = (fn, a) => page.evaluate(fn, a).catch((e) => 'ERRO ' + String(e).slice(0, 160))
      r.png = await ev(async (id) => (await window.__gate.exportB64('png', id, { scale: 1 })).n, ids.frame)
      r.pdf = await ev(async (id) => (await window.__gate.exportB64('pdf', id)).n, ids.frame)
      r.fig = await ev(async (id) => (await window.__gate.exportB64('fig', id)).n, ids.frame)
      r.set_fill = await ev(async (id) => JSON.stringify(await window.__gate.tools.set_fill.run({ id, color: '#00ff00' })).slice(0, 80), ids.rect)
      r.render_jsx = await ev(async (id) => JSON.stringify(await window.__gate.tools.render.run({ parent_id: id, jsx: '<Frame name="JSX" w={200} h={80} bg="#3366FF"><Text size={20} color="#FFFFFF">oi</Text></Frame>' })).slice(0, 200), ids.frame)
      r.eval_tool = await ev(async () => JSON.stringify(await window.__gate.tools.eval.run({ code: 'return figma.currentPage.children.length' })).slice(0, 200))
      r.fontFaces = await ev(() => [...document.fonts].map((f) => f.family + ' ' + f.weight + ' ' + f.status))
    }
  } catch (e) { r.erro = String(e).slice(0, 200) }
  r.console = log; out[label] = r; await page.close()
}
writeFileSync(process.env.OUT + '/probe-csp.json', JSON.stringify(out, null, 2)); console.log(JSON.stringify(out, null, 1)); await browser.close()
