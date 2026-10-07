import {
  cloneInstanceOverrideState,
  hasInstanceOverride,
  setInstanceOverride,
  type InstanceOverrideState
} from '@open-pencil/scene-graph'
import { findInstanceAncestor, INSTANCE_SYNC_FIELDS } from '@open-pencil/scene-graph/instances'

import type { EditorContext } from './types'

const SYNCED_FIELDS: ReadonlySet<string> = new Set(INSTANCE_SYNC_FIELDS)

export interface RecordedInstanceOverrides {
  /** Puts back the override state from before the edit. */
  undo: () => void
  /** Marks the fields as overridden again. */
  redo: () => void
}

/**
 * An edit made on an instance, or on a layer inside one, is an override: the next change to the
 * main component must not write over it. Component sync skips the fields listed in the owning
 * instance's `instanceOverrides`, so every user edit has to be listed there.
 */
export function createInstanceOverrideRecorder(ctx: EditorContext) {
  function apply(instanceId: string, state: InstanceOverrideState) {
    ctx.graph.updateNode(instanceId, { instanceOverrides: cloneInstanceOverrideState(state) })
  }

  /**
   * Marks `fields` of `nodeId` as overridden. Returns null when the node is not part of an
   * instance or nothing new was marked. The state is replaced, never mutated, so a node preview
   * captures the previous one and can cancel it.
   */
  function recordInstanceOverrides(
    nodeId: string,
    fields: Iterable<string>
  ): RecordedInstanceOverrides | null {
    const instance = findInstanceAncestor(ctx.graph, nodeId)
    if (!instance) return null
    const fresh = [...fields].filter(
      (field) => SYNCED_FIELDS.has(field) && !hasInstanceOverride(ctx.graph, nodeId, field)
    )
    if (fresh.length === 0) return null

    const instanceId = instance.id
    const before = cloneInstanceOverrideState(instance.instanceOverrides)
    const after = cloneInstanceOverrideState(instance.instanceOverrides)
    for (const field of fresh) setInstanceOverride(after, instanceId, nodeId, field)
    apply(instanceId, after)
    return { undo: () => apply(instanceId, before), redo: () => apply(instanceId, after) }
  }

  return { recordInstanceOverrides }
}
