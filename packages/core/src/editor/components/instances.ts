import { cloneInstanceOverrideState } from '@open-pencil/scene-graph'
import type { InstanceOverrideState, SceneNode, Vector } from '@open-pencil/scene-graph'
import { getAxisAlignedWorldBounds, getWorldMatrix } from '@open-pencil/scene-graph/coordinate'
import Matrix from '@open-pencil/scene-graph/matrix'

import { snapshotSubtree } from '#core/editor/clipboard/subtree-history'
import type { EditorContext } from '#core/editor/types'

/** Bookkeeping that maps a nested instance to its source layer; not something a user changed. */
const STRUCTURAL_OVERRIDE = 'sourceComponentId'

function hasUserOverrides(state: InstanceOverrideState): boolean {
  if (state.self.size > 0) return true
  for (const fields of state.descendants.values()) {
    for (const field of fields.keys()) if (field !== STRUCTURAL_OVERRIDE) return true
  }
  return false
}

function withoutUserOverrides(state: InstanceOverrideState): InstanceOverrideState {
  const descendants = new Map<string, Map<string, unknown>>()
  for (const [nodeId, fields] of state.descendants) {
    if (fields.has(STRUCTURAL_OVERRIDE)) {
      descendants.set(nodeId, new Map([[STRUCTURAL_OVERRIDE, fields.get(STRUCTURAL_OVERRIDE)]]))
    }
  }
  return { self: new Map(), descendants }
}

type InstanceCreateSnapshot = Partial<SceneNode> & { id: string }

function createInstanceSnapshot(instance: SceneNode): InstanceCreateSnapshot {
  const { childIds: _childIds, parentId: _parentId, type: _type, ...snapshot } = instance
  return snapshot
}

type DefaultInstancePlacement = {
  local: Vector
  world: Vector
}

function defaultInstancePlacement(
  ctx: EditorContext,
  component: SceneNode,
  parentId: string
): DefaultInstancePlacement {
  const bounds = getAxisAlignedWorldBounds(component, ctx.graph)
  const world = { x: bounds.x + bounds.width + 40, y: bounds.y }
  const parent = ctx.graph.getNode(parentId)
  if (!parent) return { local: world, world }
  const inverse = Matrix.invert(getWorldMatrix(parent, ctx.graph))
  return { local: inverse ? Matrix.mapPoint(inverse, world) : world, world }
}

function alignInstanceWorldBounds(
  ctx: EditorContext,
  instance: SceneNode,
  parentId: string,
  target: Vector
): void {
  const bounds = getAxisAlignedWorldBounds(instance, ctx.graph)
  const worldDelta = { x: target.x - bounds.x, y: target.y - bounds.y }
  const parent = ctx.graph.getNode(parentId)
  const inverse = parent ? Matrix.invert(getWorldMatrix(parent, ctx.graph)) : null
  if (!inverse) {
    ctx.graph.updateNode(instance.id, {
      x: instance.x + worldDelta.x,
      y: instance.y + worldDelta.y
    })
    return
  }
  const origin = Matrix.mapPoint(inverse, { x: 0, y: 0 })
  const delta = Matrix.mapPoint(inverse, worldDelta)
  ctx.graph.updateNode(instance.id, {
    x: instance.x + delta.x - origin.x,
    y: instance.y + delta.y - origin.y
  })
}

export function createComponentInstanceActions(ctx: EditorContext) {
  function createInstanceFromComponent(
    componentId: string,
    x?: number,
    y?: number,
    parentId = ctx.state.currentPageId
  ) {
    const component = ctx.graph.getNode(componentId)
    if (component?.type !== 'COMPONENT') return null

    const previousSelection = new Set(ctx.state.selectedIds)
    const defaultPlacement = defaultInstancePlacement(ctx, component, parentId)
    const instance = ctx.graph.createInstance(componentId, parentId, {
      x: x ?? defaultPlacement.local.x,
      y: y ?? defaultPlacement.local.y
    })
    if (!instance) return null
    if (x === undefined && y === undefined) {
      alignInstanceWorldBounds(ctx, instance, parentId, defaultPlacement.world)
    }

    const instanceId = instance.id
    const snapshot = createInstanceSnapshot(instance)
    ctx.setSelectedIds(new Set([instanceId]))

    ctx.undo.push({
      label: 'Create instance',
      forward: () => {
        ctx.graph.createInstance(componentId, parentId, { ...snapshot })
        ctx.setSelectedIds(new Set([instanceId]))
      },
      inverse: () => {
        ctx.graph.deleteNode(instanceId)
        ctx.setSelectedIds(new Set(previousSelection))
      }
    })
    return instanceId
  }

  function detachInstance(selectedNode: SceneNode | undefined) {
    if (selectedNode?.type !== 'INSTANCE') return

    const prevComponentId = selectedNode.componentId
    const previousOverrides = cloneInstanceOverrideState(selectedNode.instanceOverrides)

    ctx.graph.detachInstance(selectedNode.id)
    ctx.setSelectedIds(new Set([selectedNode.id]))

    ctx.undo.push({
      label: 'Detach instance',
      forward: () => {
        ctx.graph.detachInstance(selectedNode.id)
        ctx.requestRender()
      },
      inverse: () => {
        ctx.graph.updateNode(selectedNode.id, {
          type: 'INSTANCE',
          componentId: prevComponentId,
          instanceOverrides: cloneInstanceOverrideState(previousOverrides)
        })
      }
    })
  }

  /** True when the instance, or a layer inside it, differs from the component by a user edit. */
  function instanceHasOverrides(instanceId: string): boolean {
    const instance = ctx.graph.getNode(instanceId)
    return instance?.type === 'INSTANCE' && hasUserOverrides(instance.instanceOverrides)
  }

  /**
   * Drops every override of an instance: it goes back to what the main component says, its
   * layers' visibility included. Position and rotation are the instance's own and stay.
   */
  function resetInstanceOverrides(instanceId: string): boolean {
    const instance = ctx.graph.getNode(instanceId)
    const componentId = instance?.type === 'INSTANCE' ? instance.componentId : null
    if (!instance || !componentId || !ctx.graph.getNode(componentId)) return false

    const before = snapshotSubtree(ctx.graph, instanceId)
    const hiddenOrShown = [...before.values()].some((node) => {
      const source = node.id !== instanceId && node.componentId
      return source ? ctx.graph.getNode(source)?.visible !== node.visible : false
    })
    if (!hasUserOverrides(instance.instanceOverrides) && !hiddenOrShown) return false

    const reset = () => {
      const current = ctx.graph.getNode(instanceId)
      if (!current) return
      ctx.graph.updateNode(instanceId, {
        instanceOverrides: withoutUserOverrides(current.instanceOverrides)
      })
      ctx.graph.syncInstances(componentId)
      for (const id of snapshotSubtree(ctx.graph, instanceId).keys()) {
        const node = ctx.graph.getNode(id)
        const source = node && id !== instanceId && node.componentId
        const sourceNode = source ? ctx.graph.getNode(source) : undefined
        // Sync writes the fields straight on the node: publish them, with the visibility.
        if (node) ctx.graph.updateNode(id, { visible: sourceNode?.visible ?? node.visible })
      }
      ctx.runLayoutForNode(instanceId)
      ctx.requestRender()
    }

    const restore = () => {
      for (const id of snapshotSubtree(ctx.graph, instanceId).keys()) {
        if (!before.has(id)) ctx.graph.deleteNode(id)
      }
      for (const [id, snapshot] of before) {
        const {
          id: _id,
          parentId: _parentId,
          childIds: _childIds,
          type: _type,
          ...props
        } = snapshot
        if (ctx.graph.getNode(id)) ctx.graph.updateNode(id, structuredClone(props))
      }
      ctx.runLayoutForNode(instanceId)
      ctx.requestRender()
    }

    reset()
    ctx.undo.push({ label: 'Reset instance', forward: reset, inverse: restore })
    return true
  }

  return {
    createInstanceFromComponent,
    detachInstance,
    instanceHasOverrides,
    resetInstanceOverrides
  }
}
