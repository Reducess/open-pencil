import { describe, expect, mock, test } from 'bun:test'

import { createEditor, executeAtomicTool } from '@open-pencil/core/editor'
import { FigmaAPI } from '@open-pencil/core/figma-api'
import { ALL_TOOLS, type ToolDef } from '@open-pencil/core/tools'

function tool(name: string): ToolDef {
  const def = ALL_TOOLS.find((candidate) => candidate.name === name)
  if (!def) throw new Error(`Missing ${name}`)
  return def
}

function setup() {
  const editor = createEditor()
  const { graph } = editor
  const figma = new FigmaAPI(graph)
  const collection = graph.createCollection('Sizes')
  const mode = collection.defaultModeId
  const gap = graph.createVariable('Gap', 'FLOAT', collection.id, 8)
  const pageId = graph.getPages()[0].id
  const row = graph.createNode('FRAME', pageId, {
    layoutMode: 'HORIZONTAL',
    primaryAxisSizing: 'HUG',
    counterAxisSizing: 'HUG',
    itemSpacing: 8,
    boundVariables: { itemSpacing: gap.id }
  })
  graph.createNode('RECTANGLE', row.id, { width: 40, height: 40 })
  const second = graph.createNode('RECTANGLE', row.id, { width: 40, height: 40 })
  editor.runLayoutForNode(row.id)
  const changed = mock()
  editor.onEditorEvent('variables:changed', changed)
  return { editor, graph, figma, mode, gap, row, second, changed }
}

describe('variable tools run through the editor', () => {
  test('set_variable rewrites the fields bound to it, lays out again and can be undone', () => {
    const { editor, figma, mode, gap, row, second, changed } = setup()
    expect(second.x).toBe(48)

    executeAtomicTool(editor, figma, tool('set_variable'), { id: gap.id, mode, value: '24' })

    expect(row.itemSpacing).toBe(24)
    expect(second.x).toBe(64)
    expect(changed).toHaveBeenCalledTimes(1)

    editor.undo.undo()
    expect(gap.valuesByMode[mode]).toBe(8)
    expect(row.itemSpacing).toBe(8)
    expect(second.x).toBe(48)

    editor.undo.redo()
    expect(row.itemSpacing).toBe(24)
    expect(second.x).toBe(64)
    expect(changed).toHaveBeenCalledTimes(3)
    editor.dispose()
  })

  test('bind_variable gives the field the value of the variable, and undo the old one', () => {
    const { editor, graph, figma, gap, row, changed } = setup()
    const padded = graph.createNode('FRAME', row.id, { paddingLeft: 2 })

    executeAtomicTool(editor, figma, tool('bind_variable'), {
      node_id: padded.id,
      field: 'paddingLeft',
      variable_id: gap.id
    })
    expect(padded.paddingLeft).toBe(8)

    editor.undo.undo()
    expect(padded.boundVariables.paddingLeft).toBeUndefined()
    expect(padded.paddingLeft).toBe(2)
    // Bindings changed, variables did not.
    expect(changed).not.toHaveBeenCalled()
    editor.dispose()
  })

  test('a tool that touches neither variables nor bindings leaves bound fields alone', () => {
    const { editor, figma, row, changed } = setup()
    const sync = mock(editor.syncVariableBindings)
    const watched = { ...editor, syncVariableBindings: sync }

    executeAtomicTool(watched, figma, tool('set_opacity'), { id: row.id, value: 0.5 })

    expect(sync).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalled()
    editor.dispose()
  })
})
