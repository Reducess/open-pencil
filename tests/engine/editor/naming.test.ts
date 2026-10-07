import { describe, expect, test } from 'bun:test'

import { createEditor, type NodeNaming } from '@open-pencil/core/editor'
import type { NodeType } from '@open-pencil/scene-graph'

const NAMES: Partial<Record<NodeType, string>> = {
  RECTANGLE: 'Retângulo',
  FRAME: 'Quadro',
  GROUP: 'Grupo',
  VECTOR: 'Vetor',
  COMPONENT: 'Componente',
  TEXT: 'Texto'
}

const naming: NodeNaming = {
  defaultName: (type) => NAMES[type],
  copyName: (name) => `${name} cópia`
}

function nameOf(editor: ReturnType<typeof createEditor>, id: string | undefined) {
  return id ? editor.graph.getNode(id)?.name : undefined
}

describe('host-provided layer names', () => {
  test('new shapes take the host name for their type', () => {
    const editor = createEditor({ naming })
    try {
      const rectangle = editor.createShape('RECTANGLE', 0, 0, 10, 10)
      expect(nameOf(editor, rectangle)).toBe('Retângulo')
      expect(nameOf(editor, editor.createShape('TEXT', 0, 0, 10, 10))).toBe('Texto')
      // Types the host does not name keep the built-in name; an explicit name always wins.
      expect(nameOf(editor, editor.createShape('ELLIPSE', 0, 0, 10, 10))).toBe('Ellipse')
      expect(nameOf(editor, editor.createShape('RECTANGLE', 0, 0, 10, 10, undefined, 'Hero'))).toBe(
        'Hero'
      )

      editor.undoAction()
      editor.undoAction()
      editor.undoAction()
      editor.undoAction()
      expect(editor.graph.getNode(rectangle)).toBeUndefined()
      editor.redoAction()
      expect(nameOf(editor, rectangle)).toBe('Retângulo')
    } finally {
      editor.dispose()
    }
  })

  test('a committed pen path takes the host name', () => {
    const editor = createEditor({ naming })
    try {
      editor.penAddVertex(0, 0)
      editor.penAddVertex(40, 30)
      editor.penCommit(false)
      expect(nameOf(editor, [...editor.state.selectedIds][0])).toBe('Vetor')
    } finally {
      editor.dispose()
    }
  })

  test('containers created around the selection take the host name', () => {
    const actions = [
      ['groupSelected', 'Grupo'],
      ['frameSelection', 'Quadro'],
      ['wrapInAutoLayout', 'Quadro'],
      ['createComponentFromSelection', 'Componente']
    ] as const
    for (const [action, expected] of actions) {
      const editor = createEditor({ naming })
      try {
        const a = editor.createShape('RECTANGLE', 0, 0, 10, 10, undefined, 'A')
        const b = editor.createShape('RECTANGLE', 20, 0, 10, 10, undefined, 'B')
        editor.select([a, b])
        editor[action]()
        const [containerId] = [...editor.state.selectedIds]
        expect(editor.graph.getNode(containerId)?.childIds).toEqual([a, b])
        expect(nameOf(editor, containerId)).toBe(expected)
      } finally {
        editor.dispose()
      }
    }
  })

  test('duplicates are named by the host', () => {
    const editor = createEditor({ naming })
    try {
      const source = editor.createShape('RECTANGLE', 0, 0, 10, 10, undefined, 'Fundo')
      editor.select([source])
      editor.duplicateSelected()
      expect(nameOf(editor, [...editor.state.selectedIds][0])).toBe('Fundo cópia')
    } finally {
      editor.dispose()
    }
  })

  test('without a host the built-in English names are unchanged', () => {
    const editor = createEditor()
    try {
      expect(editor.naming).toEqual({})
      const a = editor.createShape('RECTANGLE', 0, 0, 10, 10)
      const b = editor.createShape('FRAME', 20, 0, 10, 10)
      expect([nameOf(editor, a), nameOf(editor, b)]).toEqual(['Rectangle', 'Frame'])
      editor.penAddVertex(0, 0)
      editor.penAddVertex(40, 30)
      editor.penCommit(false)
      expect(nameOf(editor, [...editor.state.selectedIds][0])).toBe('Vector')
      editor.select([a, b])
      editor.groupSelected()
      const [group] = [...editor.state.selectedIds]
      expect(nameOf(editor, group)).toBe('Group')
      editor.duplicateSelected()
      expect(nameOf(editor, [...editor.state.selectedIds][0])).toBe('Group copy')
    } finally {
      editor.dispose()
    }
  })
})
