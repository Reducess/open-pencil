import { expect, test } from 'bun:test'

import { createEditor } from '@open-pencil/core/editor'

test('an instance detached and restored by undo follows its component again', async () => {
  const editor = createEditor()
  const pageId = editor.graph.getPages()[0].id
  const component = editor.graph.createNode('COMPONENT', pageId, { width: 200, height: 100 })
  const instanceId = editor.createInstanceFromComponent(component.id) ?? ''

  editor.select([instanceId])
  editor.detachInstance()
  expect(editor.graph.getInstances(component.id)).toEqual([])

  editor.undo.undo()
  expect(editor.graph.getInstances(component.id).map((node) => node.id)).toEqual([instanceId])

  editor.updateNodeWithUndo(component.id, { cornerRadius: 16 }, 'Edit main')
  await new Promise<void>((resolve) => queueMicrotask(resolve))
  expect(editor.graph.getNode(instanceId)?.cornerRadius).toBe(16)
  editor.dispose()
})
