import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { populateAllLazyFigImportRoots } from '@open-pencil/core/kiwi'
import { setLazyFigImportContext } from '@open-pencil/core/kiwi/fig/lazy-import'
import { SceneGraph, setInstanceOverride } from '@open-pencil/scene-graph'

import { expandirCena, MOTOR_VERSAO } from '../src'

import { buildTextPicture, renderPNG, sha256 } from './helpers/render'
import { buildRichScene, solid } from './helpers/rich-scene'
import { assertPlainJSON, FakeStorage, load, save, throughJSON } from './helpers/scene-io'

function commandsBlob(): Uint8Array {
  // MOVE_TO 0,0 · LINE_TO 40,0 · LINE_TO 40,30 · CLOSE — the engine's geometry blob layout.
  const blob = new Uint8Array(1 + 3 * 9)
  const view = new DataView(blob.buffer)
  const points = [
    [1, 0, 0],
    [2, 40, 0],
    [2, 40, 30]
  ]
  points.forEach(([command, x, y], index) => {
    blob[index * 9] = command
    view.setFloat32(index * 9 + 1, x, true)
    view.setFloat32(index * 9 + 5, y, true)
  })
  return blob
}

describe('SceneNode fields JSON cannot carry', () => {
  test('geometry blobs, glyph blobs, override maps and odd numbers all come back', async () => {
    const graph = new SceneGraph()
    const pageId = graph.getPages()[0].id
    const blob = commandsBlob()
    const vector = graph.createNode('VECTOR', pageId, {
      name: 'Imported vector',
      width: 40,
      height: 30,
      rotation: -0,
      fills: [solid(0.2, 0.4, 0.6)],
      fillGeometry: [{ windingRule: 'NONZERO', commandsBlob: blob }],
      strokeGeometry: [{ windingRule: 'EVENODD', commandsBlob: blob.slice(), fills: [solid(1, 0, 0)] }]
    })
    const text = graph.createNode('TEXT', pageId, {
      name: 'Imported text',
      y: 60,
      text: 'A',
      width: 40,
      height: 20,
      derivedTextGlyphs: [{ commandsBlob: blob.slice(), x: 0, y: 12, fontSize: 12, rotation: 0.5 }],
      textPathBox: { x: 0, y: 0, width: 40, height: 20 }
    })
    const component = graph.createNode('COMPONENT', pageId, { name: 'C', width: 10, height: 10 })
    const instance = graph.createInstance(component.id, pageId, { name: 'I', y: 120 })
    if (!instance) throw new Error('Expected an instance')
    // Override values are `unknown` in the engine: undefined, bytes and nested maps all occur.
    instance.instanceOverrides.self.set('cleared', undefined)
    setInstanceOverride(instance.instanceOverrides, instance.id, instance.id, 'bytes', blob.slice())
    setInstanceOverride(instance.instanceOverrides, instance.id, 'child:1', 'fills', [solid(0, 1, 0)])
    // Source metadata from a .fig import is free-form.
    vector.source.fig.rawNodeFields = {
      blob: new Uint8Array([1, 2, 3]),
      big: 9007199254740993n,
      ratio: Number.NaN,
      limit: Infinity,
      absent: undefined
    }

    const storage = new FakeStorage()
    const cena = await save(graph, storage)
    assertPlainJSON(cena)
    expect(throughJSON(cena)).toStrictEqual(cena)
    const { grafo } = await load(throughJSON(cena), storage)

    for (const [id, node] of graph.nodes) expect(grafo.nodes.get(id)).toStrictEqual(node)

    const restoredVector = grafo.getNode(vector.id)
    expect(restoredVector?.fillGeometry[0].commandsBlob).toBeInstanceOf(Uint8Array)
    expect(restoredVector?.fillGeometry[0].commandsBlob).toEqual(blob)
    expect(Object.is(restoredVector?.rotation, -0)).toBe(true)
    expect(grafo.getNode(text.id)?.derivedTextGlyphs?.[0].commandsBlob).toEqual(blob)
    const overrides = grafo.getNode(instance.id)?.instanceOverrides
    expect(overrides?.self.has('cleared')).toBe(true)
    expect(overrides?.self.get('cleared')).toBeUndefined()
    expect(overrides?.self.get('bytes')).toEqual(blob)
    expect(overrides?.descendants.get('child:1')).toBeInstanceOf(Map)
    const raw = restoredVector?.source.fig.rawNodeFields
    expect(raw?.['big']).toBe(9007199254740993n)
    expect(raw?.['ratio']).toBeNaN()
    expect(raw && 'absent' in raw).toBe(true)

    // The decoded blobs are what the renderer paints from.
    const original = await renderPNG(graph, pageId, [vector.id])
    const restored = await renderPNG(grafo, pageId, [vector.id])
    expect(sha256(restored)).toBe(sha256(original))
  })

  test('textPicture is a cache: dropped by default, and the text is laid out again', async () => {
    const reference = buildRichScene()
    const expected = await renderPNG(reference.graph, reference.pageId, [reference.ids.frame])

    const scene = buildRichScene()
    const title = scene.graph.getNode(scene.ids.title)
    if (!title) throw new Error('Expected the title node')
    // Lay the scene out first so the snapshot is built from the final text box.
    await renderPNG(scene.graph, scene.pageId, [scene.ids.frame])
    const picture = await buildTextPicture(title)
    expect(picture?.byteLength).toBeGreaterThan(1000)
    title.textPicture = picture

    const storage = new FakeStorage()
    const cena = await save(scene.graph, storage)
    const stored = expandirCena(cena).nos.find(([id]) => id === scene.ids.title)?.[1]
    expect(stored?.['textPicture']).toBeNull()
    // The caller's node is not touched by the save.
    expect(title.textPicture).toBe(picture)

    const { grafo } = await load(throughJSON(cena), storage)
    expect(grafo.getNode(scene.ids.title)?.textPicture).toBeNull()
    const restored = await renderPNG(grafo, scene.pageId, [scene.ids.frame])
    expect(sha256(restored)).toBe(sha256(expected))
  })

  test('textPicture can be kept on request and comes back as bytes', async () => {
    const scene = buildRichScene()
    const title = scene.graph.getNode(scene.ids.title)
    if (!title) throw new Error('Expected the title node')
    title.textPicture = new Uint8Array([115, 107, 105, 97, 0, 1, 2, 3])

    const { grafoParaCena } = await import('../src')
    const storage = new FakeStorage()
    const cena = await grafoParaCena(scene.graph, {
      manterTextPicture: true,
      resolverArquivo: ({ bytes }) => (bytes ? storage.put(bytes) : null)
    })
    assertPlainJSON(cena)
    const { grafo } = await load(throughJSON(cena), storage)
    expect(grafo.getNode(scene.ids.title)?.textPicture).toEqual(title.textPicture)
  })

  test('.fig-only graph state is left out, the rest of the graph state is kept', async () => {
    const { graph } = buildRichScene()
    graph.figKiwiVersion = 71
    graph.figSchemaDeflated = new Uint8Array([1, 2, 3])
    graph.documentColorSpace = 'display-p3'
    graph.enabledLibraries.set('lib:brand', { libraryId: 'lib:brand', revisionId: 'r7', enabled: true })

    const storage = new FakeStorage()
    const cena = await save(graph, storage)
    expect(JSON.stringify(cena)).not.toContain('figSchemaDeflated')
    expect(cena.espacoDeCor).toBe('display-p3')
    expect(cena.bibliotecas).toEqual([
      ['lib:brand', { libraryId: 'lib:brand', revisionId: 'r7', enabled: true }]
    ])

    const { grafo } = await load(throughJSON(cena), storage)
    expect(grafo.figKiwiVersion).toBeNull()
    expect(grafo.figSchemaDeflated).toBeNull()
    expect(grafo.documentColorSpace).toBe('display-p3')
    expect(grafo.enabledLibraries).toEqual(graph.enabledLibraries)
  })

  test('a document without libraries does not carry the field', async () => {
    const cena = await save(buildRichScene().graph, new FakeStorage())
    expect('bibliotecas' in cena).toBe(false)
  })
})

describe('lazily imported .fig graphs', () => {
  function lazyGraph() {
    const graph = new SceneGraph()
    const [page1] = graph.getPages()
    const page2 = graph.addPage('Page 2')
    const component = graph.createNode('COMPONENT', page1.id, { name: 'Button', width: 100, height: 40 })
    graph.createNode('RECTANGLE', component.id, { name: 'Background', width: 100, height: 40 })
    const instance = graph.createNode('INSTANCE', page2.id, {
      name: 'Button instance',
      componentId: component.id,
      width: 100,
      height: 40
    })
    setLazyFigImportContext(graph, {
      changeMap: new Map(),
      guidToNodeId: new Map(),
      blobs: [],
      populatedRootIds: new Set([page1.id])
    })
    return { graph, instance }
  }

  test('every page is materialized before the scene is written', async () => {
    const { graph, instance } = lazyGraph()
    expect(graph.getChildren(instance.id)).toHaveLength(0)

    const storage = new FakeStorage()
    const cena = await save(graph, storage)

    expect(graph.getChildren(instance.id)).toHaveLength(1)
    // Nothing is left pending on the source graph, and the stored scene has the populated child.
    expect(populateAllLazyFigImportRoots(graph)).toBe(false)
    const { grafo } = await load(throughJSON(cena), storage)
    expect(grafo.getChildren(instance.id).map((node) => node.name)).toEqual(['Background'])
    // The restored graph is a plain one: no lazy context travels with the scene.
    expect(populateAllLazyFigImportRoots(grafo)).toBe(false)
    expect(grafo.nodes.size).toBe(graph.nodes.size)
  })
})

test('MOTOR_VERSAO is the version of the engine in this repository', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../../core/package.json', import.meta.url), 'utf8')
  ) as { version: string }
  // A bump here must come with a migration entry; see src/migrate.ts.
  expect(MOTOR_VERSAO).toBe(manifest.version)
})
