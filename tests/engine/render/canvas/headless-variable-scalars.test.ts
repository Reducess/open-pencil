import { beforeAll, describe, expect, test } from 'bun:test'

import { headlessRenderNodes, initCanvasKit, SceneGraph } from '@open-pencil/core'
import type { Fill } from '@open-pencil/scene-graph'

import { expectDefined } from '#tests/helpers/assert'

let ck: Awaited<ReturnType<typeof initCanvasKit>>

const solid = (r: number, g: number, b: number): Fill => ({
  type: 'SOLID',
  color: { r, g, b, a: 1 },
  opacity: 1,
  visible: true
})
const WHITE = [255, 255, 255, 255]
const RED = [255, 0, 0, 255]
const BLUE = [0, 0, 255, 255]

/** A white 120x40 row holding a red and a blue 20x20 square; gap and red radius are variables. */
function buildDocument() {
  const graph = new SceneGraph()
  const pageId = graph.getPages()[0].id
  graph.addCollection({
    id: 'sizes',
    name: 'Sizes',
    modes: [
      { modeId: 'compact', name: 'Compact' },
      { modeId: 'roomy', name: 'Roomy' }
    ],
    defaultModeId: 'compact',
    variableIds: []
  })
  for (const [id, compact, roomy] of [
    ['gap', 0, 40],
    ['radius', 0, 10]
  ] as const) {
    graph.addVariable({
      id,
      name: id,
      type: 'FLOAT',
      collectionId: 'sizes',
      valuesByMode: { compact, roomy },
      description: '',
      hiddenFromPublishing: false
    })
  }
  const row = graph.createNode('FRAME', pageId, {
    width: 120,
    height: 40,
    layoutMode: 'HORIZONTAL',
    primaryAxisSizing: 'FIXED',
    counterAxisSizing: 'FIXED',
    itemSpacing: 0,
    fills: [solid(1, 1, 1)],
    boundVariables: { itemSpacing: 'gap' }
  })
  graph.createNode('RECTANGLE', row.id, {
    width: 20,
    height: 20,
    fills: [solid(1, 0, 0)],
    boundVariables: { cornerRadius: 'radius' }
  })
  graph.createNode('RECTANGLE', row.id, { width: 20, height: 20, fills: [solid(0, 0, 1)] })
  return { graph, pageId, row }
}

function pixelReader(png: Uint8Array) {
  const image = expectDefined(ck.MakeImageFromEncoded(png), 'decoded png')
  const width = image.width()
  const pixels = expectDefined(
    image.readPixels(0, 0, {
      alphaType: ck.AlphaType.Unpremul,
      colorType: ck.ColorType.RGBA_8888,
      colorSpace: ck.ColorSpace.SRGB,
      width,
      height: image.height()
    }),
    'pixels'
  )
  image.delete()
  return (x: number, y: number) => [...pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4)]
}

async function render(document: ReturnType<typeof buildDocument>) {
  return expectDefined(
    await headlessRenderNodes(document.graph, document.pageId, [document.row.id]),
    'render'
  )
}

beforeAll(async () => {
  ck = await initCanvasKit()
})

describe('headless render of scalar variable bindings', () => {
  test('the same document renders each mode with its own gap and radius', async () => {
    const document = buildDocument()

    const compact = await render(document)
    const compactAt = pixelReader(compact)
    // Gap 0: the blue square touches the red one. Radius 0: the red corner is painted.
    expect(compactAt(0, 0)).toEqual(RED)
    expect(compactAt(30, 10)).toEqual(BLUE)
    expect(compactAt(70, 10)).toEqual(WHITE)

    document.graph.setActiveMode('sizes', 'roomy')
    const roomy = await render(document)
    const roomyAt = pixelReader(roomy)
    // Gap 40: the blue square moves to x 60. Radius 10: the red corner shows the row behind.
    expect(roomyAt(0, 0)).toEqual(WHITE)
    expect(roomyAt(10, 10)).toEqual(RED)
    expect(roomyAt(30, 10)).toEqual(WHITE)
    expect(roomyAt(70, 10)).toEqual(BLUE)
    expect(roomy).not.toEqual(compact)

    document.graph.setActiveMode('sizes', 'compact')
    expect(await render(document)).toEqual(compact)
  })

  test('a mode pinned on a frame wins over the document mode', async () => {
    const document = buildDocument()
    document.graph.updateNode(document.row.id, { variableModes: { sizes: 'roomy' } })

    const at = pixelReader(await render(document))

    expect(at(0, 0)).toEqual(WHITE)
    expect(at(70, 10)).toEqual(BLUE)
  })
})
