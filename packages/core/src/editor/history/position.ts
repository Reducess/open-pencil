import type { Vector } from '@open-pencil/scene-graph/primitives'

import { createInstanceOverrideRecorder } from '#core/editor/instance-overrides'
import type { EditorContext } from '#core/editor/types'

export function collectNodePositions(
  ctx: EditorContext,
  ids: Iterable<string>
): Map<string, Vector> {
  const positions = new Map<string, Vector>()
  for (const id of ids) {
    const node = ctx.graph.getNode(id)
    if (node) positions.set(id, { x: node.x, y: node.y })
  }
  return positions
}

export function pushPositionUndo(
  ctx: EditorContext,
  label: string,
  originals: Map<string, Vector>,
  finals: Map<string, Vector>
): void {
  // A layer moved inside an instance stays where it was put when the main component changes.
  const { recordInstanceOverrides } = createInstanceOverrideRecorder(ctx)
  const overrides = [...finals].flatMap(([id, final]) => {
    const original = originals.get(id)
    const moved = [
      ...(original?.x === final.x ? [] : ['x']),
      ...(original?.y === final.y ? [] : ['y'])
    ]
    return recordInstanceOverrides(id, moved) ?? []
  })
  ctx.undo.push({
    label,
    forward: () => {
      applyPositions(ctx, finals)
      for (const recorded of overrides) recorded.redo()
    },
    inverse: () => {
      applyPositions(ctx, originals)
      for (const recorded of overrides) recorded.undo()
    }
  })
}

function applyPositions(ctx: EditorContext, positions: Map<string, Vector>): void {
  for (const [id, pos] of positions) {
    ctx.graph.updateNode(id, pos)
    ctx.runLayoutForNode(id)
  }
}
