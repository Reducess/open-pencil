import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'

import { textAutoResizeChanges } from '#core/editor/text/auto-resize'

function collectScope(graph: SceneGraph, scopeId: string | undefined): SceneNode[] {
  if (scopeId === undefined) return [...graph.nodes.values()]
  const scope: SceneNode[] = []
  const visit = (id: string) => {
    const node = graph.getNode(id)
    if (!node) return
    scope.push(node)
    for (const childId of node.childIds) visit(childId)
  }
  visit(scopeId)
  return scope
}

/**
 * Writes the current value of every bound FLOAT variable into the node field it is bound to
 * (radius, gap, padding, size, font size, line height, letter spacing…), for the whole document
 * or for the subtree under `scopeId`. Text that resizes with its content is measured again.
 *
 * Colour bindings are resolved while painting; scalar ones are read from the node fields by
 * layout and rendering, so they have to be brought up to date whenever a variable value, the
 * active mode or a node's mode scope changes. Returns the ids of the nodes it changed — the
 * caller runs layout for them.
 */
export function applyVariableBindings(graph: SceneGraph, scopeId?: string): string[] {
  const changedIds: string[] = []
  for (const node of collectScope(graph, scopeId)) {
    if (Object.keys(node.boundVariables).length === 0) continue
    const changes = graph.boundScalarChanges(node.id)
    if (Object.keys(changes).length === 0) continue
    graph.updateNode(node.id, { ...changes, ...textAutoResizeChanges(node, changes) })
    changedIds.push(node.id)
  }
  return changedIds
}
