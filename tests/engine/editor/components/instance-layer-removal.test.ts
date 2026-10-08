import { describe, expect, test } from 'bun:test'

import { createEditor } from '@open-pencil/core/editor'
import type { Fill } from '@open-pencil/scene-graph'

const BLUE: Fill = { type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 1, visible: true }

/** Component sync runs in a microtask after the edit. */
const settle = () =>
  new Promise<void>((resolve) => {
    queueMicrotask(resolve)
  })

function setup() {
  const editor = createEditor()
  const { graph } = editor
  const pageId = graph.getPages()[0].id
  const component = graph.createNode('COMPONENT', pageId, { name: 'Card', width: 200, height: 100 })
  const badge = graph.createNode('FRAME', component.id, { name: 'Badge', x: 10, y: 10 })
  const dot = graph.createNode('ELLIPSE', badge.id, { name: 'Dot' })
  const title = graph.createNode('TEXT', component.id, { name: 'Title', text: 'Hello', y: 40 })
  const first = graph.getNode(editor.createInstanceFromComponent(component.id) ?? '')
  const second = graph.getNode(editor.createInstanceFromComponent(component.id) ?? '')
  if (!first || !second) throw new Error('Instances were not created')
  const namesOf = (id: string) => graph.getChildren(id).map((node) => node.name)
  const remove = (id: string) => {
    editor.select([id])
    editor.deleteSelected()
  }
  return { editor, graph, component, badge, dot, title, first, second, namesOf, remove }
}

describe('a layer deleted from the main component', () => {
  test('leaves the instances, with everything under it', async () => {
    const { editor, graph, badge, first, second, namesOf, remove } = setup()
    const [firstBadge] = graph.getChildren(first.id)
    const [firstDot] = graph.getChildren(firstBadge.id)

    remove(badge.id)
    await settle()

    expect(namesOf(first.id)).toEqual(['Title'])
    expect(namesOf(second.id)).toEqual(['Title'])
    expect(graph.getNode(firstBadge.id)).toBeUndefined()
    expect(graph.getNode(firstDot.id)).toBeUndefined()
    editor.dispose()
  })

  test('comes back in the instances on undo, with the overrides it had', async () => {
    const { editor, graph, badge, dot, first, second, namesOf, remove } = setup()
    const [firstBadge] = graph.getChildren(first.id)
    const [firstDot] = graph.getChildren(firstBadge.id)
    editor.updateNodeWithUndo(firstDot.id, { fills: [BLUE] }, 'Fill')
    editor.updateNodeWithUndo(firstBadge.id, { opacity: 0.5 }, 'Opacity')

    remove(badge.id)
    await settle()
    expect(first.instanceOverrides.descendants.has(firstDot.id)).toBe(false)

    editor.undo.undo()
    await settle()

    expect(namesOf(first.id)).toEqual(['Badge', 'Title'])
    expect(namesOf(second.id)).toEqual(['Badge', 'Title'])
    expect(graph.getChildren(first.id)[0].id).toBe(firstBadge.id)
    expect(graph.getNode(firstDot.id)).toMatchObject({ fills: [BLUE], parentId: firstBadge.id })
    expect(graph.getNode(firstBadge.id)?.opacity).toBe(0.5)

    // Still overrides: a later change of the component does not write over them.
    editor.updateNodeWithUndo(dot.id, { fills: [], cornerRadius: 3 }, 'Edit main')
    editor.updateNodeWithUndo(badge.id, { opacity: 0.9 }, 'Edit main')
    await settle()
    expect(graph.getNode(firstDot.id)).toMatchObject({ fills: [BLUE], cornerRadius: 3 })
    expect(graph.getNode(firstBadge.id)?.opacity).toBe(0.5)
    expect(graph.getChildren(graph.getChildren(second.id)[0].id)[0].fills).toEqual([])
    editor.dispose()
  })

  test('is removed again on redo', async () => {
    const { editor, badge, first, namesOf, remove } = setup()

    remove(badge.id)
    await settle()
    editor.undo.undo()
    await settle()
    editor.undo.redo()
    await settle()
    expect(namesOf(first.id)).toEqual(['Title'])

    editor.undo.undo()
    await settle()
    expect(namesOf(first.id)).toEqual(['Badge', 'Title'])
    editor.dispose()
  })

  test('does not take along a layer the instance holds on its own', async () => {
    const { editor, graph, badge, first, namesOf, remove } = setup()
    graph.createNode('RECTANGLE', first.id, { name: 'Sticker' })

    remove(badge.id)
    await settle()

    expect(namesOf(first.id)).toEqual(['Title', 'Sticker'])
    editor.dispose()
  })

  test('takes its copies out of an instance nested in another component', async () => {
    const { editor, graph, component, badge, remove } = setup()
    const pageId = graph.getPages()[0].id
    const outer = graph.createNode('COMPONENT', pageId, { name: 'Outer', width: 400, height: 300 })
    const nested = graph.createInstance(component.id, outer.id)
    const outerInstance = graph.getNode(editor.createInstanceFromComponent(outer.id) ?? '')
    if (!nested || !outerInstance) throw new Error('Instances were not created')
    const copy = graph.getChildren(outerInstance.id)[0]

    remove(badge.id)
    await settle()
    expect(graph.getChildren(nested.id).map((node) => node.name)).toEqual(['Title'])
    expect(graph.getChildren(copy.id).map((node) => node.name)).toEqual(['Title'])

    editor.undo.undo()
    await settle()
    expect(graph.getChildren(copy.id).map((node) => node.name)).toEqual(['Badge', 'Title'])
    editor.dispose()
  })
})
