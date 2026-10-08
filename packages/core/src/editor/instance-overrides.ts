import {
  cloneInstanceOverrideState,
  setInstanceOverride,
  type InstanceOverrideState
} from '@open-pencil/scene-graph'
import { instanceOverrideTargets } from '@open-pencil/scene-graph/instances'

import type { EditorContext } from './types'

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
   * Marks `fields` of `nodeId` as overridden on the instances they are overrides of (see
   * `instanceOverrideTargets`). Returns null when the node is not part of an instance or nothing
   * new was marked. The state is replaced, never mutated, so a node preview
   * captures the previous one and can cancel it.
   */
  function recordInstanceOverrides(
    nodeId: string,
    fields: Iterable<string>
  ): RecordedInstanceOverrides | null {
    const steps: Array<{
      instanceId: string
      before: InstanceOverrideState
      after: InstanceOverrideState
    }> = []
    for (const { instance, fields: owned } of instanceOverrideTargets(ctx.graph, nodeId, fields)) {
      const overridden =
        instance.id === nodeId
          ? instance.instanceOverrides.self
          : instance.instanceOverrides.descendants.get(nodeId)
      const fresh = owned.filter((field) => !overridden?.has(field))
      if (fresh.length === 0) continue

      const before = cloneInstanceOverrideState(instance.instanceOverrides)
      const after = cloneInstanceOverrideState(instance.instanceOverrides)
      for (const field of fresh) setInstanceOverride(after, instance.id, nodeId, field)
      apply(instance.id, after)
      steps.push({ instanceId: instance.id, before, after })
    }
    if (steps.length === 0) return null
    return {
      undo: () => {
        for (const step of steps) apply(step.instanceId, step.before)
      },
      redo: () => {
        for (const step of steps) apply(step.instanceId, step.after)
      }
    }
  }

  return { recordInstanceOverrides }
}
