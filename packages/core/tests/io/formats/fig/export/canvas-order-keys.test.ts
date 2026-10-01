import { expect, test } from 'bun:test'

import { exportFigFile } from '@open-pencil/core/io'
import { initCodec } from '@open-pencil/core/kiwi'
import { parseFigBuffer } from '@open-pencil/fig'
import { SceneGraph } from '@open-pencil/scene-graph'

/**
 * Figma orders siblings by `parentIndex.position`. Shared styles, variables and a canvas's
 * own layers are written in separate passes, and all three land on the internal canvas.
 */
test('every child of a canvas is exported with its own order key', async () => {
  await initCodec()
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  for (const name of ['One', 'Two', 'Three']) graph.createNode('FRAME', page.id, { name })
  const collection = graph.createCollection('Tokens')
  graph.createVariable('Accent', 'COLOR', collection.id, { r: 1, g: 0, b: 0, a: 1 })
  graph.createVariable('Spacing', 'FLOAT', collection.id, 8)

  const bytes = await exportFigFile(graph)
  const { nodeChanges } = parseFigBuffer(bytes.buffer as ArrayBuffer)
  const positionsByParent = new Map<string, string[]>()
  for (const change of nodeChanges) {
    const parent = change.parentIndex?.guid
    const position = change.parentIndex?.position
    if (!parent || position === undefined) continue
    const key = `${parent.sessionID}:${parent.localID}`
    positionsByParent.set(key, [...(positionsByParent.get(key) ?? []), position])
  }
  expect(positionsByParent.size).toBeGreaterThan(0)
  for (const [parent, positions] of positionsByParent)
    expect([parent, new Set(positions).size]).toEqual([parent, positions.length])
})
