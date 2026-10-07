import { onScopeDispose, ref } from 'vue'

import type { Editor } from '@open-pencil/core/editor'
import type { SceneNode } from '@open-pencil/scene-graph'

import type { LayerNode } from '#vue/primitives/LayerTree/context'
import {
  buildLayerTreeModel,
  indexLayerNodes,
  patchLayerNode
} from '#vue/primitives/LayerTree/model'

const PATCHABLE_NODE_KEYS = new Set<keyof SceneNode>([
  'name',
  'type',
  'layoutMode',
  'visible',
  'locked'
])

/**
 * Keeps the layer tree items and expansion state in sync with the editor's current page.
 * Call inside a component setup or an effect scope; subscriptions stop with the scope.
 */
export function useLayerTreeModel(editor: Editor) {
  const items = ref<LayerNode[]>([])
  const expanded = ref<string[]>([])
  const treeVersion = ref(0)
  let nodesById = new Map<string, LayerNode>()
  let rebuildPending = false
  let rebuildToken = 0

  function expandNode(id: string) {
    if (!expanded.value.includes(id)) expanded.value = [...expanded.value, id]
  }

  function rebuildTree() {
    rebuildPending = false
    rebuildToken++
    const model = buildLayerTreeModel(editor.graph, editor.state.currentPageId)
    items.value = model.items
    // Index the reactive items, not the raw model: patches must notify the rows that read them.
    nodesById = indexLayerNodes(items.value)
    expanded.value = expanded.value.filter((id) => nodesById.has(id))
    treeVersion.value++
  }

  function scheduleTreeRebuild() {
    if (rebuildPending) return
    rebuildPending = true
    const token = ++rebuildToken
    queueMicrotask(() => {
      if (!rebuildPending || token !== rebuildToken) return
      rebuildTree()
    })
  }

  function patchTreeNode(id: string, changes: Partial<SceneNode>) {
    if ('childIds' in changes || 'parentId' in changes) {
      rebuildTree()
      return
    }
    if (
      !(Object.keys(changes) as (keyof SceneNode)[]).some((key) => PATCHABLE_NODE_KEYS.has(key))
    ) {
      return
    }
    const target = nodesById.get(id)
    const source = editor.graph.getNode(id)
    if (target && source) patchLayerNode(target, source)
  }

  function expandAncestors(ids: readonly string[]) {
    const next = new Set(expanded.value)
    for (const id of ids) {
      let node = editor.graph.getNode(id)
      while (node?.parentId && node.parentId !== editor.state.currentPageId) {
        next.add(node.parentId)
        node = editor.graph.getNode(node.parentId)
      }
    }
    if (next.size !== expanded.value.length) expanded.value = [...next]
  }

  /** A selected layer moved into a collapsed container would drop out of the visible rows. */
  function revealReparentedSelection(nodeId: string) {
    scheduleTreeRebuild()
    const moved = [...editor.state.selectedIds].filter((id) =>
      editor.graph.isDescendant(id, nodeId)
    )
    if (moved.length > 0) expandAncestors(moved)
  }

  rebuildTree()

  const unsubscribe = [
    editor.onEditorEvent('graph:replaced', rebuildTree),
    editor.onEditorEvent('page:changed', rebuildTree),
    editor.onEditorEvent('node:created', scheduleTreeRebuild),
    editor.onEditorEvent('node:deleted', scheduleTreeRebuild),
    editor.onEditorEvent('node:reparented', revealReparentedSelection),
    editor.onEditorEvent('node:reordered', scheduleTreeRebuild),
    editor.onEditorEvent('node:updated', patchTreeNode)
  ]

  onScopeDispose(() => {
    for (const stop of unsubscribe) stop()
  })

  return { items, expanded, treeVersion, expandNode, expandAncestors }
}
