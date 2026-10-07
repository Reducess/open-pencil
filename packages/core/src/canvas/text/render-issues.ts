import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'

import { collectNodeFontFaces } from '#core/text/requirements'

import type { NodeFontReadiness } from './index'

/**
 * A text node the renderer cannot draw with the fonts it asked for.
 *
 * - `pending`: a font is still loading; the node is left out of the frame until it settles.
 * - `substituted`: a face is unavailable and the default font stands in for it.
 * - `exhausted`: no font covers the node, or some of its glyphs; the node is left out of the
 *   render unless it carries a cached text picture or derived glyphs.
 */
export interface TextRenderIssue {
  nodeId: string
  nodeName: string
  readiness: Exclude<NodeFontReadiness, 'ready'>
  /** Every face the node asks for, base style and style runs. */
  fonts: Array<{ family: string; style: string }>
}

interface FontReadinessSource {
  nodeFontReadiness: (node: SceneNode) => NodeFontReadiness
}

/**
 * Lists the visible text nodes under `rootIds` whose fonts are not ready. Text with a missing
 * font or glyph is skipped by the renderer without an error, so callers that need a faithful
 * render ask here after preparing or drawing it.
 */
export function collectTextRenderIssues(
  r: FontReadinessSource,
  graph: SceneGraph,
  rootIds: string | readonly string[]
): TextRenderIssue[] {
  const issues: TextRenderIssue[] = []
  const visit = (nodeId: string) => {
    const node = graph.getNode(nodeId)
    if (!node || !node.visible) return
    if (node.type === 'TEXT' && node.text) {
      const readiness = r.nodeFontReadiness(node)
      if (readiness !== 'ready') {
        issues.push({
          nodeId: node.id,
          nodeName: node.name,
          readiness,
          fonts: collectNodeFontFaces(node)
        })
      }
    }
    for (const childId of node.childIds) visit(childId)
  }
  for (const rootId of typeof rootIds === 'string' ? [rootIds] : rootIds) visit(rootId)
  return issues
}
