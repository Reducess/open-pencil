import { cloneInstanceOverrideState } from '@open-pencil/scene-graph'
import type { SceneNode } from '@open-pencil/scene-graph'
import { deriveSlashVariantProperties } from '@open-pencil/scene-graph/variant-properties'

import { randomHex } from '#core/random'

import { createComponentFocusActions } from './components/focus'
import { createComponentInstanceActions } from './components/instances'
import { createComponentPropertyActions } from './components/properties'
import { createVariantActions } from './components/variants'
import type { EditorContext } from './types'

export function createComponentActions(ctx: EditorContext) {
  function createComponentFromSelection(
    selectedNodes: SceneNode[],
    wrapSelectionInContainer: (
      type: 'GROUP' | 'FRAME' | 'COMPONENT' | 'COMPONENT_SET',
      nodes: SceneNode[],
      extra?: Partial<SceneNode>
    ) => string | null
  ) {
    if (selectedNodes.length === 0) return

    const prevSelection = new Set(ctx.state.selectedIds)

    if (selectedNodes.length === 1) {
      const node = selectedNodes[0]
      const prevType = node.type

      if (node.type === 'COMPONENT') return

      if (node.type === 'FRAME' || node.type === 'GROUP') {
        ctx.graph.updateNode(node.id, { type: 'COMPONENT' })
        ctx.setSelectedIds(new Set([node.id]))
        ctx.undo.push({
          label: 'Create component',
          forward: () => {
            ctx.graph.updateNode(node.id, { type: 'COMPONENT' })
            ctx.setSelectedIds(new Set([node.id]))
          },
          inverse: () => {
            ctx.graph.updateNode(node.id, { type: prevType })
            ctx.setSelectedIds(prevSelection)
          }
        })
        return
      }
    }

    wrapSelectionInContainer('COMPONENT', selectedNodes)
  }

  function createComponentSetFromComponents(
    selectedNodes: SceneNode[],
    wrapSelectionInContainer: (
      type: 'GROUP' | 'FRAME' | 'COMPONENT' | 'COMPONENT_SET',
      nodes: SceneNode[],
      extra?: Partial<SceneNode>
    ) => string | null
  ) {
    if (selectedNodes.length < 2) return
    if (!selectedNodes.every((n) => n.type === 'COMPONENT')) return
    const containerId = wrapSelectionInContainer('COMPONENT_SET', selectedNodes)
    if (!containerId) return

    const derived = deriveSlashVariantProperties(selectedNodes, () => `prop:${randomHex(8)}`)
    if (!derived) return

    for (const [nodeId, changes] of derived.variants) {
      ctx.graph.updateNode(nodeId, changes)
    }
    ctx.graph.updateNode(containerId, { componentPropertyDefinitions: derived.definitions })
  }

  /**
   * Turns a main component back into a plain frame. Its instances cannot follow a frame, so
   * they are detached in the same step; one undo brings the component and its instances back.
   */
  function revertComponent(componentId: string): boolean {
    const component = ctx.graph.getNode(componentId)
    if (component?.type !== 'COMPONENT') return false
    const parent = component.parentId ? ctx.graph.getNode(component.parentId) : undefined
    // A variant only exists inside its component set.
    if (parent?.type === 'COMPONENT_SET') return false

    const instances = ctx.graph.getInstances(componentId).map((instance) => ({
      id: instance.id,
      instanceOverrides: cloneInstanceOverrideState(instance.instanceOverrides)
    }))
    const revert = () => {
      for (const instance of instances) ctx.graph.detachInstance(instance.id)
      ctx.graph.updateNode(componentId, { type: 'FRAME' })
      ctx.requestRender()
    }
    const restore = () => {
      ctx.graph.updateNode(componentId, { type: 'COMPONENT' })
      for (const instance of instances) {
        if (!ctx.graph.getNode(instance.id)) continue
        ctx.graph.updateNode(instance.id, {
          type: 'INSTANCE',
          componentId,
          instanceOverrides: cloneInstanceOverrideState(instance.instanceOverrides)
        })
      }
      ctx.requestRender()
    }
    revert()
    ctx.undo.push({ label: 'Revert component', forward: revert, inverse: restore })
    return true
  }

  const focusActions = createComponentFocusActions(ctx)
  const instanceActions = createComponentInstanceActions(ctx)
  const variantActions = createVariantActions(ctx)
  const componentPropertyActions = createComponentPropertyActions(
    ctx,
    variantActions.switchInstanceVariant
  )

  return {
    createComponentFromSelection,
    createComponentSetFromComponents,
    revertComponent,
    ...instanceActions,
    ...focusActions,
    ...variantActions,
    ...componentPropertyActions
  }
}
