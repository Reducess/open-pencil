import { describe, expect, test } from 'bun:test'

import { createEditor } from '@open-pencil/core/editor'

function setup() {
  const editor = createEditor()
  const pageId = editor.graph.getPages()[0].id
  editor.graph.addCollection({
    id: 'sizes',
    name: 'Sizes',
    modes: [
      { modeId: 'compact', name: 'Compact' },
      { modeId: 'roomy', name: 'Roomy' }
    ],
    defaultModeId: 'compact',
    variableIds: []
  })
  editor.graph.addVariable({
    id: 'gap',
    name: 'Gap',
    type: 'FLOAT',
    collectionId: 'sizes',
    valuesByMode: { compact: 10, roomy: 40 },
    description: '',
    hiddenFromPublishing: false
  })
  const row = editor.graph.createNode('FRAME', pageId, {
    layoutMode: 'HORIZONTAL',
    primaryAxisSizing: 'HUG',
    counterAxisSizing: 'HUG',
    itemSpacing: 0
  })
  editor.graph.createNode('RECTANGLE', row.id, { width: 20, height: 20 })
  const second = editor.graph.createNode('RECTANGLE', row.id, { width: 20, height: 20 })
  editor.runLayoutForNode(row.id)
  const read = () => ({
    gap: editor.graph.getNode(row.id)?.itemSpacing,
    width: editor.graph.getNode(row.id)?.width,
    secondX: editor.graph.getNode(second.id)?.x
  })
  return { editor, pageId, row, second, read }
}

describe('scalar variable bindings in the editor', () => {
  test('binding writes the value and lays out; undo gives the old value back', () => {
    const { editor, row, read } = setup()
    expect(read()).toEqual({ gap: 0, width: 40, secondX: 20 })

    editor.bindVariable(row.id, 'itemSpacing', 'gap')
    expect(read()).toEqual({ gap: 10, width: 50, secondX: 30 })

    editor.undo.undo()
    expect(editor.graph.getNode(row.id)?.boundVariables.itemSpacing).toBeUndefined()
    expect(read()).toEqual({ gap: 0, width: 40, secondX: 20 })

    editor.undo.redo()
    expect(read()).toEqual({ gap: 10, width: 50, secondX: 30 })
    editor.dispose()
  })

  test('changing the value or the active mode reaches the layout, undo included', () => {
    const { editor, row, read } = setup()
    editor.bindVariable(row.id, 'itemSpacing', 'gap')

    editor.updateVariableValue('gap', 'compact', 16)
    expect(read()).toEqual({ gap: 16, width: 56, secondX: 36 })

    editor.setActiveMode('sizes', 'roomy')
    expect(read()).toEqual({ gap: 40, width: 80, secondX: 60 })

    editor.undo.undo()
    expect(read()).toEqual({ gap: 16, width: 56, secondX: 36 })
    editor.undo.undo()
    expect(read()).toEqual({ gap: 10, width: 50, secondX: 30 })
    editor.dispose()
  })

  test('a mode pinned on a frame applies to what is inside it, and follows reparenting', () => {
    const { editor, pageId, row, read } = setup()
    editor.bindVariable(row.id, 'itemSpacing', 'gap')
    const scope = editor.graph.createNode('FRAME', pageId, { width: 400, height: 200 })

    editor.reparentNodes([row.id], scope.id)
    expect(read().gap).toBe(10)

    editor.updateNodeWithUndo(scope.id, { variableModes: { sizes: 'roomy' } }, 'Pin mode')
    expect(read()).toMatchObject({ gap: 40, width: 80, secondX: 60 })

    editor.undo.undo()
    expect(read()).toMatchObject({ gap: 10, width: 50, secondX: 30 })

    editor.undo.redo()
    editor.reparentNodes([row.id], pageId)
    expect(read()).toMatchObject({ gap: 10, width: 50, secondX: 30 })
    editor.dispose()
  })
})
