import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const require = createRequire('/home/davidson-assis/workspace/mineer/app/package.json')
const { chromium } = require('playwright-core')
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const out = {}
for (const [label, q] of [['padrao', '?fix=1'], ['online-off', '?fix=1&online=off']]) {
  const page = await browser.newPage()
  const ext = new Map()
  page.on('request', (r) => { const u = new URL(r.url()); if (u.protocol.startsWith('http') && !u.host.startsWith('localhost')) ext.set(u.host + u.pathname, 'pendente') })
  page.on('response', (r) => { const u = new URL(r.url()); if (ext.has(u.host + u.pathname)) ext.set(u.host + u.pathname, r.status()) })
  page.on('requestfailed', (r) => { const u = new URL(r.url()); if (ext.has(u.host + u.pathname)) ext.set(u.host + u.pathname, r.failure()?.errorText) })
  await page.goto(`http://localhost:18931/demo/editor${q}`)
  await page.waitForFunction(() => !!window.__gate); await page.evaluate(() => window.__gate.ready())
  const r = {}
  r.passivo = [...ext]
  // 1) host liga explicitamente o fetch de fontes web (sem isso o browser nunca sai)
  r.roboto = await page.evaluate(async () => { const fm = window.__gate.fontManager; const f = window.fetch.bind(window); fm.setWebFontFetch((u, i) => f(u, i)); try { return !!(await fm.loadFont('Roboto', 'Regular')) } catch (e) { return String(e) } })
  await page.waitForTimeout(2500); r.aposWebFontFetch = [...ext]; ext.clear()
  // 2) tools que saem para a rede
  r.search_icons = await page.evaluate(async () => { try { return JSON.stringify(await window.__gate.tools.search_icons.run({ queries: ['star'] })).slice(0, 160) } catch (e) { return String(e) } })
  await page.waitForTimeout(2500); r.aposIcones = [...ext]
  out[label] = r
  await page.close()
}
writeFileSync(process.env.OUT + '/probe-external.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 1))
await browser.close()
