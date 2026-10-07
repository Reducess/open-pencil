import { describe, expect, test } from 'bun:test'

import { createEditor } from '@open-pencil/core/editor'
import { getWorldMatrix } from '@open-pencil/scene-graph/coordinate'
import Matrix from '@open-pencil/scene-graph/matrix'

describe('pen commit parent', () => {
  test('a path drawn over a rotated frame is created inside it and stays in place', () => {
    const editor = createEditor()
    try {
      const page = editor.state.currentPageId
      const frame = editor.graph.createNode('FRAME', page, {
        x: 100,
        y: 100,
        width: 600,
        height: 600,
        rotation: 30
      })
      const points = [
        { x: 300, y: 300 },
        { x: 420, y: 330 },
        { x: 380, y: 450 }
      ]
      for (const point of points) editor.penAddVertex(point.x, point.y)
      editor.penCommit(false)

      const [id] = [...editor.state.selectedIds]
      const node = editor.graph.getNode(id)
      expect(node?.type).toBe('VECTOR')
      expect(node?.parentId).toBe(frame.id)
      expect(frame.childIds).toEqual([id])
      if (!node?.vectorNetwork) throw new Error('Expected a vector network')

      const matrix = getWorldMatrix(node, editor.graph)
      for (const [index, vertex] of node.vectorNetwork.vertices.entries()) {
        const world = Matrix.mapPoint(matrix, vertex)
        expect(world.x).toBeCloseTo(points[index].x, 6)
        expect(world.y).toBeCloseTo(points[index].y, 6)
      }

      editor.undoAction()
      expect(editor.graph.getNode(id)).toBeUndefined()
      expect(frame.childIds).toEqual([])
    } finally {
      editor.dispose()
    }
  })

  test('a path drawn on the empty page stays a page child in canvas space', () => {
    const editor = createEditor()
    try {
      editor.penAddVertex(10, 20)
      editor.penAddVertex(110, 60)
      editor.penCommit(false)
      const [id] = [...editor.state.selectedIds]
      expect(editor.graph.getNode(id)).toMatchObject({
        parentId: editor.state.currentPageId,
        x: 10,
        y: 20,
        width: 100,
        height: 40
      })
    } finally {
      editor.dispose()
    }
  })

  test('pen vertices follow the pixel grid preference', () => {
    const editor = createEditor()
    try {
      editor.penAddVertex(10.4, 20.6)
      editor.penAddVertex(110.2, 60.7)
      editor.penSetKnotPosition(120.6, 70.2)
      editor.penCommit(false)
      const [id] = [...editor.state.selectedIds]
      expect(editor.graph.getNode(id)).toMatchObject({ x: 10, y: 21, width: 111, height: 49 })

      editor.state.snappingPreferences = { ...editor.state.snappingPreferences, pixelGrid: false }
      editor.setTool('PEN')
      editor.penAddVertex(10.4, 20.6)
      editor.penAddVertex(110.2, 60.7)
      editor.penCommit(false)
      const [free] = [...editor.state.selectedIds]
      expect(editor.graph.getNode(free)?.x).toBeCloseTo(10.4, 9)
      expect(editor.graph.getNode(free)?.width).toBeCloseTo(99.8, 9)
    } finally {
      editor.dispose()
    }
  })
})
