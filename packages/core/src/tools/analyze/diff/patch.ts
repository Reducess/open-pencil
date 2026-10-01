import { createTwoFilesPatch, FILE_HEADERS_ONLY, parsePatch } from 'diff'

import type { SceneGraph } from '@open-pencil/scene-graph'

import { serializeNodeProps } from './props'

export const DEFAULT_DIFF_DEPTH = 10

interface TreeEntry {
  id: string
  serialized: string
}

function collectInto(
  graph: SceneGraph,
  nodeId: string,
  path: string,
  depth: number,
  maxDepth: number,
  out: Map<string, TreeEntry>
): void {
  const node = graph.getNode(nodeId)
  if (!node) return
  out.set(path, { id: node.id, serialized: serializeNodeProps(node) })
  if (depth >= maxDepth) return
  // Number same-named siblings so each diffs against its counterpart, not its namesake.
  const seen = new Map<string, number>()
  for (const childId of node.childIds) {
    const child = graph.getNode(childId)
    if (!child) continue
    const count = (seen.get(child.name) ?? 0) + 1
    seen.set(child.name, count)
    const name = count > 1 ? `${child.name}[${count}]` : child.name
    collectInto(graph, childId, `${path}/${name}`, depth + 1, maxDepth, out)
  }
}

/**
 * Serialize a subtree keyed by name path, so two trees can be matched without shared IDs.
 * `rootName` lets a renamed copy still match the original's paths.
 */
export function collectNodeTree(
  graph: SceneGraph,
  nodeId: string,
  maxDepth = DEFAULT_DIFF_DEPTH,
  rootName?: string
): Map<string, TreeEntry> {
  const out = new Map<string, TreeEntry>()
  const node = graph.getNode(nodeId)
  if (node) collectInto(graph, nodeId, `/${rootName ?? node.name}`, 0, maxDepth, out)
  return out
}

function fileName(path: string, id: string): string {
  return `${path} #${id}`
}

/** One node's patch. A missing side is `/dev/null`, as `git diff` writes an added or removed file. */
function unifiedDiff(
  oldName: string,
  newName: string,
  oldText: string | null,
  newText: string | null
): string {
  return createTwoFilesPatch(
    oldText === null ? '/dev/null' : oldName,
    newText === null ? '/dev/null' : newName,
    oldText === null ? '' : `${oldText}\n`,
    newText === null ? '' : `${newText}\n`,
    undefined,
    undefined,
    { context: Number.MAX_SAFE_INTEGER, headerOptions: FILE_HEADERS_ONLY }
  ).trim()
}

/** Unified diff between two serialized trees; `null` when they match. */
export function diffTrees(from: Map<string, TreeEntry>, to: Map<string, TreeEntry>): string | null {
  const patches: string[] = []
  for (const path of new Set([...from.keys(), ...to.keys()])) {
    const before = from.get(path)
    const after = to.get(path)
    if (before?.serialized === after?.serialized) continue
    const id = after?.id ?? before?.id ?? ''
    patches.push(
      unifiedDiff(
        fileName(path, before?.id ?? id),
        fileName(path, id),
        before?.serialized ?? null,
        after?.serialized ?? null
      )
    )
  }
  return patches.length > 0 ? patches.join('\n') : null
}

/** Unified diff of one node's current and proposed property text. */
export function diffNodeText(path: string, id: string, before: string, after: string) {
  return before === after
    ? null
    : unifiedDiff(fileName(path, id), fileName(path, id), before, after)
}

export interface NodePatch {
  path: string
  /** The node the patch applies to: the `---` side, or the `+++` side for a creation. */
  nodeId: string | null
  kind: 'modify' | 'create' | 'delete'
  /** Lines the node must currently have (removed and context lines). */
  oldText: string
  newText: string
}

function parseFileName(name: string): { path: string; nodeId: string | null } {
  const match = /^(.*) #([^\s#]+)$/.exec(name.trim())
  return match ? { path: match[1], nodeId: match[2] } : { path: name.trim(), nodeId: null }
}

function patchKind(oldFile: string, newFile: string): NodePatch['kind'] {
  if (oldFile === '/dev/null') return 'create'
  if (newFile === '/dev/null') return 'delete'
  return 'modify'
}

export function parseNodePatch(text: string): NodePatch[] {
  return parsePatch(text)
    .filter((file) => file.hunks.length > 0)
    .map((file) => {
      const kind = patchKind(file.oldFileName, file.newFileName)
      const { path, nodeId } = parseFileName(
        kind === 'create' ? file.newFileName : file.oldFileName
      )
      const oldLines: string[] = []
      const newLines: string[] = []
      for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
          const body = line.slice(1)
          if (line.startsWith('-')) oldLines.push(body)
          else if (line.startsWith('+')) newLines.push(body)
          else if (line.startsWith(' ')) {
            oldLines.push(body)
            newLines.push(body)
          }
        }
      }
      return { path, nodeId, kind, oldText: oldLines.join('\n'), newText: newLines.join('\n') }
    })
}
