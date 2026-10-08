import { describe, expect, test } from 'bun:test'

import { SceneGraph } from '@open-pencil/scene-graph'

function setup() {
  const graph = new SceneGraph()
  const page = graph.addPage('Page')
  const component = graph.createNode('COMPONENT', page.id, { name: 'Card' })
  const header = graph.createNode('FRAME', component.id, { name: 'Header' })
  const body = graph.createNode('FRAME', component.id, { name: 'Body' })
  const instance = graph.createInstance(component.id, page.id)
  if (!instance) throw new Error('Instance was not created')
  const namesOf = (id: string) => graph.getChildren(id).map((node) => node.name)
  return { graph, page, component, header, body, instance, namesOf }
}

describe('instance sync when a component layer is gone', () => {
  test('the layer cloned from it is removed and announced', () => {
    const { graph, component, header, instance, namesOf } = setup()
    const [instHeader] = graph.getChildren(instance.id)
    const deleted: string[] = []
    const unbind = graph.onNodeEvents({ deleted: (id) => deleted.push(id) })

    graph.deleteNode(header.id)
    graph.syncInstances(component.id)
    unbind()

    expect(namesOf(instance.id)).toEqual(['Body'])
    expect(deleted).toEqual([header.id, instHeader.id])
  })

  test('layers without a source, or whose source still exists, stay', () => {
    const { graph, page, component, header, instance, namesOf } = setup()
    const elsewhere = graph.createNode('RECTANGLE', page.id, { name: 'Elsewhere' })
    // Imported instances carry children that were never linked to a source layer.
    graph.createNode('TEXT', instance.id, { name: 'Unlinked', componentId: null })
    graph.createNode('RECTANGLE', instance.id, { name: 'Pasted', componentId: elsewhere.id })

    graph.deleteNode(header.id)
    graph.syncInstances(component.id)

    expect(namesOf(instance.id)).toEqual(['Body', 'Unlinked', 'Pasted'])
  })

  test('a layer that returns under the same id restores the one the instance had', () => {
    const { graph, component, header, instance, namesOf } = setup()
    const [instHeader] = graph.getChildren(instance.id)
    graph.createNode('TEXT', instHeader.id, { name: 'Own note', componentId: null })
    const { id: headerId, parentId: _parentId, childIds: _childIds, type, ...props } = header

    graph.deleteNode(headerId)
    graph.syncInstances(component.id)
    graph.createNode(type, component.id, { ...props, id: headerId })
    graph.reorderChild(headerId, component.id, 0)
    graph.syncInstances(component.id)

    expect(namesOf(instance.id)).toEqual(['Header', 'Body'])
    expect(graph.getChildren(instance.id)[0].id).toBe(instHeader.id)
    expect(namesOf(instHeader.id)).toEqual(['Own note'])
  })
})
