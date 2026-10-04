import { expect, test, useEditorSetupWithClear } from '#tests/e2e/fixtures'

const editor = useEditorSetupWithClear('/?test&no-chrome&no-rulers')

/**
 * A gradient stroke used to draw opaque black, because a stroke could only hold one color.
 * The strokes are heavy so the ring crosses each gradient's falloff: a radial or diamond
 * gradient is near-uniform at a node's perimeter, so a thin ring would not tell them apart.
 */
test('gradient strokes', async () => {
  await editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const pageId = store.state.currentPageId
    const stops = [
      { color: { r: 0.96, g: 0.35, b: 0.12, a: 1 }, position: 0 },
      { color: { r: 0.23, g: 0.51, b: 0.96, a: 1 }, position: 1 }
    ]
    const kinds = [
      'GRADIENT_LINEAR',
      'GRADIENT_RADIAL',
      'GRADIENT_ANGULAR',
      'GRADIENT_DIAMOND'
    ] as const
    for (const [index, type] of kinds.entries()) {
      store.graph.createNode('RECTANGLE', pageId, {
        name: `${type} stroke visual`,
        x: 70 + index * 200,
        y: 80,
        width: 130,
        height: 130,
        fills: [],
        strokes: [
          {
            type,
            color: { r: 0, g: 0, b: 0, a: 1 },
            gradientStops: stops,
            gradientTransform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
            weight: 44,
            visible: true,
            opacity: 1,
            align: 'CENTER'
          }
        ]
      })
    }

    // A solid stroke beside them must be unaffected by the shader the others set.
    store.graph.createNode('RECTANGLE', pageId, {
      name: 'solid stroke visual',
      x: 70,
      y: 260,
      width: 130,
      height: 130,
      fills: [],
      strokes: [
        {
          type: 'SOLID',
          color: { r: 0.13, g: 0.72, b: 0.33, a: 1 },
          weight: 16,
          visible: true,
          opacity: 1,
          align: 'CENTER'
        }
      ]
    })

    store.clearSelection()
    store.requestRender()
  })
  await editor.canvas.waitForRender()
  editor.canvas.assertNoErrors()
  const buffer = await editor.canvas.screenshotCanvasRegion()
  expect(buffer).toMatchSnapshot('gradient-strokes.png')
})
