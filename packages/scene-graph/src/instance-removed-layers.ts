import type { SceneGraph, SceneNode } from './'
import { getInstanceOverride, type InstanceOverrideState } from './instance-overrides'

/** A layer taken out of an instance because its source layer left the component. */
interface RemovedInstanceLayer {
  /** The layer and everything under it, parents first. */
  nodes: SceneNode[]
  overrides: Map<string, Map<string, unknown>>
}

/**
 * Layers removed by sync, by instance parent and source layer. Undoing the deletion in the
 * component brings the source back under the same id, and the instance then gets its own layer
 * back — same ids, same overrides — instead of a fresh clone. Kept for the session only.
 */
const removedLayersByGraph = new WeakMap<SceneGraph, Map<string, RemovedInstanceLayer>>()

function removedLayerKey(instParentId: string, sourceId: string): string {
  return `${instParentId}\n${sourceId}`
}

function collectSubtree(graph: SceneGraph, rootId: string, into: SceneNode[]): void {
  const node = graph.nodes.get(rootId)
  if (!node) return
  into.push(structuredClone(node))
  for (const childId of node.childIds) collectSubtree(graph, childId, into)
}

/**
 * Removes the children of `instParent` whose source layer no longer exists. A child without a
 * source is something the instance holds on its own and stays.
 */
export function removeOrphanedChildren(
  graph: SceneGraph,
  instParent: SceneNode,
  overrides: InstanceOverrideState,
  usedInstChildIds: Set<string>
): void {
  for (const childId of Array.from(instParent.childIds)) {
    const child = graph.nodes.get(childId)
    if (!child || usedInstChildIds.has(childId)) continue
    const source = getInstanceOverride(overrides, instParent.id, childId, 'sourceComponentId')
    const sourceId = typeof source === 'string' ? source : child.componentId
    if (!sourceId || graph.nodes.has(sourceId)) continue

    const removed: RemovedInstanceLayer = { nodes: [], overrides: new Map() }
    collectSubtree(graph, childId, removed.nodes)
    for (const { id } of removed.nodes) {
      const fields = overrides.descendants.get(id)
      if (!fields) continue
      removed.overrides.set(id, fields)
      overrides.descendants.delete(id)
    }
    let removedLayers = removedLayersByGraph.get(graph)
    if (!removedLayers) {
      removedLayers = new Map()
      removedLayersByGraph.set(graph, removedLayers)
    }
    removedLayers.set(removedLayerKey(instParent.id, sourceId), removed)
    graph.deleteNode(childId)
  }
}

/** Puts back the layer sync removed for `sourceId`, if it did and its ids are still free. */
export function restoreRemovedChild(
  graph: SceneGraph,
  instParentId: string,
  sourceId: string,
  overrides: InstanceOverrideState
): SceneNode | undefined {
  const removedLayers = removedLayersByGraph.get(graph)
  const key = removedLayerKey(instParentId, sourceId)
  const removed = removedLayers?.get(key)
  if (!removed) return undefined
  removedLayers?.delete(key)
  if (removed.nodes.some((node) => graph.nodes.has(node.id))) return undefined

  for (const snapshot of removed.nodes) {
    const { parentId, childIds: _childIds, ...props } = snapshot
    if (parentId) graph.createNode(snapshot.type, parentId, props)
  }
  for (const [id, fields] of removed.overrides) overrides.descendants.set(id, fields)
  return graph.nodes.get(removed.nodes[0].id)
}
