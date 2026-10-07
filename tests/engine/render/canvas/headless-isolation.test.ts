import { beforeAll, describe, expect, test } from 'bun:test'

import {
  headlessRenderNodes,
  initCanvasKit,
  renderNodesToImage,
  SceneGraph,
  SkiaRenderer
} from '@open-pencil/core'
import type { Color, VectorNetwork } from '@open-pencil/scene-graph'

import { expectDefined } from '#tests/helpers/assert'

let ck: Awaited<ReturnType<typeof initCanvasKit>>

const RED: Color = { r: 1, g: 0, b: 0, a: 1 }
const BLUE: Color = { r: 0, g: 0, b: 1, a: 1 }
const SHARED_IMAGE_HASH = 'same-hash-different-bytes'

function solidPNG(color: Color): Uint8Array {
  const surface = expectDefined(ck.MakeSurface(8, 8), 'surface')
  surface.getCanvas().clear(ck.Color4f(color.r, color.g, color.b, color.a))
  const image = surface.makeImageSnapshot()
  const bytes = expectDefined(image.encodeToBytes(), 'png')
  image.delete()
  surface.delete()
  return bytes
}

function polygon(points: Array<[number, number]>): VectorNetwork {
  return {
    vertices: points.map(([x, y]) => ({ x, y })),
    segments: points.map((_, index) => ({
      start: index,
      end: (index + 1) % points.length,
      tangentStart: { x: 0, y: 0 },
      tangentEnd: { x: 0, y: 0 }
    })),
    regions: [{ windingRule: 'NONZERO', loops: [points.map((_, index) => index)] }]
  }
}

/** Documents saved by different sessions number their nodes alike and may share an image hash. */
function buildDocument(image: Color, shape: Array<[number, number]>) {
  const graph = new SceneGraph()
  const pageId = graph.getPages()[0].id
  const frame = graph.createNodeWithId('9:1', 'FRAME', pageId, {
    width: 100,
    height: 50,
    fills: []
  })
  graph.createNodeWithId('9:2', 'VECTOR', frame.id, {
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    vectorNetwork: polygon(shape),
    fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }]
  })
  graph.images.set(SHARED_IMAGE_HASH, solidPNG(image))
  graph.createNodeWithId('9:3', 'RECTANGLE', frame.id, {
    x: 50,
    y: 0,
    width: 50,
    height: 50,
    fills: [
      {
        type: 'IMAGE',
        imageHash: SHARED_IMAGE_HASH,
        imageScaleMode: 'FILL',
        color: { r: 0, g: 0, b: 0, a: 0 },
        opacity: 1,
        visible: true
      }
    ]
  })
  return { graph, pageId, nodeIds: [frame.id] }
}

/** Reference render from a renderer no other document has touched. */
async function renderIsolated(document: ReturnType<typeof buildDocument>): Promise<Uint8Array> {
  const surface = expectDefined(ck.MakeSurface(1, 1), 'surface')
  const renderer = new SkiaRenderer(ck, surface)
  try {
    renderer.viewportWidth = 1
    renderer.viewportHeight = 1
    renderer.dpr = 1
    await renderer.loadFonts()
    const restore = await renderer.prepareForExport(
      document.graph,
      document.pageId,
      document.nodeIds
    )
    try {
      return expectDefined(
        renderNodesToImage(ck, renderer, document.graph, document.pageId, document.nodeIds, {
          scale: 1,
          format: 'PNG'
        }),
        'isolated render'
      )
    } finally {
      restore()
    }
  } finally {
    renderer.destroy()
  }
}

beforeAll(async () => {
  ck = await initCanvasKit()
})

describe('headless render isolation', () => {
  test('a document is not painted from the previous document caches', async () => {
    const first = buildDocument(RED, [
      [0, 0],
      [50, 0],
      [50, 50],
      [0, 50]
    ])
    const second = buildDocument(BLUE, [
      [25, 0],
      [50, 50],
      [0, 50]
    ])
    expect(second.nodeIds).toEqual(first.nodeIds)

    const firstShared = await headlessRenderNodes(first.graph, first.pageId, first.nodeIds)
    const secondShared = await headlessRenderNodes(second.graph, second.pageId, second.nodeIds)

    expect(firstShared).toEqual(await renderIsolated(first))
    expect(secondShared).toEqual(await renderIsolated(second))
    expect(secondShared).not.toEqual(firstShared)
  })

  test('clearDocumentCaches empties every cache keyed by node id or image hash', async () => {
    const document = buildDocument(RED, [
      [0, 0],
      [50, 0],
      [50, 50]
    ])
    const surface = expectDefined(ck.MakeSurface(1, 1), 'surface')
    const renderer = new SkiaRenderer(ck, surface)
    try {
      await renderer.loadFonts()
      renderNodesToImage(ck, renderer, document.graph, document.pageId, document.nodeIds, {
        scale: 1,
        format: 'PNG'
      })
      expect(renderer.imageCache.size).toBeGreaterThan(0)
      expect(renderer.vectorPathCache.size).toBeGreaterThan(0)

      renderer.clearDocumentCaches()
      expect(renderer.imageCache.size).toBe(0)
      expect(renderer.vectorPathCache.size).toBe(0)
      expect(renderer.vectorStrokePathCache.size).toBe(0)
      expect(renderer.fillGeometryCache.size).toBe(0)
      expect(renderer.strokeGeometryCache.size).toBe(0)
      expect(renderer.nodePictureCache.size).toBe(0)
      expect(renderer.textPictureGenerations.size).toBe(0)
      expect(renderer.pendingFontNodes.size).toBe(0)

      // The renderer keeps working after the purge.
      expect(
        renderNodesToImage(ck, renderer, document.graph, document.pageId, document.nodeIds, {
          scale: 1,
          format: 'PNG'
        })
      ).not.toBeNull()
    } finally {
      renderer.destroy()
    }
  })
})
