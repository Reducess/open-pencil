import type { GUID, NodeChange } from '@open-pencil/kiwi/fig/codec'
import { guidToString } from '@open-pencil/kiwi/fig/guid'

import { findWithinBoundary, type TreeShape } from './tree'

/** A layer of one component set, by its position inside the variant that holds it. */
interface VariantLayer {
  readonly variantId: string
  readonly trail: readonly number[]
  readonly record: NodeChange
}

/** Archive records indexed by GUID, with children in saved order. */
export interface SourceIndex {
  readonly sources: ReadonlyMap<string, NodeChange>
  readonly children: ReadonlyMap<string, readonly NodeChange[]>
  /**
   * Addressable layers of each component set, built on first use. A set is scanned once
   * however many of its variants an archive addresses, and `null` marks an identity two
   * variants both answer to, which addresses nothing on its own.
   */
  readonly variantLayers: Map<string, ReadonlyMap<string, VariantLayer | null>>
}

/** A record's archive identity, or undefined for the rare record without a GUID. */
export function idOf(record: NodeChange): string | undefined {
  return record.guid ? guidToString(record.guid) : undefined
}

export function parentIdOf(record: NodeChange): string | undefined {
  return record.parentIndex?.guid ? guidToString(record.parentIndex.guid) : undefined
}

/** Records by identity, without the child ordering the full index also builds. */
export function indexRecords(changes: readonly NodeChange[]): Map<string, NodeChange> {
  const sources = new Map<string, NodeChange>()
  for (const change of changes) {
    const id = idOf(change)
    if (id !== undefined) sources.set(id, change)
  }
  return sources
}

/** Saved sibling order: the fractional position string, compared as text. */
export function bySavedPosition(a: NodeChange, b: NodeChange): number {
  const left = a.parentIndex?.position ?? ''
  const right = b.parentIndex?.position ?? ''
  if (left === right) return 0
  return left < right ? -1 : 1
}

export function createSourceIndex(changes: readonly NodeChange[]): SourceIndex {
  const sources = new Map<string, NodeChange>()
  const children = new Map<string, NodeChange[]>()
  for (const change of changes) {
    const id = idOf(change)
    if (id === undefined) continue
    if (sources.has(id)) throw new Error(`Duplicate source node ${id}`)
    sources.set(id, change)
    const parentId = parentIdOf(change)
    if (parentId === undefined) continue
    const siblings = children.get(parentId)
    if (siblings) siblings.push(change)
    else children.set(parentId, [change])
  }
  for (const siblings of children.values()) siblings.sort(bySavedPosition)
  return { sources, children, variantLayers: new Map() }
}

export function sameGuid(left: GUID | undefined, right: GUID): boolean {
  return left?.sessionID === right.sessionID && left.localID === right.localID
}

export function readOverrideKey(value: unknown): GUID | undefined {
  if (!value || typeof value !== 'object' || !('sessionID' in value) || !('localID' in value))
    return undefined
  if (typeof value.sessionID !== 'number' || typeof value.localID !== 'number') return undefined
  return { sessionID: value.sessionID, localID: value.localID }
}

/** A path segment addresses a record by GUID or by its stable override key. */
export function recordMatches(record: NodeChange, guid: GUID): boolean {
  return sameGuid(record.guid, guid) || sameGuid(readOverrideKey(record.overrideKey), guid)
}

export interface StaticMatch {
  count: number
  /** The single matching record, when exactly one exists. */
  record?: NodeChange
  /** The direct child whose subtree holds that record. */
  topChild?: NodeChange
}

/** Source records as a tree: children by saved order, instances as boundaries. */
export function recordTree({ children }: SourceIndex): TreeShape<NodeChange> {
  return {
    childrenOf: (record) => children.get(idOf(record) ?? '') ?? [],
    isInstance: (record) => record.symbolData?.symbolID !== undefined
  }
}

/**
 * Find a segment among a record's static descendants, searching through ordinary
 * containers but never into an instance.
 */
export function findStaticSegment(index: SourceIndex, parentId: string, guid: GUID): StaticMatch {
  const { count, match, top } = findWithinBoundary(
    index.children.get(parentId) ?? [],
    recordTree(index),
    (record) => recordMatches(record, guid)
  )
  return { count, record: match, topChild: top }
}

/** Child indices from `rootId` down to `record`, or undefined when it lies outside. */
function trailWithin(index: SourceIndex, rootId: string, record: NodeChange): number[] | undefined {
  const trail: number[] = []
  let current: NodeChange | undefined = record
  while (current) {
    const parentId = parentIdOf(current)
    if (parentId === undefined) return undefined
    const currentId = idOf(current)
    const at = (index.children.get(parentId) ?? []).findIndex((s) => idOf(s) === currentId)
    if (at === -1) return undefined
    trail.unshift(at)
    if (parentId === rootId) return trail
    current = index.sources.get(parentId)
    if (trail.length > 32) return undefined
  }
  return undefined
}

/** The component set `componentId` is a variant of, if it is one at all. */
function stateGroupOf(index: SourceIndex, componentId: string): string | undefined {
  const component = index.sources.get(componentId)
  const setId = component ? parentIdOf(component) : undefined
  if (!setId) return undefined
  return index.sources.get(setId)?.isStateGroup === true ? setId : undefined
}

/** Every layer a path segment can name in one component set, by the identity it names. */
function layersOfSet(index: SourceIndex, setId: string): ReadonlyMap<string, VariantLayer | null> {
  const known = index.variantLayers.get(setId)
  if (known) return known
  const layers = new Map<string, VariantLayer | null>()
  const declare = (id: string | undefined, layer: VariantLayer): void => {
    if (id === undefined) return
    // Two variants answering to one identity leave it ambiguous, as a search would.
    layers.set(id, layers.has(id) ? null : layer)
  }
  const visit = (variantId: string, record: NodeChange, trail: readonly number[]): void => {
    declare(idOf(record), { variantId, trail, record })
    declare(readOverrideKeyId(record), { variantId, trail, record })
    // A named layer ends its branch, and an instance's contents belong to another scope.
    if (record.symbolData?.symbolID !== undefined) return
    const id = idOf(record)
    if (id === undefined) return
    const children = index.children.get(id) ?? []
    for (const [at, child] of children.entries()) visit(variantId, child, [...trail, at])
  }
  for (const variant of index.children.get(setId) ?? []) {
    const variantId = idOf(variant)
    if (variantId === undefined) continue
    const children = index.children.get(variantId) ?? []
    for (const [at, child] of children.entries()) visit(variantId, child, [at])
  }
  index.variantLayers.set(setId, layers)
  return layers
}

function readOverrideKeyId(record: NodeChange): string | undefined {
  const key = readOverrideKey(record.overrideKey)
  return key ? guidToString(key) : undefined
}

/** The record `trail` reaches from `rootId`, following saved child order. */
function recordAtTrail(
  index: SourceIndex,
  rootId: string,
  trail: readonly number[]
): NodeChange | undefined {
  let scope = rootId
  let record: NodeChange | undefined
  for (const at of trail) {
    const siblings = index.children.get(scope) ?? []
    if (at >= siblings.length) return undefined
    record = siblings[at]
    scope = idOf(record) ?? ''
  }
  return record
}

/**
 * One component set's variants hold corresponding layers, so Figma keeps an override
 * recorded against one variant when an instance selects another. A segment naming a
 * sibling variant's layer therefore addresses the layer at the same position in
 * `componentId`, provided the two agree on type and name.
 */
export function correspondingSegment(
  index: SourceIndex,
  componentId: string,
  guid: GUID
): GUID | undefined {
  const setId = stateGroupOf(index, componentId)
  if (setId === undefined) return undefined
  const layer = layersOfSet(index, setId).get(guidToString(guid))
  if (!layer || layer.variantId === componentId) return undefined
  const corresponding = recordAtTrail(index, componentId, layer.trail)
  if (!corresponding) return undefined
  if (corresponding.type !== layer.record.type || corresponding.name !== layer.record.name)
    return undefined
  return readOverrideKey(corresponding.overrideKey) ?? corresponding.guid
}

/** Whether a path resolves in a component's own source tree, following raw instance links. */
export function resolvesInSourceComponent(
  index: SourceIndex,
  componentId: GUID,
  path: readonly GUID[]
): boolean {
  let sourceId = guidToString(componentId)
  for (const [position, segment] of path.entries()) {
    const source = index.sources.get(sourceId)
    if (!source) return false
    if (position === 0 && recordMatches(source, segment)) continue
    const { record } = findStaticSegment(index, sourceId, segment)
    if (!record) return false
    if (position === path.length - 1) return true
    if (!record.symbolData?.symbolID) return false
    sourceId = guidToString(record.symbolData.symbolID)
  }
  return false
}

/** Follow raw symbol references to the component definition an instance ultimately expands. */
export function terminalComponent(index: SourceIndex, id: string): string {
  let current = id
  const seen = new Set<string>()
  while (!seen.has(current)) {
    seen.add(current)
    const record = index.sources.get(current)
    if (record?.type !== 'INSTANCE' || !record.symbolData?.symbolID) return current
    current = guidToString(record.symbolData.symbolID)
  }
  return current
}
