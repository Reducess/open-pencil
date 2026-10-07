import { describe, expect, test } from 'bun:test'

import { createEditor } from '@open-pencil/core/editor'

function geometry(editor: ReturnType<typeof createEditor>, id: string) {
  const node = editor.graph.getNode(id)
  if (!node) throw new Error(`Missing node ${id}`)
  return { x: node.x, y: node.y, width: node.width, height: node.height }
}

describe('setLayoutMode undo', () => {
  test('undoing "add auto layout" puts the children back where they were', () => {
    const editor = createEditor()
    const page = editor.graph.getPages()[0]
    const frame = editor.graph.createNode('FRAME', page.id, { width: 400, height: 300 })
    const first = editor.graph.createNode('RECTANGLE', frame.id, {
      x: 120,
      y: 40,
      width: 80,
      height: 50
    })
    const second = editor.graph.createNode('RECTANGLE', frame.id, {
      x: 30,
      y: 200,
      width: 60,
      height: 70
    })
    const before = [geometry(editor, first.id), geometry(editor, second.id)]

    editor.setLayoutMode(frame.id, 'HORIZONTAL')
    const laidOut = [geometry(editor, first.id), geometry(editor, second.id)]
    expect(laidOut).not.toEqual(before)

    editor.undo.undo()
    expect(editor.graph.getNode(frame.id)?.layoutMode).toBe('NONE')
    expect([geometry(editor, first.id), geometry(editor, second.id)]).toEqual(before)
    expect(geometry(editor, frame.id)).toMatchObject({ width: 400, height: 300 })

    editor.undo.redo()
    expect(editor.graph.getNode(frame.id)?.layoutMode).toBe('HORIZONTAL')
    expect([geometry(editor, first.id), geometry(editor, second.id)]).toEqual(laidOut)
  })

  test('undoing it also restores a child size that the layout stretched', () => {
    const editor = createEditor()
    const page = editor.graph.getPages()[0]
    const frame = editor.graph.createNode('FRAME', page.id, { width: 400, height: 300 })
    const child = editor.graph.createNode('RECTANGLE', frame.id, {
      x: 20,
      y: 30,
      width: 80,
      height: 50,
      layoutAlignSelf: 'STRETCH'
    })
    const before = geometry(editor, child.id)

    editor.setLayoutMode(frame.id, 'VERTICAL')
    editor.updateNodeWithUndo(
      frame.id,
      { counterAxisSizing: 'FIXED', width: 400 },
      'Keep frame width'
    )
    editor.undo.undo()
    editor.undo.undo()

    expect(geometry(editor, child.id)).toEqual(before)
  })
})
