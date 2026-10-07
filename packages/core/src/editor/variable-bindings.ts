import { pick } from 'es-toolkit/object'

import type { SceneNode } from '@open-pencil/scene-graph'

import type { EditorContext } from './types'

export function createVariableBindingActions(ctx: EditorContext) {
  /** Fields the binding is about to overwrite with the variable's value, as they are now. */
  function fieldsABindingWouldChange(nodeId: string): Partial<SceneNode> {
    const node = ctx.graph.getNode(nodeId)
    if (!node) return {}
    const keys = Object.keys(ctx.graph.boundScalarChanges(nodeId)) as (keyof SceneNode)[]
    return pick(node, keys) as Partial<SceneNode>
  }

  function bindVariable(nodeId: string, path: string, variableId: string) {
    const node = ctx.graph.getNode(nodeId)
    if (!node) return
    const prevVarId = node.boundVariables[path]
    ctx.graph.bindVariable(nodeId, path, variableId)
    // The bound field takes the variable's value: undo has to give the old one back.
    const overwritten = fieldsABindingWouldChange(nodeId)
    ctx.syncVariableBindings(nodeId)
    ctx.undo.push({
      label: 'Bind variable',
      forward: () => {
        try {
          ctx.graph.bindVariable(nodeId, path, variableId)
          ctx.syncVariableBindings(nodeId)
          ctx.requestRender()
        } catch (e) {
          console.warn('Redo bindVariable failed:', e instanceof Error ? e.message : String(e))
        }
      },
      inverse: () => {
        try {
          if (prevVarId) ctx.graph.bindVariable(nodeId, path, prevVarId)
          else ctx.graph.unbindVariable(nodeId, path)
          if (Object.keys(overwritten).length > 0) {
            ctx.graph.updateNode(nodeId, overwritten)
            ctx.runLayoutForNode(nodeId)
          }
          ctx.syncVariableBindings(nodeId)
          ctx.requestRender()
        } catch (e) {
          console.warn('Undo bindVariable failed:', e instanceof Error ? e.message : String(e))
        }
      }
    })
    ctx.requestRender()
  }

  function unbindVariable(nodeId: string, path: string) {
    const node = ctx.graph.getNode(nodeId)
    if (!node) return
    const prevVarId = node.boundVariables[path]
    if (!prevVarId) return
    ctx.graph.unbindVariable(nodeId, path)
    ctx.undo.push({
      label: 'Unbind variable',
      forward: () => {
        try {
          ctx.graph.unbindVariable(nodeId, path)
          ctx.requestRender()
        } catch (e) {
          console.warn('Redo unbindVariable failed:', e instanceof Error ? e.message : String(e))
        }
      },
      inverse: () => {
        try {
          ctx.graph.bindVariable(nodeId, path, prevVarId)
          ctx.syncVariableBindings(nodeId)
          ctx.requestRender()
        } catch (e) {
          console.warn('Undo unbindVariable failed:', e instanceof Error ? e.message : String(e))
        }
      }
    })
    ctx.requestRender()
  }

  return { bindVariable, unbindVariable }
}
