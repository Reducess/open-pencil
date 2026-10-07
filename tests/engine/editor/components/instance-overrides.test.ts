import { describe, expect, test } from 'bun:test'

import { createEditor } from '@open-pencil/core/editor'
import { hasInstanceOverride, type Fill } from '@open-pencil/scene-graph'

const solid = (r: number, g: number, b: number): Fill => ({
  type: 'SOLID',
  color: { r, g, b, a: 1 },
  opacity: 1,
  visible: true
})

/** Component sync runs in a microtask after the edit. */
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
  const label = editor.graph.createNode('TEXT', component.id, { name: 'Title', text: 'Hello' })
  const edited = editor.graph.getNode(editor.createInstanceFromComponent(component.id) ?? '')
  const untouched = editor.graph.getNode(editor.createInstanceFromComponent(component.id) ?? '')
  if (!edited || !untouched) throw new Error('Instances were not created')
  const titleOf = (instanceId: string) => editor.graph.getChildren(instanceId)[0]
  return { editor, component, label, edited, untouched, titleOf }
}

describe('instance overrides from editor edits', () => {
  test('a fill edited on an instance survives a change to the main component', async () => {
    const { editor, component, edited, untouched } = setup()

    editor.updateNodeWithUndo(edited.id, { fills: [solid(0, 0, 1)] }, 'Change fill')
    expect(hasInstanceOverride(editor.graph, edited.id, 'fills')).toBe(true)

    editor.updateNodeWithUndo(component.id, { fills: [solid(0, 1, 0)], cornerRadius: 12 }, 'Edit')
    await settle()

    expect(edited.fills[0].color).toEqual({ r: 0, g: 0, b: 1, a: 1 })
    expect(edited.cornerRadius).toBe(12)
    expect(untouched.fills[0].color).toEqual({ r: 0, g: 1, b: 0, a: 1 })
    editor.dispose()
  })

  test('text and size edited inside an instance are overrides of that instance only', async () => {
    const { editor, component, label, edited, untouched, titleOf } = setup()

    editor.updateNodeWithUndo(titleOf(edited.id).id, { text: 'Mine', fontSize: 20 }, 'Edit text')
    editor.updateNode(edited.id, { width: 320 })
    editor.updateNodeWithUndo(label.id, { text: 'Shared', fontSize: 14 }, 'Edit main')
    editor.updateNodeWithUndo(component.id, { width: 240 }, 'Resize main')
    await settle()

    expect(titleOf(edited.id)).toMatchObject({ text: 'Mine', fontSize: 20 })
    expect(edited.width).toBe(320)
    expect(titleOf(untouched.id)).toMatchObject({ text: 'Shared', fontSize: 14 })
    expect(untouched.width).toBe(240)
    editor.dispose()
  })

  test('undoing the edit removes the override, so the instance follows the component again', async () => {
    const { editor, component, edited } = setup()

    editor.updateNodeWithUndo(edited.id, { fills: [solid(0, 0, 1)] }, 'Change fill')
    editor.undo.undo()
    expect(hasInstanceOverride(editor.graph, edited.id, 'fills')).toBe(false)

    editor.updateNodeWithUndo(component.id, { fills: [solid(0, 1, 0)] }, 'Edit')
    await settle()
    expect(edited.fills[0].color).toEqual({ r: 0, g: 1, b: 0, a: 1 })

    editor.undo.undo()
    editor.undo.redo()
    editor.undo.redo()
    expect(hasInstanceOverride(editor.graph, edited.id, 'fills')).toBe(false)
    editor.dispose()
  })

  test('a previewed edit (panel scrub) records the override on commit and not on cancel', () => {
    const { editor, edited } = setup()

    const cancelled = editor.beginNodePreview('Opacity')
    cancelled.update(edited.id, { opacity: 0.5 })
    cancelled.cancel()
    expect(hasInstanceOverride(editor.graph, edited.id, 'opacity')).toBe(false)

    const committed = editor.beginNodePreview('Opacity')
    committed.update(edited.id, { opacity: 0.4 })
    committed.update(edited.id, { opacity: 0.3 })
    committed.commit()
    expect(hasInstanceOverride(editor.graph, edited.id, 'opacity')).toBe(true)

    editor.undo.undo()
    expect(edited.opacity).toBe(1)
    expect(hasInstanceOverride(editor.graph, edited.id, 'opacity')).toBe(false)
    editor.dispose()
  })

  test('resizing an instance on the canvas keeps its size through component changes', async () => {
    const { editor, component, edited } = setup()
    const original = { x: edited.x, y: edited.y, width: edited.width, height: edited.height }

    editor.graph.updateNode(edited.id, { width: 400, height: 150 })
    editor.commitResize(edited.id, original)
    editor.updateNodeWithUndo(component.id, { width: 260, height: 90 }, 'Resize main')
    await settle()

    expect(edited).toMatchObject({ width: 400, height: 150 })
    editor.dispose()
  })

  test('edits outside an instance and fields that are not synced record nothing', () => {
    const { editor, component, edited } = setup()

    editor.updateNodeWithUndo(component.id, { opacity: 0.5 }, 'Edit main')
    editor.updateNodeWithUndo(edited.id, { x: 900, rotation: 10 }, 'Move')

    expect(edited.instanceOverrides.self.size).toBe(0)
    editor.dispose()
  })
})
