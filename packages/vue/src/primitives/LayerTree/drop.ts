import type { Editor } from '@open-pencil/core/editor'

import type { LayerDragInstruction } from '#vue/primitives/LayerTree/context'

/**
 * Index among the target's siblings, with the dragged layer taken out, where a row dropped
 * above or below the target belongs. With `frontOnTop` the panel lists `childIds` backwards, so
 * a row above the target sits after it in the scene.
 */
export function layerDropIndex(
  siblingIds: readonly string[],
  sourceId: string,
  targetId: string,
  placement: 'reorder-above' | 'reorder-below',
  frontOnTop = false
): number {
  const targetIndex = siblingIds.filter((id) => id !== sourceId).indexOf(targetId)
  const afterTarget = (placement === 'reorder-below') !== frontOnTop
  return afterTarget ? targetIndex + 1 : targetIndex
}

/**
 * Applies a layer row dropped on another row. Returns the container that received the layer
 * when the drop nested it, so the caller can expand that row.
 */
export function applyLayerDrop(
  editor: Editor,
  sourceId: string,
  targetId: string,
  instruction: LayerDragInstruction,
  frontOnTop = false
): string | null {
  if (!sourceId || !targetId) return null
  if (editor.graph.isDescendant(targetId, sourceId)) return null

  const targetNode = editor.graph.getNode(targetId)
  if (!targetNode) return null

  if (instruction.type === 'make-child') {
    if (!editor.graph.isContainer(targetId)) return null
    editor.reorderChildWithUndo(sourceId, targetId, targetNode.childIds.length)
    return targetId
  }

  const targetParentId = targetNode.parentId ?? editor.state.currentPageId
  const targetParent = editor.graph.getNode(targetParentId)
  if (!targetParent) return null
  editor.reorderChildWithUndo(
    sourceId,
    targetParentId,
    layerDropIndex(targetParent.childIds, sourceId, targetId, instruction.type, frontOnTop)
  )
  return null
}
