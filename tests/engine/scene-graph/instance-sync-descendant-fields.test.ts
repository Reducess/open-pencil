import { describe, expect, test } from 'bun:test'

import { SceneGraph, setInstanceOverride, type StyleRun } from '@open-pencil/scene-graph'

function setup() {
  const graph = new SceneGraph()
  const page = graph.addPage('Page')
  const component = graph.createNode('COMPONENT', page.id, {
    name: 'Card',
    width: 200,
    height: 100
  })
  const badge = graph.createNode('RECTANGLE', component.id, { name: 'Badge', x: 10, y: 10 })
  const title = graph.createNode('TEXT', component.id, {
    name: 'Title',
    text: 'Hello',
    x: 10,
    y: 40
  })
  const instance = graph.createInstance(component.id, page.id, { x: 400, y: 300 })
  if (!instance) throw new Error('Instance was not created')
  const [instBadge, instTitle] = graph.getChildren(instance.id)
  return { graph, page, component, badge, title, instance, instBadge, instTitle }
}

describe('component to instance sync of layer fields', () => {
  test('a layer moved, rotated or hidden in the component follows in the instance', () => {
    const { graph, component, badge, instBadge } = setup()

    graph.updateNode(badge.id, { x: 60, y: 25, rotation: 45, visible: false })
    graph.syncInstances(component.id)

    expect(instBadge).toMatchObject({ x: 60, y: 25, rotation: 45, visible: false })
  })

  test('text alignment, line height, letter spacing, italic, decoration and style runs follow', () => {
    const { graph, component, title, instTitle } = setup()
    const styleRuns: StyleRun[] = [{ start: 0, length: 2, style: { fontWeight: 700 } }]

    graph.updateNode(title.id, {
      textAlignHorizontal: 'CENTER',
      textAlignVertical: 'BOTTOM',
      lineHeight: 28,
      letterSpacing: 1.5,
      italic: true,
      textDecoration: 'UNDERLINE',
      styleRuns
    })
    graph.syncInstances(component.id)

    expect(instTitle).toMatchObject({
      textAlignHorizontal: 'CENTER',
      textAlignVertical: 'BOTTOM',
      lineHeight: 28,
      letterSpacing: 1.5,
      italic: true,
      textDecoration: 'UNDERLINE'
    })
    expect(instTitle.styleRuns).toEqual(styleRuns)
    expect(instTitle.styleRuns).not.toBe(title.styleRuns)
    expect(instTitle.styleRuns[0]).not.toBe(title.styleRuns[0])
  })

  test('the instance root keeps its own position, rotation and visibility', () => {
    const { graph, component, instance } = setup()
    graph.updateNode(instance.id, { rotation: 30, visible: false })

    graph.updateNode(component.id, { x: 900, y: 900, rotation: 10, visible: true, opacity: 0.5 })
    graph.syncInstances(component.id)

    expect(instance).toMatchObject({ x: 400, y: 300, rotation: 30, visible: false, opacity: 0.5 })
  })

  test('a field overridden on the layer inside the instance is left alone', () => {
    const { graph, component, badge, title, instance, instBadge, instTitle } = setup()
    graph.updateNode(instBadge.id, { x: 150, visible: false })
    graph.updateNode(instTitle.id, { italic: true })
    for (const field of ['x', 'visible']) {
      setInstanceOverride(instance.instanceOverrides, instance.id, instBadge.id, field)
    }
    setInstanceOverride(instance.instanceOverrides, instance.id, instTitle.id, 'italic')

    graph.updateNode(badge.id, { x: 60, y: 25, visible: true })
    graph.updateNode(title.id, { italic: false, letterSpacing: 2 })
    graph.syncInstances(component.id)

    expect(instBadge).toMatchObject({ x: 150, y: 25, visible: false })
    expect(instTitle).toMatchObject({ italic: true, letterSpacing: 2 })
  })

  test('style runs are not written over a text the instance overrides', () => {
    const { graph, component, title, instance, instTitle } = setup()
    graph.updateNode(instTitle.id, { text: 'A much longer title' })
    setInstanceOverride(instance.instanceOverrides, instance.id, instTitle.id, 'text')

    graph.updateNode(title.id, { styleRuns: [{ start: 3, length: 2, style: { italic: true } }] })
    graph.syncInstances(component.id)

    expect(instTitle.styleRuns).toEqual([])
  })

  test('positions inside an auto layout frame are left to the layout', () => {
    const { graph, page } = setup()
    const component = graph.createNode('COMPONENT', page.id, {
      name: 'Row',
      layoutMode: 'HORIZONTAL',
      itemSpacing: 8
    })
    const first = graph.createNode('RECTANGLE', component.id, { name: 'First', x: 0, y: 0 })
    const pinned = graph.createNode('RECTANGLE', component.id, {
      name: 'Pinned',
      layoutPositioning: 'ABSOLUTE',
      x: 5,
      y: 5
    })
    const instance = graph.createInstance(component.id, page.id)
    if (!instance) throw new Error('Instance was not created')
    const [instFirst, instPinned] = graph.getChildren(instance.id)
    // What the layout engine computed for this instance, e.g. after a padding override.
    graph.updateNode(instFirst.id, { x: 24, y: 12 })

    graph.updateNode(first.id, { x: 3, y: 4, rotation: 90 })
    graph.updateNode(pinned.id, { x: 70, y: 80 })
    graph.syncInstances(component.id)

    expect(instFirst).toMatchObject({ x: 24, y: 12, rotation: 90 })
    expect(instPinned).toMatchObject({ x: 70, y: 80 })
  })

  test('a nested instance follows its own component and its place in the outer one', () => {
    const { graph, page, component: inner, badge } = setup()
    const outer = graph.createNode('COMPONENT', page.id, { name: 'Outer', width: 400, height: 300 })
    const nested = graph.createInstance(inner.id, outer.id, { x: 20, y: 20 })
    const outerInstance = graph.createInstance(outer.id, page.id, { x: 800, y: 0 })
    if (!nested || !outerInstance) throw new Error('Instances were not created')
    const [nestedCopy] = graph.getChildren(outerInstance.id)
    const [nestedBadge] = graph.getChildren(nested.id)
    const [copyBadge] = graph.getChildren(nestedCopy.id)

    // The inner component moves a layer: both the nested instance and its copy follow.
    graph.updateNode(badge.id, { x: 77, visible: false })
    graph.syncInstances(inner.id)
    expect(nestedBadge).toMatchObject({ x: 77, visible: false })
    expect(copyBadge).toMatchObject({ x: 77, visible: false })

    // The outer component moves the nested instance: it is a layer of the outer instance.
    graph.updateNode(nested.id, { x: 120, y: 60, rotation: 15 })
    graph.syncInstances(outer.id)
    expect(nestedCopy).toMatchObject({ x: 120, y: 60, rotation: 15 })
    expect(outerInstance).toMatchObject({ x: 800, y: 0, rotation: 0 })
  })
})
