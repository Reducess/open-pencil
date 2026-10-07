import { describe, expect, test } from 'bun:test'

import { createEditor } from '@open-pencil/core/editor'
import { computeAllLayouts } from '@open-pencil/core/layout'

import { getNodeOrThrow } from '#tests/helpers/assert'
import { rect } from '#tests/helpers/layout'

describe('structure state actions', () => {
  test('toggleNodeVisibility reflows HUG auto-layout instance slots', async () => {
    const editor = createEditor()
    const page = editor.state.currentPageId
    const component = editor.graph.createNode('COMPONENT', page, {
      layoutMode: 'VERTICAL',
      primaryAxisSizing: 'HUG',
      counterAxisSizing: 'FIXED',
      width: 300,
      height: 1,
      itemSpacing: 0
    })
    rect(editor.graph, component.id, 300, 40, { name: 'Slot / Pinned at Top' })
    rect(editor.graph, component.id, 300, 74, { name: 'Slot / Content' })
    rect(editor.graph, component.id, 300, 40, { name: 'Slot / Pinned at Bottom' })
    const instance = editor.graph.createInstance(component.id, page)
    if (!instance) throw new Error('Expected instance')
    computeAllLayouts(editor.graph, page)

    const content = editor.graph
      .getChildren(instance.id)
      .find((child) => child.name === 'Slot / Content')
    const bottom = editor.graph
      .getChildren(instance.id)
      .find((child) => child.name === 'Slot / Pinned at Bottom')
    if (!content || !bottom) throw new Error('Expected instance slot children')

    editor.toggleNodeVisibility(content.id)

    expect(getNodeOrThrow(editor.graph, instance.id).height).toBe(80)
    expect(getNodeOrThrow(editor.graph, bottom.id).y).toBe(40)

    await Promise.resolve()

    expect(getNodeOrThrow(editor.graph, instance.id).height).toBe(80)
    expect(getNodeOrThrow(editor.graph, bottom.id).y).toBe(40)
  })

  test('toggleNodeVisibility and toggleNodeLock are undoable', () => {
    const editor = createEditor()
    try {
      const node = editor.graph.createNode('RECTANGLE', editor.state.currentPageId, {})

      editor.toggleNodeVisibility(node.id)
      expect(node.visible).toBe(false)
      expect(editor.undo.undoLabel).toBe('Hide')
      editor.toggleNodeLock(node.id)
      expect(node.locked).toBe(true)
      expect(editor.undo.undoLabel).toBe('Lock')

      editor.undoAction()
      expect(node.locked).toBe(false)
      expect(node.visible).toBe(false)
      editor.undoAction()
      expect(node.visible).toBe(true)
      expect(editor.undo.canUndo).toBe(false)

      editor.redoAction()
      expect(node.visible).toBe(false)
      editor.redoAction()
      expect(node.locked).toBe(true)
    } finally {
      editor.dispose()
    }
  })

  test('undoing a visibility toggle reflows the auto-layout parent', () => {
    const editor = createEditor()
    try {
      const page = editor.state.currentPageId
      const frame = editor.graph.createNode('FRAME', page, {
        layoutMode: 'VERTICAL',
        primaryAxisSizing: 'HUG',
        counterAxisSizing: 'FIXED',
        width: 300,
        height: 1,
        itemSpacing: 0
      })
      const first = rect(editor.graph, frame.id, 300, 40)
      rect(editor.graph, frame.id, 300, 60)
      computeAllLayouts(editor.graph, page)
      expect(frame.height).toBe(100)

      editor.toggleNodeVisibility(first.id)
      expect(frame.height).toBe(60)
      editor.undoAction()
      expect(frame.height).toBe(100)
      editor.redoAction()
      expect(frame.height).toBe(60)
    } finally {
      editor.dispose()
    }
  })

  test('toggling the selection is one undo step', () => {
    const editor = createEditor()
    try {
      const page = editor.state.currentPageId
      const a = editor.graph.createNode('RECTANGLE', page, {})
      const b = editor.graph.createNode('RECTANGLE', page, { visible: false, locked: true })
      editor.select([a.id, b.id])

      editor.toggleVisibility()
      editor.toggleLock()
      expect([a.visible, b.visible, a.locked, b.locked]).toEqual([false, true, true, false])

      editor.undoAction()
      expect([a.visible, b.visible, a.locked, b.locked]).toEqual([false, true, false, true])
      editor.undoAction()
      expect([a.visible, b.visible]).toEqual([true, false])
      expect(editor.undo.canUndo).toBe(false)
    } finally {
      editor.dispose()
    }
  })
})
