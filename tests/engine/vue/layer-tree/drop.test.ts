import { describe, expect, test } from 'bun:test'

import { createEditor, type Editor } from '@open-pencil/core/editor'
import { buildLayerTreeModel, visibleLayerRows } from '@open-pencil/vue'

import { applyLayerDrop } from '#vue/primitives/LayerTree/drop'

type Placement = 'reorder-above' | 'reorder-below'

function setup() {
  const editor = createEditor()
  const page = editor.state.currentPageId
  const frame = editor.graph.createNode('FRAME', page, { name: 'Frame' })
  const ids = ['a', 'b', 'c', 'd'].map(
    (name) => editor.graph.createNode('RECTANGLE', frame.id, { name }).id
  )
  return { editor, page, frame, ids }
}

/** Row ids of `parentId` from the top of the panel to the bottom. */
function panelOrder(editor: Editor, parentId: string, frontOnTop: boolean): string[] {
  const children = editor.graph.getNode(parentId)?.childIds ?? []
  return frontOnTop ? children.toReversed() : [...children]
}

function expectedPanelOrder(
  rows: readonly string[],
  sourceId: string,
  targetId: string,
  placement: Placement
): string[] {
  const next = rows.filter((id) => id !== sourceId)
  const targetIndex = next.indexOf(targetId)
  next.splice(placement === 'reorder-above' ? targetIndex : targetIndex + 1, 0, sourceId)
  return next
}

describe('layer tree order', () => {
  test('lists the front layer first at every level when frontOnTop is set', () => {
    const { editor, page, frame, ids } = setup()
    try {
      const behind = editor.graph.createNode('RECTANGLE', page, { name: 'Behind' })
      editor.graph.insertChildAt(behind.id, page, 0)

      const scene = buildLayerTreeModel(editor.graph, page)
      expect(scene.items.map((node) => node.id)).toEqual([behind.id, frame.id])
      expect(scene.items[1]?.children?.map((node) => node.id)).toEqual(ids)

      const front = buildLayerTreeModel(editor.graph, page, { frontOnTop: true })
      expect(front.items.map((node) => node.id)).toEqual([frame.id, behind.id])
      expect(front.items[0]?.children?.map((node) => node.id)).toEqual(ids.toReversed())
      expect(front.byId.size).toBe(scene.byId.size)
      expect(visibleLayerRows(front.items, new Set([frame.id])).map((row) => row.node.id)).toEqual([
        frame.id,
        ...ids.toReversed(),
        behind.id
      ])
    } finally {
      editor.dispose()
    }
  })
})

describe('layer tree drop', () => {
  for (const frontOnTop of [false, true]) {
    const mode = frontOnTop ? 'front on top' : 'scene order'

    test(`reordering within a parent lands where the indicator was (${mode})`, () => {
      for (const placement of ['reorder-above', 'reorder-below'] as const) {
        for (let source = 0; source < 4; source++) {
          for (let target = 0; target < 4; target++) {
            if (source === target) continue
            const { editor, frame, ids } = setup()
            try {
              const before = panelOrder(editor, frame.id, frontOnTop)
              const expected = expectedPanelOrder(before, ids[source], ids[target], placement)
              applyLayerDrop(editor, ids[source], ids[target], { type: placement }, frontOnTop)
              expect(panelOrder(editor, frame.id, frontOnTop)).toEqual(expected)
              editor.undoAction()
              expect(panelOrder(editor, frame.id, frontOnTop)).toEqual(before)
            } finally {
              editor.dispose()
            }
          }
        }
      }
    })

    test(`dropping next to a row of another parent moves the layer there (${mode})`, () => {
      for (const placement of ['reorder-above', 'reorder-below'] as const) {
        const { editor, page, frame, ids } = setup()
        try {
          const loose = editor.graph.createNode('RECTANGLE', page, { name: 'Loose' })
          const before = panelOrder(editor, frame.id, frontOnTop)
          applyLayerDrop(editor, loose.id, ids[1], { type: placement }, frontOnTop)
          expect(loose.parentId).toBe(frame.id)
          expect(panelOrder(editor, frame.id, frontOnTop)).toEqual(
            expectedPanelOrder(before, loose.id, ids[1], placement)
          )
        } finally {
          editor.dispose()
        }
      }
    })

    test(`nesting puts the layer in front of the container's children (${mode})`, () => {
      const { editor, page, frame, ids } = setup()
      try {
        const loose = editor.graph.createNode('RECTANGLE', page, { name: 'Loose' })
        expect(applyLayerDrop(editor, loose.id, frame.id, { type: 'make-child' }, frontOnTop)).toBe(
          frame.id
        )
        expect(frame.childIds).toEqual([...ids, loose.id])
        expect(applyLayerDrop(editor, loose.id, ids[0], { type: 'make-child' }, frontOnTop)).toBe(
          null
        )
        expect(
          applyLayerDrop(editor, frame.id, ids[0], { type: 'reorder-above' }, frontOnTop)
        ).toBe(null)
        expect(frame.parentId).toBe(page)
      } finally {
        editor.dispose()
      }
    })
  }
})
