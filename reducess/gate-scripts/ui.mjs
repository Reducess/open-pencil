import { createRequire } from 'node:module'
const require = createRequire('/home/davidson-assis/workspace/mineer/app/package.json')
const { chromium } = require('playwright-core')
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto('http://localhost:18931/demo/editor?fix=1&online=off'); await page.waitForFunction(() => !!window.__gate); await page.evaluate(() => window.__gate.ready())
const r = {}
await page.locator('[data-testid=layer-row]').first().click()
r.selecionadoPorLayer = await page.evaluate(() => [...window.__gate.editor.state.selectedIds])
await page.locator('[data-testid=layer-row] button').first().click(); await page.waitForTimeout(200)
r.linhasAposExpandir = await page.locator('[data-testid=layer-row]').allInnerTexts()
await page.locator('[data-testid=toolbar] button', { hasText: 'RECTANGLE' }).click()
r.activeTool = await page.evaluate(() => window.__gate.editor.state.activeTool)
console.log(JSON.stringify(r)); await browser.close()
