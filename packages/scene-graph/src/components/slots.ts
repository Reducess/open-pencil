import type { SceneGraph } from '../index'
import type { SceneNode } from '../types'

/** The slot property a frame holds the content of, if it is a slot. */
export function slotPropertyId(node: SceneNode): string | undefined {
  return node.componentPropertyReferences.find((reference) => reference.field === 'SLOT_CONTENT')
    ?.propertyId
}

/**
 * Whether this slot frame's children belong to its instance rather than its component: the
 * nearest enclosing instance assigns the slot. Such content is never synced from the component.
 */
export function ownsSlotContent(graph: SceneGraph, node: SceneNode): boolean {
  const propertyId = slotPropertyId(node)
  if (!propertyId) return false
  let owner = node.parentId ? graph.nodes.get(node.parentId) : undefined
  while (owner && owner.type !== 'INSTANCE')
    owner = owner.parentId ? graph.nodes.get(owner.parentId) : undefined
  return !!owner && Object.hasOwn(owner.componentPropertyAssignments, propertyId)
}
