import { safeDestr } from 'destr'
import { omit } from 'es-toolkit'
import * as v from 'valibot'

import { SceneGraph, type SceneNode } from '@open-pencil/scene-graph'
import type { Rect } from '@open-pencil/scene-graph/primitives'

import { FigmaAPI } from '#core/figma-api'
import { toolNumber, nodeIdInput, nodeComparisonInput } from '#core/tools/input'
import { defineTool } from '#core/tools/schema'

import {
  collectNodeTree,
  DEFAULT_DIFF_DEPTH,
  diffNodeText,
  diffTrees,
  parseNodePatch,
  type NodePatch
} from './patch'
import {
  applyNodeProps,
  diffNodeProps,
  findPropMismatches,
  parseNodeProps,
  serializeNodeProps
} from './props'

export const diffCreate = defineTool({
  name: 'diff_create',
  description:
    'Property diff between two node trees in unified diff format (size, position, fills, strokes, effects, radius, text). Children are matched by name path. The patch can be applied with diff_apply.',
  execution: { kind: 'sync', mutation: 'none' },
  input: v.object({
    ...nodeComparisonInput.entries,
    depth: v.optional(
      toolNumber(
        v.pipe(v.number(), v.description(`Max tree depth (default: ${DEFAULT_DIFF_DEPTH})`))
      )
    )
  }),
  execute: (figma, args) => {
    const fromNode = figma.graph.getNode(args.from)
    if (!fromNode) return { error: `Node "${args.from}" not found` }
    if (!figma.graph.getNode(args.to)) return { error: `Node "${args.to}" not found` }
    const depth = args.depth ?? DEFAULT_DIFF_DEPTH
    const diff = diffTrees(
      collectNodeTree(figma.graph, args.from, depth),
      collectNodeTree(figma.graph, args.to, depth, fromNode.name)
    )
    return diff === null ? { diff: null, message: 'No differences found' } : { diff }
  }
})

const showPropsSchema = v.object({
  x: v.optional(v.number()),
  y: v.optional(v.number()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  fill: v.optional(v.string()),
  stroke: v.optional(v.string()),
  strokeWeight: v.optional(v.number()),
  opacity: v.optional(v.number()),
  radius: v.optional(v.number()),
  rotation: v.optional(v.number()),
  blendMode: v.optional(v.string()),
  clipsContent: v.optional(v.boolean()),
  visible: v.optional(v.boolean()),
  locked: v.optional(v.boolean()),
  text: v.optional(v.string()),
  fontSize: v.optional(v.number()),
  fontFamily: v.optional(v.string()),
  fontWeight: v.optional(v.number())
})

type ShowProps = v.InferOutput<typeof showPropsSchema>

/** Translate friendly `diff_show` props into the diff's own property lines. */
function proposedChanges(props: ShowProps, current: Rect) {
  const changes = new Map<string, string[]>()
  const set = (key: string, value: string | number | boolean | undefined) => {
    if (value !== undefined) changes.set(key, [String(value)])
  }
  if (props.width !== undefined || props.height !== undefined) {
    set('size', `${props.width ?? current.width} ${props.height ?? current.height}`)
  }
  if (props.x !== undefined || props.y !== undefined) {
    set('pos', `${props.x ?? current.x} ${props.y ?? current.y}`)
  }
  set('fill', props.fill)
  set('stroke', props.stroke)
  set('strokeWeight', props.strokeWeight)
  set('opacity', props.opacity)
  set('radius', props.radius)
  set('rotation', props.rotation)
  set('blendMode', props.blendMode)
  set('clipsContent', props.clipsContent)
  set('visible', props.visible)
  set('locked', props.locked)
  if (props.text !== undefined) set('text', JSON.stringify(props.text))
  set('fontSize', props.fontSize)
  set('fontFamily', props.fontFamily)
  set('fontWeight', props.fontWeight)
  return changes
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Applies `changes` to a detached copy of `raw`, so errors surface without touching the document. */
function simulateNodeProps(
  raw: SceneNode,
  changes: Parameters<typeof applyNodeProps>[1]
): SceneNode {
  const scratch = new SceneGraph()
  const page = scratch.getPages()[0]
  scratch.createNodeWithId(raw.id, raw.type, page.id, {
    ...omit(structuredClone(raw), ['id', 'parentId', 'childIds'])
  })
  const copy = new FigmaAPI(scratch).getNodeById(raw.id)
  if (!copy) throw new Error(`Node "${raw.id}" could not be simulated`)
  applyNodeProps(copy, changes)
  const simulated = scratch.getNode(raw.id)
  if (!simulated) throw new Error(`Node "${raw.id}" could not be simulated`)
  return simulated
}

export const diffShow = defineTool({
  name: 'diff_show',
  description:
    'Preview what would change if properties were applied to a node, without changing it. Shows a unified diff of current vs proposed state.',
  execution: { kind: 'sync', mutation: 'none' },
  input: v.object({
    id: nodeIdInput,
    props: v.pipe(
      v.string(),
      v.description(
        'JSON object of new properties: x, y, width, height, fill, stroke, strokeWeight, opacity, radius, rotation, blendMode, clipsContent, visible, locked, text, fontSize, fontFamily, fontWeight. Example: \'{"opacity": 1, "fill": "#FF0000", "width": 200}\''
      )
    )
  }),
  execute: (figma, args) => {
    const raw = figma.graph.getNode(args.id)
    if (!raw) return { error: `Node "${args.id}" not found` }
    let parsed: unknown
    try {
      parsed = safeDestr(args.props, { strict: true })
    } catch {
      return { error: 'Invalid JSON in props' }
    }
    const result = v.safeParse(showPropsSchema, parsed)
    if (!result.success) return { error: `Invalid props: ${result.issues[0].message}` }

    // Simulate on a detached copy with the same code diff_apply uses.
    let simulated: SceneNode
    try {
      simulated = simulateNodeProps(raw, proposedChanges(result.output, raw))
    } catch (error) {
      return { error: errorMessage(error) }
    }

    const diff = diffNodeText(
      `/${raw.name}`,
      raw.id,
      serializeNodeProps(raw),
      serializeNodeProps(simulated)
    )
    return diff === null ? { diff: null, message: 'No changes' } : { diff }
  }
})

type ApplyStatus = 'applied' | 'deleted' | 'unchanged' | 'skipped' | 'failed'

interface ApplyResult {
  path: string
  id: string | null
  status: ApplyStatus
  changes?: string[]
  error?: string
}

function applyPatch(
  figma: FigmaAPI,
  patch: NodePatch,
  options: { dryRun: boolean; force: boolean }
): ApplyResult {
  const { path, nodeId: id } = patch
  if (patch.kind === 'create') {
    return {
      path,
      id,
      status: 'skipped',
      error: 'Creating nodes from a patch is not supported; use render or clone_node'
    }
  }
  if (!id) return { path, id, status: 'failed', error: 'Patch file name has no node ID' }
  const node = figma.getNodeById(id)
  const raw = figma.graph.getNode(id)
  if (!node || !raw) return { path, id, status: 'failed', error: `Node "${id}" not found` }

  const current = parseNodeProps(serializeNodeProps(raw))
  const expected = parseNodeProps(patch.oldText)
  const proposed = parseNodeProps(patch.newText)
  if (!options.force) {
    const mismatches = findPropMismatches(expected, current, proposed.keys())
    if (mismatches.length > 0) {
      const report = mismatches
        .map((item) => `${item.key}: expected ${item.expected}, found ${item.actual}`)
        .join('; ')
      return { path, id, status: 'failed', error: `Current state does not match: ${report}` }
    }
  }

  if (patch.kind === 'delete') {
    if (!options.dryRun) node.remove()
    return { path, id, status: 'deleted' }
  }

  const changes = diffNodeProps(expected, proposed)
  if (changes.size === 0) return { path, id, status: 'unchanged' }
  const keys = [...changes.keys()]
  try {
    // A dry run applies to a copy, so invalid values fail here rather than mid-patch.
    if (options.dryRun) simulateNodeProps(raw, changes)
    else applyNodeProps(node, changes)
  } catch (error) {
    return { path, id, status: 'failed', error: errorMessage(error) }
  }
  return { path, id, status: 'applied', changes: keys }
}

export const diffApply = defineTool({
  name: 'diff_apply',
  description:
    "Apply a patch produced by diff_create or diff_show. Each node must still match the patch's old values unless force is set; nodes removed in the patch are deleted. Use dryRun to validate first.",
  execution: { kind: 'sync', mutation: 'document' },
  input: v.object({
    patch: v.pipe(v.string(), v.description('Unified diff text from diff_create or diff_show')),
    dryRun: v.optional(
      v.pipe(v.boolean(), v.description('Validate and report changes without applying')),
      false
    ),
    force: v.optional(
      v.pipe(v.boolean(), v.description('Apply even when current values differ from the patch')),
      false
    )
  }),
  execute: (figma, args) => {
    // Edit before deleting, and delete children before their parents.
    const depth = (patch: NodePatch) => patch.path.split('/').length
    const patches = parseNodePatch(args.patch).sort((a, b) =>
      a.kind === 'delete' && b.kind === 'delete'
        ? depth(b) - depth(a)
        : Number(a.kind === 'delete') - Number(b.kind === 'delete')
    )
    if (patches.length === 0) return { error: 'No node patches found' }
    // Validate every node and value before changing any, so a patch never half-applies.
    // `force` skips only the comparison with the patch's old values.
    if (!args.dryRun) {
      const failed = patches
        .map((patch) => applyPatch(figma, patch, { dryRun: true, force: args.force }))
        .filter((result) => result.status === 'failed')
      if (failed.length > 0) return { error: 'Patch does not apply', results: failed }
    }
    const results = patches.map((patch) =>
      applyPatch(figma, patch, { dryRun: args.dryRun, force: args.force })
    )
    const count = (...statuses: ApplyStatus[]) =>
      results.filter((result) => statuses.includes(result.status)).length
    return {
      dryRun: args.dryRun,
      applied: count('applied', 'deleted'),
      failed: count('failed'),
      results
    }
  }
})
