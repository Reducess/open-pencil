import * as v from 'valibot'

import { sceneNodeToJSX } from '@open-pencil/design-jsx'
import type { SceneGraph } from '@open-pencil/scene-graph'

import { findPageId } from '#core/io/subgraph'
import { defineTool } from '#core/tools/schema'

import { diffPageLayersJSX, jsxPatch } from './jsx'

function layerJSX(graph: SceneGraph, id: string): string {
  return graph.getNode(id) ? sceneNodeToJSX(id, graph) : ''
}

export const diffChanges = defineTool({
  name: 'diff_changes',
  description:
    'JSX diff of what this run changed: a node, or the whole current page, compared with its page before the run first edited it. Same unified format as diff_jsx. Use it before reporting to confirm that only the intended layers changed.',
  execution: { kind: 'sync', mutation: 'none' },
  // Only an AI chat run records the state it started from.
  exposure: { mcp: false, webmcp: false },
  input: v.object({
    id: v.optional(v.pipe(v.string(), v.description('Node to compare (default: the current page)')))
  }),
  execute: (figma, args) => {
    if (!figma.changeBaseline) return { error: 'diff_changes is available only in an AI chat run' }
    const targetId = args.id ?? figma.currentPage.id
    // A node is compared with its own page's baseline; a removed one is looked up on this page.
    const pageId = args.id
      ? (findPageId(figma.graph, args.id) ?? figma.currentPage.id)
      : figma.currentPage.id
    const baseline = figma.changeBaseline(pageId)
    if (!baseline) return { diff: null, message: 'This run has not changed that page' }
    if (!baseline.getNode(targetId) && !figma.graph.getNode(targetId)) {
      return { error: `Node "${targetId}" not found` }
    }
    const diff =
      targetId === pageId
        ? diffPageLayersJSX(baseline, figma.graph, pageId)
            .map((layer) => layer.patch)
            .join('\n') || null
        : jsxPatch(
            targetId,
            targetId,
            layerJSX(baseline, targetId),
            layerJSX(figma.graph, targetId)
          )
    return diff === null ? { diff: null, message: 'No differences found' } : { diff }
  }
})
