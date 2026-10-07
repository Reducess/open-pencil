import { DEFAULT_TEXT_HEIGHT, DEFAULT_TEXT_WIDTH } from '@open-pencil/core/constants'
import type { DrawParent, Editor } from '@open-pencil/core/editor'

import { TOOL_TO_NODE } from '#vue/shared/input/types'
import type { DragDraw, DragState } from '#vue/shared/input/types'

export function startTextDraw(
  cx: number,
  cy: number,
  editor: Editor,
  setDrag: (d: DragState) => void
) {
  const parent = editor.resolveDrawParent(cx, cy, 'TEXT')
  const origin = parent.toLocal({ x: cx, y: cy })
  editor.undo.beginBatch('Create text')
  const nodeId = editor.createShape('TEXT', origin.x, origin.y, 0, 0, parent.parentId)
  editor.graph.updateNode(nodeId, { text: '' })
  editor.select([nodeId])
  setDrag(createDraw(editor, nodeId, cx, cy, parent))
}

export function startShapeDraw(
  cx: number,
  cy: number,
  editor: Editor,
  setDrag: (d: DragState) => void
) {
  const nodeType = TOOL_TO_NODE[editor.state.activeTool]
  if (!nodeType) return

  const parent = editor.resolveDrawParent(cx, cy, nodeType)
  const origin = parent.toLocal({ x: cx, y: cy })
  editor.undo.beginBatch('Create shape')
  const nodeId = editor.createShape(nodeType, origin.x, origin.y, 0, 0, parent.parentId)
  editor.select([nodeId])
  setDrag(createDraw(editor, nodeId, cx, cy, parent))
}

export function handleDrawMove(d: DragDraw, cx: number, cy: number, shiftKey: boolean) {
  // Geometry is written in the parent's space, so the box follows a rotated or nested frame.
  const start = d.toParent?.(d.startX, d.startY) ?? { x: d.startX, y: d.startY }
  const current = d.toParent?.(cx, cy) ?? { x: cx, y: cy }
  let w = current.x - start.x
  let h = current.y - start.y

  if (shiftKey) {
    const size = Math.max(Math.abs(w), Math.abs(h))
    w = Math.sign(w) * size
    h = Math.sign(h) * size
  }

  d.update({
    x: w < 0 ? start.x + w : start.x,
    y: h < 0 ? start.y + h : start.y,
    width: Math.abs(w),
    height: Math.abs(h)
  })
}

function createDraw(
  editor: Editor,
  nodeId: string,
  startX: number,
  startY: number,
  parent: DrawParent
): DragDraw {
  const graph = editor.graph
  const toParent = (cx: number, cy: number) => parent.toLocal({ x: cx, y: cy })
  const preview = editor.beginNodePreview('Draw dimensions')
  let finished = false

  function cancel() {
    if (finished) return
    finished = true
    preview.cancel()
    // Never replay an old document's creation undo against a replacement graph.
    if (editor.graph === graph) editor.undo.rollbackBatch()
  }

  function commit() {
    if (finished) return
    if (preview.closed || editor.graph !== graph) {
      cancel()
      return
    }
    finished = true
    const node = graph.getNode(nodeId)
    try {
      if (node?.type === 'TEXT') {
        const isPointText = node.width < 2 && node.height < 2
        preview.update(nodeId, {
          width: isPointText ? DEFAULT_TEXT_WIDTH : node.width,
          height: isPointText ? DEFAULT_TEXT_HEIGHT : node.height,
          textAutoResize: isPointText ? 'WIDTH_AND_HEIGHT' : 'NONE'
        })
      } else if (node && node.width < 2 && node.height < 2) {
        preview.update(nodeId, { width: 100, height: 100 })
      }
      preview.commit()
      if (node?.type === 'SECTION') editor.adoptNodesIntoSection(node.id)
      editor.undo.commitBatch()
    } catch (error) {
      preview.cancel()
      editor.undo.rollbackBatch()
      throw error
    }
    editor.setTool('SELECT')
    if (node?.type === 'TEXT') editor.startTextEditing(node.id)
  }

  // Creation itself is already an edit: avoid rebuilding the backing on the first held frame.
  try {
    preview.update(nodeId, toParent(startX, startY))
  } catch (error) {
    cancel()
    throw error
  }

  return {
    type: 'draw',
    startX,
    startY,
    nodeId,
    toParent,
    update: (changes) => {
      if (!finished) preview.update(nodeId, changes)
    },
    commit,
    cancel
  }
}
