import { describe, expect, test } from 'bun:test'

import { createEditor } from '@open-pencil/core/editor'

import { duplicateAndDrag } from '#vue/shared/input/duplicate-drag'

describe('duplicate drag naming', () => {
  test('the host names the dragged duplicate', () => {
    const editor = createEditor({ naming: { copyName: (name) => `${name} cópia` } })
    try {
      const source = editor.createShape('RECTANGLE', 0, 0, 10, 10, undefined, 'Fundo')
      editor.select([source])
      duplicateAndDrag(5, 5, 5, 5, editor)
      const [copy] = [...editor.state.selectedIds]
      expect(copy).not.toBe(source)
      expect(editor.graph.getNode(copy)?.name).toBe('Fundo cópia')
    } finally {
      editor.dispose()
    }
  })

  test('falls back to the translated suffix without a host', () => {
    const editor = createEditor()
    try {
      const source = editor.createShape('RECTANGLE', 0, 0, 10, 10, undefined, 'Fundo')
      editor.select([source])
      duplicateAndDrag(5, 5, 5, 5, editor)
      expect(editor.graph.getNode([...editor.state.selectedIds][0])?.name).toBe('Fundo copy')
    } finally {
      editor.dispose()
    }
  })
})
