import { describe, expect, test } from 'bun:test'

import { computed, effectScope } from 'vue'

import { createEditor, type Editor } from '@open-pencil/core/editor'

import { useLayerTreeModel } from '#vue/primitives/LayerTree/useLayerTreeModel'

function mountTree(editor: Editor) {
  const scope = effectScope()
  const tree = scope.run(() => useLayerTreeModel(editor))
  if (!tree) throw new Error('Expected layer tree model')
  return { tree, stop: () => scope.stop() }
}

async function flushRebuild() {
  await Promise.resolve()
}

describe('layer tree model state', () => {
  test('readers of the tree items react to name, visibility, and lock changes', () => {
    const editor = createEditor()
    const page = editor.state.currentPageId
    const frame = editor.graph.createNode('FRAME', page, { name: 'Frame' })
    const child = editor.graph.createNode('RECTANGLE', frame.id, { name: 'Child' })
    const { tree, stop } = mountTree(editor)
    try {
      const rows = computed(() => {
        const [root] = tree.items.value
        const nested = root.children?.[0]
        return [
          `${root.name}:${root.visible}:${root.locked}`,
          `${nested?.name}:${nested?.visible}:${nested?.locked}`
        ]
      })
      expect(rows.value).toEqual(['Frame:true:false', 'Child:true:false'])

      editor.toggleNodeVisibility(child.id)
      expect(rows.value).toEqual(['Frame:true:false', 'Child:false:false'])
      editor.toggleNodeLock(frame.id)
      expect(rows.value).toEqual(['Frame:true:true', 'Child:false:false'])
      editor.renameNode(child.id, 'Renamed')
      expect(rows.value).toEqual(['Frame:true:true', 'Renamed:false:false'])
      // Undo replays through the same graph events (lock, then visibility).
      editor.undoAction()
      editor.undoAction()
      expect(rows.value).toEqual(['Frame:true:false', 'Renamed:true:false'])
    } finally {
      stop()
      editor.dispose()
    }
  })

  test('expands the new ancestors when a selected layer is reparented', async () => {
    const editor = createEditor()
    const page = editor.state.currentPageId
    const outer = editor.graph.createNode('FRAME', page, { name: 'Outer' })
    const inner = editor.graph.createNode('FRAME', outer.id, { name: 'Inner' })
    const loose = editor.graph.createNode('RECTANGLE', page, { name: 'Loose' })
    const other = editor.graph.createNode('RECTANGLE', page, { name: 'Other' })
    const { tree, stop } = mountTree(editor)
    try {
      editor.select([loose.id])
      expect(tree.expanded.value).toEqual([])

      editor.graph.reparentNode(other.id, outer.id)
      await flushRebuild()
      expect(tree.expanded.value).toEqual([])

      editor.graph.reparentNode(loose.id, inner.id)
      await flushRebuild()
      expect(new Set(tree.expanded.value)).toEqual(new Set([outer.id, inner.id]))
    } finally {
      stop()
      editor.dispose()
    }
  })

  test('expands down to a selected layer whose ancestor is reparented', async () => {
    const editor = createEditor()
    const page = editor.state.currentPageId
    const target = editor.graph.createNode('FRAME', page, { name: 'Target' })
    const group = editor.graph.createNode('FRAME', page, { name: 'Moved' })
    const leaf = editor.graph.createNode('RECTANGLE', group.id, { name: 'Leaf' })
    const { tree, stop } = mountTree(editor)
    try {
      editor.select([leaf.id])
      tree.expanded.value = []
      editor.graph.reparentNode(group.id, target.id)
      await flushRebuild()
      expect(new Set(tree.expanded.value)).toEqual(new Set([target.id, group.id]))
    } finally {
      stop()
      editor.dispose()
    }
  })

  test('stops following the editor when its scope is disposed', async () => {
    const editor = createEditor()
    const { tree, stop } = mountTree(editor)
    try {
      stop()
      editor.graph.createNode('RECTANGLE', editor.state.currentPageId, {})
      await flushRebuild()
      expect(tree.items.value).toEqual([])
    } finally {
      editor.dispose()
    }
  })
})
