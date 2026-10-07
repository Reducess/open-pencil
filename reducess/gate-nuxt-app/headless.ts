// uso: bun headless.ts <scene.json> <out.png>   (ou node 24 --experimental-strip-types)
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { SceneGraph } from '@open-pencil/scene-graph'
import { initCanvasKit, headlessRenderNodes } from '@open-pencil/core/io/formats/raster'
import { fontManager } from '@open-pencil/core/text'
import { restorePage } from './lib/scene.ts'

const [sceneFile, outFile] = process.argv.slice(2)
const t0 = performance.now()
const graph = new SceneGraph()
const page = graph.getPages()[0]!
const roots = restorePage(graph, page.id, readFileSync(sceneFile!, 'utf8'))
await initCanvasKit()
const t1 = performance.now()
const png = await headlessRenderNodes(graph, page.id, roots, { scale: 1, format: 'PNG' })
const t2 = performance.now()
if (!png) throw new Error('render devolveu null')
writeFileSync(outFile!, png)
console.log(JSON.stringify({
  runtime: typeof Bun !== 'undefined' ? 'bun ' + Bun.version : 'node ' + process.version,
  nodes: graph.nodes.size, roots, bytes: png.length,
  sha256: createHash('sha256').update(png).digest('hex'),
  initMs: Math.round(t1 - t0), renderMs: Math.round(t2 - t1),
  fonts: ['Regular', 'Bold'].map((s) => `Inter ${s}: ${fontManager.loadedFontSource('Inter', s)}`),
}))
