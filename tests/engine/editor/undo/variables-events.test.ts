import { describe, expect, test } from 'bun:test'

import { createEditor } from '@open-pencil/core/editor'

function setup() {
  const editor = createEditor()
  editor.graph.addCollection({
    id: 'col',
    name: 'Spacing',
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
    collectionId: 'col',
    valuesByMode: { compact: 8, roomy: 24 },
    description: '',
    hiddenFromPublishing: false
  })
  let events = 0
  const off = editor.onEditorEvent('variables:changed', () => {
    events += 1
  })
  return {
    editor,
    count: () => events,
    dispose() {
      off()
      editor.dispose()
    }
  }
}

describe('variable editor events', () => {
  test('emits variables:changed for value, mode and collection changes, undo and redo included', () => {
    const fixture = setup()
    const { editor } = fixture
    try {
      editor.updateVariableValue('gap', 'compact', 12)
      expect(fixture.count()).toBe(1)
      editor.undo.undo()
      expect(fixture.count()).toBe(2)
      editor.undo.redo()
      expect(fixture.count()).toBe(3)

      editor.renameVariable('gap', 'Space')
      editor.addMode('col', 'Wide')
      editor.renameCollection('col', 'Sizes')
      editor.setActiveMode('col', 'roomy')
      expect(fixture.count()).toBe(7)
    } finally {
      fixture.dispose()
    }
  })

  test('setActiveMode is undoable', () => {
    const fixture = setup()
    const { editor } = fixture
    try {
      editor.setActiveMode('col', 'roomy')
      expect(editor.graph.getActiveModeId('col')).toBe('roomy')
      expect(editor.undo.undoLabel).toBe('Change active mode')

      editor.undo.undo()
      expect(editor.graph.getActiveModeId('col')).toBe('compact')
      expect(fixture.count()).toBe(2)

      editor.undo.redo()
      expect(editor.graph.getActiveModeId('col')).toBe('roomy')
    } finally {
      fixture.dispose()
    }
  })

  test('setting the mode that is already active records nothing', () => {
    const fixture = setup()
    const { editor } = fixture
    try {
      editor.setActiveMode('col', 'compact')
      expect(editor.undo.canUndo).toBe(false)
      expect(fixture.count()).toBe(0)
    } finally {
      fixture.dispose()
    }
  })
})
