import { describe, expect, test } from 'bun:test'

import { computed, createApp, effectScope, shallowReactive } from 'vue'

import { createDefaultEditorState, createEditor } from '@open-pencil/core/editor'
import { SceneGraph } from '@open-pencil/scene-graph'

import { EDITOR_KEY } from '#vue/editor/context'
import { useVariables } from '#vue/variables/use'

function setup() {
  const graph = new SceneGraph()
  const state = shallowReactive(createDefaultEditorState(graph.getPages()[0].id))
  const editor = createEditor({ graph, state })
  editor.addCollection({
    id: 'theme',
    name: 'Theme',
    modes: [{ modeId: 'light', name: 'Light' }],
    defaultModeId: 'light',
    variableIds: []
  })
  const app = createApp({})
  app.provide(EDITOR_KEY, editor)
  const scope = effectScope()
  const variables = app.runWithContext(() => scope.run(() => useVariables()))
  if (!variables) throw new Error('useVariables did not run')
  return {
    editor,
    variables,
    dispose() {
      scope.stop()
      editor.dispose()
    }
  }
}

describe('useVariables', () => {
  test('activeModes follows modes added, renamed and removed in the scene', () => {
    const fixture = setup()
    const { editor, variables } = fixture
    try {
      const names = computed(() => variables.activeModes.value.map((mode) => mode.name))
      expect(names.value).toEqual(['Light'])

      const darkId = editor.addMode('theme', 'Dark')
      expect(names.value).toEqual(['Light', 'Dark'])

      editor.renameMode('theme', darkId ?? '', 'Night')
      expect(names.value).toEqual(['Light', 'Night'])

      editor.undo.undo()
      editor.undo.undo()
      expect(names.value).toEqual(['Light'])
    } finally {
      fixture.dispose()
    }
  })

  test('activeCollection follows a rename and new variables', () => {
    const fixture = setup()
    const { editor, variables } = fixture
    try {
      const summary = computed(() => {
        const collection = variables.activeCollection.value
        return collection ? `${collection.name}:${collection.variableIds.length}` : 'none'
      })
      expect(summary.value).toBe('Theme:0')

      editor.renameCollection('theme', 'Brand')
      expect(summary.value).toBe('Brand:0')

      editor.addVariable({
        id: 'primary',
        name: 'Primary',
        type: 'COLOR',
        collectionId: 'theme',
        valuesByMode: { light: { r: 0, g: 0, b: 0, a: 1 } },
        description: '',
        hiddenFromPublishing: false
      })
      expect(summary.value).toBe('Brand:1')
    } finally {
      fixture.dispose()
    }
  })
})
