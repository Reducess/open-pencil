import type { GUID } from '@open-pencil/kiwi/fig/codec'
import { guidToString } from '@open-pencil/kiwi/fig/guid'

import type { InstanceOccurrence, InstancePathDiagnostic } from './interpret'
import { sameGuid } from './source-index'
import { descendants, findWithinBoundary, type TreeShape } from './tree'

export const OCCURRENCE_TREE: TreeShape<InstanceOccurrence> = {
  childrenOf: (node) => node.children,
  isInstance: (node) => node.mainComponentId !== null
}

/** Every occurrence below and including `root`, including those inside nested instances. */
export function occurrences(root: InstanceOccurrence): Generator<InstanceOccurrence> {
  return descendants(root, (node) => node.children)
}

export class InstancePathError extends Error {
  constructor(
    readonly diagnostic: InstancePathDiagnostic,
    message: string
  ) {
    super(message)
    this.name = 'InstancePathError'
  }
}

export class SegmentError extends Error {
  constructor(
    readonly count: number,
    guid: GUID
  ) {
    super(`Expected one instance-path target for ${guidToString(guid)}; found ${count}`)
    this.name = 'SegmentError'
  }
}

export function pathError(
  ownerId: string,
  mainComponentId: string | null,
  path: readonly GUID[],
  cause: SegmentError
): InstancePathError {
  return new InstancePathError(
    {
      ownerId,
      mainComponentId,
      path: structuredClone(path),
      reason: cause.count === 0 ? 'missing-target' : 'ambiguous-target'
    },
    `Override declared by ${ownerId}, path [${path.map(guidToString).join(', ')}]: ${cause.message}`
  )
}

/**
 * Translate a segment that names no layer here into the one it corresponds to, for a
 * component whose set holds sibling variants. Supplied by the interpreter, which owns the
 * source index the correspondence is read from.
 */
export type SegmentTranslator = (owner: InstanceOccurrence, guid: GUID) => GUID | undefined

function matchSegment(root: InstanceOccurrence, guid: GUID) {
  const id = guidToString(guid)
  return findWithinBoundary(
    root.children,
    OCCURRENCE_TREE,
    (node) => sameGuid(node.overrideKey, guid) || node.sourceId === id
  )
}

/**
 * Search through ordinary containers, but never cross an instance boundary implicitly.
 * Returns the segment that found the target, which is the translated one when the
 * declared segment named a layer only a sibling variant has.
 */
function resolveSegment(
  root: InstanceOccurrence,
  guid: GUID,
  translate?: SegmentTranslator
): { target: InstanceOccurrence; segment: GUID } {
  const direct = matchSegment(root, guid)
  if (direct.match) return { target: direct.match, segment: guid }
  const corresponding = direct.count === 0 ? translate?.(root, guid) : undefined
  if (corresponding) {
    const fallback = matchSegment(root, corresponding)
    if (fallback.match) return { target: fallback.match, segment: corresponding }
  }
  throw new SegmentError(direct.count, guid)
}

export function findSegment(
  root: InstanceOccurrence,
  guid: GUID,
  translate?: SegmentTranslator
): InstanceOccurrence {
  return resolveSegment(root, guid, translate).target
}

export function isRootGuid(owner: InstanceOccurrence, guid: GUID): boolean {
  return (
    sameGuid(owner.properties.symbolData?.symbolID, guid) ||
    sameGuid(owner.mainComponentOverrideKey, guid) ||
    sameGuid(owner.sourceComponentOverrideKey, guid) ||
    sameGuid(owner.sourceComponentId, guid)
  )
}

/**
 * Resolve a declared path and report the path that reached the target. Recording the
 * resolved path keeps the claim addressable later, after translation replaced a segment.
 */
export function resolvePathSegments(
  owner: InstanceOccurrence,
  path: readonly GUID[],
  translate?: SegmentTranslator
): { target: InstanceOccurrence; path: GUID[] } {
  let target = owner
  const resolved: GUID[] = []
  for (const [index, guid] of path.entries()) {
    if (index === 0 && isRootGuid(owner, guid)) {
      resolved.push(guid)
      continue
    }
    const step = resolveSegment(target, guid, translate)
    target = step.target
    resolved.push(step.segment)
  }
  return { target, path: resolved }
}

export function resolveOccurrencePath(
  owner: InstanceOccurrence,
  path: readonly GUID[],
  translate?: SegmentTranslator
): InstanceOccurrence {
  return resolvePathSegments(owner, path, translate).target
}
