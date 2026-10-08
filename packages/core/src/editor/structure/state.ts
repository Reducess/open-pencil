import { assertNodeEditable } from '#core/editor/capabilities'
import { createInstanceOverrideRecorder } from '#core/editor/instance-overrides'
import type { EditorContext } from '#core/editor/types'

export function createStructureStateActions(ctx: EditorContext) {
  const { recordInstanceOverrides } = createInstanceOverrideRecorder(ctx)

  function setNodeVisible(id: string, visible: boolean) {
    ctx.graph.updateNode(id, { visible })
    const parentId = ctx.graph.getNode(id)?.parentId
    if (parentId) ctx.runLayoutForNode(parentId)
  }

  function toggleNodeVisibility(id: string) {
    assertNodeEditable(ctx.graph, id)
    const node = ctx.graph.getNode(id)
    if (!node) return
    const visible = !node.visible
    setNodeVisible(id, visible)
    // A layer hidden or shown inside an instance keeps that state when the component changes.
    const overrides = recordInstanceOverrides(id, ['visible'])
    ctx.undo.push({
      label: visible ? 'Show' : 'Hide',
      forward: () => {
        setNodeVisible(id, visible)
        overrides?.redo()
      },
      inverse: () => {
        setNodeVisible(id, !visible)
        overrides?.undo()
      }
    })
  }

  function toggleNodeLock(id: string) {
    assertNodeEditable(ctx.graph, id)
    const node = ctx.graph.getNode(id)
    if (!node) return
    const locked = !node.locked
    ctx.graph.updateNode(id, { locked })
    ctx.undo.push({
      label: locked ? 'Lock' : 'Unlock',
      forward: () => ctx.graph.updateNode(id, { locked }),
      inverse: () => ctx.graph.updateNode(id, { locked: !locked })
    })
  }

  function toggleVisibility() {
    for (const id of ctx.state.selectedIds) assertNodeEditable(ctx.graph, id)
    ctx.undo.runBatch('Toggle visibility', () => {
      for (const id of ctx.state.selectedIds) toggleNodeVisibility(id)
    })
  }

  function toggleLock() {
    for (const id of ctx.state.selectedIds) assertNodeEditable(ctx.graph, id)
    ctx.undo.runBatch('Toggle lock', () => {
      for (const id of ctx.state.selectedIds) toggleNodeLock(id)
    })
  }

  return { toggleNodeVisibility, toggleNodeLock, toggleVisibility, toggleLock }
}
