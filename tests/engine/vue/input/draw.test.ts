import { describe, expect, test } from 'bun:test'

import { createEditor, type Editor, type Tool } from '@open-pencil/core/editor'
import { SceneGraph } from '@open-pencil/scene-graph'
import { getWorldMatrix } from '@open-pencil/scene-graph/coordinate'
import Matrix from '@open-pencil/scene-graph/matrix'

import { handleDrawMove, startShapeDraw, startTextDraw } from '#vue/shared/input/draw'
import type { DragState } from '#vue/shared/input/types'

function start(editor: Editor, tool: Tool = 'FRAME', x = 100, y = 100) {
  const state: { drag: DragState | null } = { drag: null }
  editor.setTool(tool)
  const setDrag = (drag: DragState) => {
    state.drag = drag
  }
  if (tool === 'TEXT') startTextDraw(x, y, editor, setDrag)
  else startShapeDraw(x, y, editor, setDrag)
  const drag = state.drag
  if (drag?.type !== 'draw') throw new Error('Expected drawing interaction')
  return drag
}

describe('draw creation previews', () => {
  test('graph replacement discards pending draw batches without replaying or deleting history', () => {
    const editor = createEditor()
    try {
      editor.createShape('RECTANGLE', 0, 0, 20, 20)
      const previousLabel = editor.undo.undoLabel
      const drag = start(editor)
      const graph = new SceneGraph()
      const node = graph.createNode('RECTANGLE', graph.getPages()[0].id, { x: 10 })
      editor.replaceGraph(graph)
      expect(editor.undo.isBatching).toBe(false)
      expect(editor.undo.undoLabel).toBe(previousLabel)
      drag.commit()
      editor.updateNodeWithUndo(node.id, { x: 50 }, 'New graph move')
      expect(editor.undo.undoLabel).toBe('New graph move')
      editor.undoAction()
      expect(node.x).toBe(10)
      expect(editor.undo.undoLabel).toBe(previousLabel)
    } finally {
      editor.dispose()
    }
  })
  test('is interactive immediately, previews geometry, and creates one undo step', () => {
    const editor = createEditor()
    try {
      const drag = start(editor)
      expect(editor.isInteractiveEditing()).toBe(true)
      const version = editor.state.sceneVersion
      let committed = 0
      editor.onEditorEvent('node:updated', () => {
        committed++
      })
      handleDrawMove(drag, 180, 150, false)
      handleDrawMove(drag, 220, 170, false)
      expect(editor.graph.getNode(drag.nodeId)).toMatchObject({
        x: 100,
        y: 100,
        width: 120,
        height: 70
      })
      expect(editor.state.sceneVersion).toBe(version)
      expect(committed).toBe(0)
      expect(editor.undo.canUndo).toBe(false)
      drag.commit()
      expect(editor.isInteractiveEditing()).toBe(false)
      expect(editor.undo.isBatching).toBe(false)
      expect(editor.state.activeTool).toBe('SELECT')
      editor.undoAction()
      expect(editor.graph.getNode(drag.nodeId)).toBeUndefined()
      expect(editor.undo.canUndo).toBe(false)
      editor.redoAction()
      expect(editor.graph.getNode(drag.nodeId)).toMatchObject({ width: 120, height: 70 })
      drag.cancel()
      expect(editor.graph.getNode(drag.nodeId)).toBeDefined()
    } finally {
      editor.dispose()
    }
  })

  test('cancel removes the provisional node, releases history, and ignores trailing input', () => {
    const editor = createEditor()
    try {
      const drag = start(editor)
      handleDrawMove(drag, 50, 70, true)
      expect(editor.graph.getNode(drag.nodeId)).toMatchObject({
        x: 50,
        y: 50,
        width: 50,
        height: 50
      })
      drag.cancel()
      drag.cancel()
      handleDrawMove(drag, 250, 250, false)
      drag.commit()
      expect(editor.graph.getNode(drag.nodeId)).toBeUndefined()
      expect(editor.undo.isBatching).toBe(false)
      expect(editor.undo.canUndo).toBe(false)
      expect(editor.isInteractiveEditing()).toBe(false)
    } finally {
      editor.dispose()
    }
  })

  test('click defaults and text box sizing survive the preview transaction', () => {
    for (const tool of ['FRAME', 'TEXT'] as const) {
      const editor = createEditor()
      try {
        const drag = start(editor, tool)
        drag.commit()
        const node = editor.graph.getNode(drag.nodeId)
        if (tool === 'FRAME') expect(node).toMatchObject({ width: 100, height: 100 })
        else expect(node).toMatchObject({ text: '', textAutoResize: 'WIDTH_AND_HEIGHT' })
        expect(editor.isInteractiveEditing()).toBe(false)
        expect(editor.undo.isBatching).toBe(false)
      } finally {
        editor.dispose()
      }
    }
    const editor = createEditor()
    try {
      const drag = start(editor, 'TEXT')
      handleDrawMove(drag, 300, 180, false)
      drag.commit()
      expect(editor.graph.getNode(drag.nodeId)).toMatchObject({
        width: 200,
        height: 80,
        textAutoResize: 'NONE'
      })
    } finally {
      editor.dispose()
    }
  })

  test('section adoption is included in the creation undo step', () => {
    const editor = createEditor()
    try {
      const page = editor.state.currentPageId
      const child = editor.graph.createNode('RECTANGLE', page, {
        x: 120,
        y: 120,
        width: 20,
        height: 20
      })
      const drag = start(editor, 'SECTION')
      handleDrawMove(drag, 300, 300, false)
      drag.commit()
      expect(child.parentId).toBe(drag.nodeId)
      editor.undoAction()
      expect(child.parentId).toBe(page)
      expect(child.x).toBe(120)
      expect(editor.graph.getNode(drag.nodeId)).toBeUndefined()
      expect(editor.undo.canUndo).toBe(false)
      editor.redoAction()
      expect(child.parentId).toBe(drag.nodeId)
      expect(editor.graph.getNode(drag.nodeId)?.width).toBe(200)
    } finally {
      editor.dispose()
    }
  })

  describe('drawing over a frame', () => {
    function worldCorners(editor: Editor, nodeId: string) {
      const node = editor.graph.getNode(nodeId)
      if (!node) throw new Error('Expected drawn node')
      const matrix = getWorldMatrix(node, editor.graph)
      return {
        start: Matrix.mapPoint(matrix, { x: 0, y: 0 }),
        end: Matrix.mapPoint(matrix, { x: node.width, y: node.height })
      }
    }

    test('creates the node inside the frame with parent-relative geometry', () => {
      for (const tool of ['RECTANGLE', 'FRAME', 'TEXT'] as const) {
        const editor = createEditor()
        try {
          const page = editor.state.currentPageId
          const frame = editor.graph.createNode('FRAME', page, {
            x: 40,
            y: 60,
            width: 400,
            height: 400
          })
          const drag = start(editor, tool)
          expect(editor.graph.getNode(drag.nodeId)).toMatchObject({
            parentId: frame.id,
            x: 60,
            y: 40
          })
          handleDrawMove(drag, 220, 170, false)
          expect(editor.graph.getNode(drag.nodeId)).toMatchObject({
            parentId: frame.id,
            x: 60,
            y: 40
          })
          handleDrawMove(drag, 70, 80, false)
          drag.commit()
          // A text box takes its dragged size on commit; shapes preview it live.
          expect(editor.graph.getNode(drag.nodeId)).toMatchObject({
            x: 30,
            y: 20,
            width: 30,
            height: 20
          })
          expect(frame.childIds).toContain(drag.nodeId)
          expect(editor.graph.getNode(page)?.childIds).not.toContain(drag.nodeId)
        } finally {
          editor.dispose()
        }
      }
    })

    test('undo and redo keep the drawn node in the frame', () => {
      const editor = createEditor()
      try {
        const frame = editor.graph.createNode('FRAME', editor.state.currentPageId, {
          x: 40,
          y: 60,
          width: 400,
          height: 400
        })
        const drag = start(editor, 'RECTANGLE')
        handleDrawMove(drag, 220, 170, false)
        drag.commit()
        editor.undoAction()
        expect(editor.graph.getNode(drag.nodeId)).toBeUndefined()
        expect(frame.childIds).toEqual([])
        expect(editor.undo.canUndo).toBe(false)
        editor.redoAction()
        expect(editor.graph.getNode(drag.nodeId)).toMatchObject({
          parentId: frame.id,
          x: 60,
          y: 40,
          width: 120,
          height: 70
        })
      } finally {
        editor.dispose()
      }
    })

    test('picks the innermost frame of the frontmost stack', () => {
      const editor = createEditor()
      try {
        const page = editor.state.currentPageId
        editor.graph.createNode('FRAME', page, { x: 0, y: 0, width: 500, height: 500 })
        const front = editor.graph.createNode('FRAME', page, {
          x: 50,
          y: 50,
          width: 300,
          height: 300
        })
        const inner = editor.graph.createNode('FRAME', front.id, {
          x: 20,
          y: 20,
          width: 200,
          height: 200
        })
        const group = editor.graph.createNode('GROUP', inner.id, {
          x: 10,
          y: 10,
          width: 100,
          height: 100
        })
        editor.graph.createNode('RECTANGLE', group.id, { x: 0, y: 0, width: 100, height: 100 })

        const nested = start(editor, 'RECTANGLE')
        expect(editor.graph.getNode(nested.nodeId)).toMatchObject({
          parentId: inner.id,
          x: 30,
          y: 30
        })
        nested.commit()

        const outside = start(editor, 'ELLIPSE', 320, 320)
        expect(editor.graph.getNode(outside.nodeId)).toMatchObject({
          parentId: front.id,
          x: 270,
          y: 270
        })
        outside.commit()
      } finally {
        editor.dispose()
      }
    })

    test('skips hidden and locked frames, and never nests a section in a frame', () => {
      const editor = createEditor()
      try {
        const page = editor.state.currentPageId
        const back = editor.graph.createNode('FRAME', page, { x: 0, y: 0, width: 500, height: 500 })
        const locked = editor.graph.createNode('FRAME', page, {
          x: 50,
          y: 50,
          width: 300,
          height: 300,
          locked: true
        })
        editor.graph.createNode('FRAME', locked.id, { x: 0, y: 0, width: 300, height: 300 })
        editor.graph.createNode('FRAME', page, {
          x: 50,
          y: 50,
          width: 300,
          height: 300,
          visible: false
        })

        const shape = start(editor, 'RECTANGLE')
        expect(editor.graph.getNode(shape.nodeId)?.parentId).toBe(back.id)
        shape.commit()

        const section = start(editor, 'SECTION')
        expect(editor.graph.getNode(section.nodeId)).toMatchObject({
          parentId: page,
          x: 100,
          y: 100
        })
        section.commit()
      } finally {
        editor.dispose()
      }
    })

    test('follows the pointer inside rotated and nested frames', () => {
      const editor = createEditor()
      try {
        // Whole pixels in a rotated parent are not whole pixels on the canvas.
        editor.state.snappingPreferences = { ...editor.state.snappingPreferences, pixelGrid: false }
        const page = editor.state.currentPageId
        const outer = editor.graph.createNode('FRAME', page, {
          x: 100,
          y: 100,
          width: 600,
          height: 600,
          rotation: 30
        })
        const inner = editor.graph.createNode('FRAME', outer.id, {
          x: 100,
          y: 100,
          width: 400,
          height: 400,
          rotation: -75,
          flipX: true
        })
        const drag = start(editor, 'RECTANGLE', 400, 400)
        expect(editor.graph.getNode(drag.nodeId)?.parentId).toBe(inner.id)
        handleDrawMove(drag, 430, 460, false)
        drag.commit()

        const node = editor.graph.getNode(drag.nodeId)
        expect(node?.rotation).toBe(0)
        const { start: first, end: last } = worldCorners(editor, drag.nodeId)
        const corners = [first, last].sort((a, b) => a.x - b.x)
        expect(corners[0].x).toBeCloseTo(400, 6)
        expect(corners[0].y).toBeCloseTo(400, 6)
        expect(corners[1].x).toBeCloseTo(430, 6)
        expect(corners[1].y).toBeCloseTo(460, 6)
      } finally {
        editor.dispose()
      }
    })
  })

  describe('pixel grid', () => {
    test('snaps creation position and size to whole pixels in the parent space', () => {
      const editor = createEditor()
      try {
        const frame = editor.graph.createNode('FRAME', editor.state.currentPageId, {
          x: 40.5,
          y: 60.25,
          width: 400,
          height: 400
        })
        const drag = start(editor, 'RECTANGLE', 100.4, 100.6)
        expect(editor.graph.getNode(drag.nodeId)).toMatchObject({
          parentId: frame.id,
          x: 60,
          y: 40
        })
        handleDrawMove(drag, 220.3, 170.7, false)
        expect(editor.graph.getNode(drag.nodeId)).toMatchObject({
          x: 60,
          y: 40,
          width: 120,
          height: 70
        })
        handleDrawMove(drag, 70.2, 80.9, true)
        drag.commit()
        expect(editor.graph.getNode(drag.nodeId)).toMatchObject({
          x: 30,
          y: 10,
          width: 30,
          height: 30
        })
      } finally {
        editor.dispose()
      }
    })

    test('keeps sub-pixel geometry when the preference is off', () => {
      const editor = createEditor()
      try {
        editor.state.snappingPreferences = { ...editor.state.snappingPreferences, pixelGrid: false }
        const drag = start(editor, 'RECTANGLE', 100.4, 100.6)
        handleDrawMove(drag, 220.5, 170.75, false)
        drag.commit()
        const node = editor.graph.getNode(drag.nodeId)
        expect(node?.x).toBeCloseTo(100.4, 9)
        expect(node?.y).toBeCloseTo(100.6, 9)
        expect(node?.width).toBeCloseTo(120.1, 9)
        expect(node?.height).toBeCloseTo(70.15, 9)
      } finally {
        editor.dispose()
      }
    })

    test('snaps the click position of point text', () => {
      const editor = createEditor()
      try {
        const drag = start(editor, 'TEXT', 12.7, 48.2)
        drag.commit()
        expect(editor.graph.getNode(drag.nodeId)).toMatchObject({ x: 13, y: 48 })
      } finally {
        editor.dispose()
      }
    })
  })
})
