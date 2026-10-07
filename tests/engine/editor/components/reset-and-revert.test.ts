import { describe, expect, test } from 'bun:test'

import { createEditor } from '@open-pencil/core/editor'
import type { Fill } from '@open-pencil/scene-graph'

const solid = (r: number, g: number, b: number): Fill => ({
  type: 'SOLID',
  color: { r, g, b, a: 1 },
  opacity: 1,
  visible: true
})

const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve))

function setup() {
  const editor = createEditor()
  const pageId = editor.graph.getPages()[0].id
  const component = editor.graph.createNode('COMPONENT', pageId, {
    name: 'Card',
    width: 200,
    height: 100,
    fills: [solid(1, 0, 0)]
  })
  editor.graph.createNode('TEXT', component.id, { name: 'Title', text: 'Hello' })
  editor.graph.createNode('RECTANGLE', component.id, { name: 'Badge', width: 20, height: 20 })
  const instance = editor.graph.getNode(
    editor.createInstanceFromComponent(component.id, 500, 300) ?? ''
  )
  if (!instance) throw new Error('Instance was not created')
  const layer = (name: string) => {
    const found = editor.graph.getChildren(instance.id).find((child) => child.name === name)
    if (!found) throw new Error(`Missing layer ${name}`)
    return found
  }
  return { editor, component, instance, layer }
}

describe('resetInstanceOverrides', () => {
  test('puts fill, text, size and visibility back to the component and is one undo step', () => {
    const { editor, instance, layer } = setup()
    expect(editor.instanceHasOverrides(instance.id)).toBe(false)
    expect(editor.resetInstanceOverrides(instance.id)).toBe(false)

    editor.updateNodeWithUndo(instance.id, { fills: [solid(0, 0, 1)], width: 320 }, 'Edit')
    editor.updateNodeWithUndo(layer('Title').id, { text: 'Mine' }, 'Edit text')
    editor.updateNodeWithUndo(layer('Badge').id, { visible: false }, 'Hide')
    expect(editor.instanceHasOverrides(instance.id)).toBe(true)

    expect(editor.resetInstanceOverrides(instance.id)).toBe(true)
    expect(instance.fills[0].color).toEqual({ r: 1, g: 0, b: 0, a: 1 })
    expect(instance).toMatchObject({ width: 200, x: 500, y: 300 })
    expect(layer('Title').text).toBe('Hello')
    expect(layer('Badge').visible).toBe(true)
    expect(editor.instanceHasOverrides(instance.id)).toBe(false)

    editor.undo.undo()
    expect(instance.fills[0].color).toEqual({ r: 0, g: 0, b: 1, a: 1 })
    expect(instance.width).toBe(320)
    expect(layer('Title').text).toBe('Mine')
    expect(layer('Badge').visible).toBe(false)
    expect(editor.instanceHasOverrides(instance.id)).toBe(true)

    editor.undo.redo()
    expect(layer('Title').text).toBe('Hello')
    editor.dispose()
  })

  test('after a reset the instance follows the component again', async () => {
    const { editor, component, instance } = setup()
    editor.updateNodeWithUndo(instance.id, { fills: [solid(0, 0, 1)] }, 'Edit')
    editor.resetInstanceOverrides(instance.id)

    editor.updateNodeWithUndo(component.id, { fills: [solid(0, 1, 0)] }, 'Edit main')
    await settle()

    expect(instance.fills[0].color).toEqual({ r: 0, g: 1, b: 0, a: 1 })
    editor.dispose()
  })
})

describe('revertComponent', () => {
  test('makes the component a frame, detaches its instances and undoes as one step', () => {
    const { editor, component, instance } = setup()
    editor.updateNodeWithUndo(instance.id, { fills: [solid(0, 0, 1)] }, 'Edit')

    expect(editor.revertComponent(component.id)).toBe(true)
    expect(component.type).toBe('FRAME')
    expect(instance).toMatchObject({ type: 'FRAME', componentId: null })
    expect(editor.graph.getInstances(component.id)).toEqual([])
    expect(instance.fills[0].color).toEqual({ r: 0, g: 0, b: 1, a: 1 })

    editor.undo.undo()
    expect(component.type).toBe('COMPONENT')
    expect(instance).toMatchObject({ type: 'INSTANCE', componentId: component.id })
    expect(editor.graph.getInstances(component.id).map((node) => node.id)).toEqual([instance.id])
    expect(editor.instanceHasOverrides(instance.id)).toBe(true)

    editor.undo.redo()
    expect(component.type).toBe('FRAME')
    editor.dispose()
  })

  test('refuses frames and variants', () => {
    const { editor, component, instance } = setup()
    const pageId = editor.graph.getPages()[0].id
    const set = editor.graph.createNode('COMPONENT_SET', pageId, {})
    const variant = editor.graph.createNode('COMPONENT', set.id, {})

    expect(editor.revertComponent(instance.id)).toBe(false)
    expect(editor.revertComponent(variant.id)).toBe(false)
    expect(component.type).toBe('COMPONENT')
    editor.dispose()
  })
})
