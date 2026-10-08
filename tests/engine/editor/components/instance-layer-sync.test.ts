import { describe, expect, test } from 'bun:test'

import { createEditor } from '@open-pencil/core/editor'

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
  const badge = graph.createNode('RECTANGLE', component.id, { name: 'Badge', x: 10, y: 10 })
  const title = graph.createNode('TEXT', component.id, { name: 'Title', text: 'Hello', y: 40 })
  const edited = graph.getNode(editor.createInstanceFromComponent(component.id) ?? '')
  const untouched = graph.getNode(editor.createInstanceFromComponent(component.id) ?? '')
  if (!edited || !untouched) throw new Error('Instances were not created')
  const layersOf = (instanceId: string) => graph.getChildren(instanceId)
  const overridesOf = (instanceId: string, layerId: string) => [
    ...(graph.getNode(instanceId)?.instanceOverrides.descendants.get(layerId)?.keys() ?? [])
  ]
  return {
    editor,
    graph,
    pageId,
    component,
    badge,
    title,
    edited,
    untouched,
    layersOf,
    overridesOf
  }
}

describe('layers of an instance follow the main component', () => {
  test('moving, rotating, hiding and restyling a layer of the component reaches every instance', async () => {
    const { editor, badge, title, edited, untouched, layersOf } = setup()

    editor.updateNodeWithUndo(badge.id, { x: 60, y: 25, rotation: 45 }, 'Move')
    editor.toggleNodeVisibility(badge.id)
    editor.updateNodeWithUndo(
      title.id,
      { textAlignHorizontal: 'CENTER', lineHeight: 28, letterSpacing: 2, italic: true },
      'Style'
    )
    await settle()

    for (const instance of [edited, untouched]) {
      const [instBadge, instTitle] = layersOf(instance.id)
      expect(instBadge).toMatchObject({ x: 60, y: 25, rotation: 45, visible: false })
      expect(instTitle).toMatchObject({
        textAlignHorizontal: 'CENTER',
        lineHeight: 28,
        letterSpacing: 2,
        italic: true
      })
    }

    editor.undo.undo()
    editor.undo.undo()
    editor.undo.undo()
    await settle()
    expect(layersOf(edited.id)[0]).toMatchObject({ x: 10, y: 10, rotation: 0, visible: true })
    expect(layersOf(edited.id)[1]).toMatchObject({ textAlignHorizontal: 'LEFT', italic: false })
    editor.dispose()
  })

  test('a layer moved, rotated, hidden or restyled inside an instance keeps that edit', async () => {
    const { editor, graph, badge, title, edited, untouched, layersOf, overridesOf } = setup()
    const [instBadge, instTitle] = layersOf(edited.id)

    const origin = new Map([[instBadge.id, { x: instBadge.x, y: instBadge.y }]])
    graph.updateNode(instBadge.id, { x: 150 })
    editor.commitMove(origin)
    graph.updateNode(instBadge.id, { rotation: 20 })
    editor.commitRotation(instBadge.id, 0)
    editor.toggleNodeVisibility(instBadge.id)
    editor.updateNodeWithUndo(instTitle.id, { italic: true, textAlignHorizontal: 'RIGHT' }, 'Style')
    expect(overridesOf(edited.id, instBadge.id).sort()).toEqual(['rotation', 'visible', 'x'])

    editor.updateNodeWithUndo(badge.id, { x: 60, y: 25, rotation: 45, visible: true }, 'Move')
    editor.updateNodeWithUndo(title.id, { italic: false, textAlignHorizontal: 'CENTER' }, 'Style')
    editor.updateNodeWithUndo(title.id, { letterSpacing: 3 }, 'Style')
    await settle()

    // Only the vertical position was left to the component.
    expect(instBadge).toMatchObject({ x: 150, y: 25, rotation: 20, visible: false })
    expect(instTitle).toMatchObject({
      italic: true,
      textAlignHorizontal: 'RIGHT',
      letterSpacing: 3
    })
    expect(layersOf(untouched.id)[0]).toMatchObject({ x: 60, y: 25, rotation: 45, visible: true })
    editor.dispose()
  })

  test('undoing the edit made inside the instance hands the layer back to the component', async () => {
    const { editor, graph, badge, edited, layersOf, overridesOf } = setup()
    const [instBadge] = layersOf(edited.id)

    const origin = new Map([[instBadge.id, { x: instBadge.x, y: instBadge.y }]])
    graph.updateNode(instBadge.id, { x: 150, y: 70 })
    editor.commitMove(origin)
    editor.toggleNodeVisibility(instBadge.id)
    editor.undo.undo()
    editor.undo.undo()
    expect(overridesOf(edited.id, instBadge.id)).toEqual([])

    editor.undo.redo()
    expect(overridesOf(edited.id, instBadge.id).sort()).toEqual(['x', 'y'])
    editor.undo.undo()

    editor.updateNodeWithUndo(badge.id, { x: 60, y: 25 }, 'Move')
    await settle()
    expect(instBadge).toMatchObject({ x: 60, y: 25, visible: true })
    editor.dispose()
  })

  test('moving, rotating or hiding the instance itself is not an override', () => {
    const { editor, graph, edited } = setup()

    const origin = new Map([[edited.id, { x: edited.x, y: edited.y }]])
    graph.updateNode(edited.id, { x: 900, y: 900 })
    editor.commitMove(origin)
    graph.updateNode(edited.id, { rotation: 30 })
    editor.commitRotation(edited.id, 0)
    editor.toggleNodeVisibility(edited.id)

    expect(edited.instanceOverrides.self.size).toBe(0)
    expect(edited.instanceOverrides.descendants.size).toBe(0)
    editor.dispose()
  })

  test('auto layout owns the position of its children: it is neither synced nor an override', async () => {
    const { editor, graph, pageId } = setup()
    const row = graph.createNode('COMPONENT', pageId, {
      name: 'Row',
      width: 300,
      height: 60,
      layoutMode: 'HORIZONTAL',
      itemSpacing: 8,
      paddingLeft: 10
    })
    const first = graph.createNode('RECTANGLE', row.id, { name: 'First', width: 40, height: 40 })
    graph.createNode('RECTANGLE', row.id, { name: 'Second', width: 40, height: 40 })
    const instance = graph.getNode(editor.createInstanceFromComponent(row.id) ?? '')
    if (!instance) throw new Error('Instance was not created')
    editor.updateNodeWithUndo(instance.id, { paddingLeft: 50 }, 'Padding')
    const [instFirst, instSecond] = graph.getChildren(instance.id)
    expect(instFirst.x).toBe(50)

    // A position written on a child in flow is not the user's: the layout decides it.
    editor.updateNodeWithUndo(instFirst.id, { x: 7 }, 'Move')
    expect(instance.instanceOverrides.descendants.get(instFirst.id)?.has('x') ?? false).toBe(false)

    editor.updateNodeWithUndo(first.id, { width: 100 }, 'Resize')
    await settle()

    expect(first.x).toBe(10)
    expect(instFirst).toMatchObject({ x: 50, width: 100 })
    expect(instSecond.x).toBe(158)
    editor.dispose()
  })

  test('a nested instance moved inside an instance is an override of the outer one', async () => {
    const { editor, graph, pageId, component: inner, badge } = setup()
    const outer = graph.createNode('COMPONENT', pageId, { name: 'Outer', width: 400, height: 300 })
    const nested = graph.createInstance(inner.id, outer.id, { x: 20, y: 20 })
    const first = graph.getNode(editor.createInstanceFromComponent(outer.id) ?? '')
    const second = graph.getNode(editor.createInstanceFromComponent(outer.id) ?? '')
    if (!nested || !first || !second) throw new Error('Instances were not created')
    const [firstNested] = graph.getChildren(first.id)
    const [secondNested] = graph.getChildren(second.id)

    const origin = new Map([[firstNested.id, { x: firstNested.x, y: firstNested.y }]])
    graph.updateNode(firstNested.id, { x: 200 })
    editor.commitMove(origin)
    expect(firstNested.instanceOverrides.self.has('x')).toBe(false)
    expect(first.instanceOverrides.descendants.get(firstNested.id)?.has('x')).toBe(true)

    // The inner component reaches the copies of the nested instance, on every level.
    editor.updateNodeWithUndo(badge.id, { x: 77 }, 'Move')
    editor.updateNodeWithUndo(nested.id, { x: 120, y: 60 }, 'Move')
    await settle()

    expect(graph.getChildren(nested.id)[0].x).toBe(77)
    expect(graph.getChildren(firstNested.id)[0].x).toBe(77)
    expect(graph.getChildren(secondNested.id)[0].x).toBe(77)
    expect(firstNested).toMatchObject({ x: 200, y: 60 })
    expect(secondNested).toMatchObject({ x: 120, y: 60 })
    editor.dispose()
  })
})
