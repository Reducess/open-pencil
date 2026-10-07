import type { NodeType, SceneGraph, SceneNode } from '@open-pencil/scene-graph'
import { getNodeLocalMatrix, getWorldMatrix } from '@open-pencil/scene-graph/coordinate'
import Matrix, { type Mat3 } from '@open-pencil/scene-graph/matrix'
import type { Vector } from '@open-pencil/scene-graph/primitives'

export interface DrawParent {
  parentId: string
  /** Maps a canvas point into the parent's local coordinate space. */
  toLocal: (point: Vector) => Vector
}

/** Containers that adopt a node drawn over them. */
const DRAW_PARENT_TYPES = new Set<NodeType>(['FRAME', 'COMPONENT', 'SECTION'])
/** Containers searched for a nested draw parent without adopting the node themselves. */
const PASS_THROUGH_TYPES = new Set<NodeType>(['GROUP', 'COMPONENT_SET'])

function adopts(container: NodeType, drawn: NodeType): boolean {
  // Sections only live on the page or inside another section.
  if (drawn === 'SECTION') return container === 'SECTION'
  return DRAW_PARENT_TYPES.has(container)
}

function containsLocalPoint(node: SceneNode, point: Vector): boolean {
  return point.x >= 0 && point.x <= node.width && point.y >= 0 && point.y <= node.height
}

/**
 * Finds the innermost container of the frontmost stack under a canvas point, so a node drawn
 * there is created as its child. Hidden, locked, and read-only containers are skipped together
 * with their subtrees. Falls back to the page.
 */
export function findDrawParent(
  graph: SceneGraph,
  pageId: string,
  point: Vector,
  drawn: NodeType
): DrawParent {
  function search(parentId: string, parentMatrix: Mat3): DrawParent | null {
    const parent = graph.getNode(parentId)
    if (!parent) return null
    for (let i = parent.childIds.length - 1; i >= 0; i--) {
      const child = graph.getNode(parent.childIds[i])
      if (!child || child.internalOnly || !child.visible || child.locked) continue
      if (child.librarySource?.readOnly) continue
      const adopting = adopts(child.type, drawn)
      if (!adopting && !PASS_THROUGH_TYPES.has(child.type)) continue
      const matrix = Matrix.multiply(parentMatrix, getNodeLocalMatrix(child))
      const inverse = Matrix.invert(matrix)
      if (!inverse || !containsLocalPoint(child, Matrix.mapPoint(inverse, point))) continue
      const nested = search(child.id, matrix)
      if (nested) return nested
      if (adopting) {
        return { parentId: child.id, toLocal: (target) => Matrix.mapPoint(inverse, target) }
      }
    }
    return null
  }

  const page = graph.getNode(pageId)
  const found = page ? search(pageId, getWorldMatrix(page, graph)) : null
  return found ?? { parentId: pageId, toLocal: (target) => ({ x: target.x, y: target.y }) }
}
