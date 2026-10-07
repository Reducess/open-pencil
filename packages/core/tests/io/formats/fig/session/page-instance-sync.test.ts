import { expect, test } from 'bun:test'

import { exportFigFile } from '@open-pencil/core/io'
import { initCodec } from '@open-pencil/core/kiwi'
import { createFigDocumentSession } from '@open-pencil/fig'
import { SceneGraph } from '@open-pencil/scene-graph'

test('loading a later page keeps the derived sizes of instances earlier pages placed', async () => {
  await initCodec()
  const source = new SceneGraph()
  const first = source.getPages()[0]
  const component = source.createNode('COMPONENT', first.id, { name: 'Field', width: 200 })
  source.createNode('RECTANGLE', component.id, { name: 'Box', width: 100, height: 20 })
  const placed = source.createInstance(component.id, first.id)
  if (!placed) throw new Error('Missing instance')
  // The instance's box is wider than the component's, as a fill child of a resized instance is;
  // export saves that as the size Figma derived for it.
  const box = source.getChildren(placed.id)[0]
  source.updateNode(box.id, { width: 150 })
  source.createInstance(component.id, source.addPage('Second').id)
  const bytes = await exportFigFile(source)

  // The app's sessions read the sizes Figma derived, as this one does.
  const session = createFigDocumentSession(bytes.buffer as ArrayBuffer, { derivedBounds: true })
  session.loadPage(session.pages[0].id)
  const firstPageId = session.graphPageId(session.pages[0].id)
  const instance = session.graph
    .getChildren(firstPageId ?? '')
    .find((node) => node.type === 'INSTANCE')
  if (!instance) throw new Error('Missing loaded instance')
  const loadedBox = () => session.graph.getChildren(instance.id)[0]
  expect(loadedBox().width).toBe(150)

  session.loadPage(session.pages[1].id)
  expect(loadedBox().width).toBe(150)
})

/**
 * Syncing a whole component visits every instance of it in the graph, including those earlier
 * pages placed, whose sizes Figma derived. A resumed page syncs only the instances it places,
 * each once.
 */
test('a resumed page load syncs each instance it places once, never a whole component', async () => {
  await initCodec()
  const source = new SceneGraph()
  const library = source.getPages()[0]
  const component = source.createNode('COMPONENT', library.id, { name: 'Badge' })
  source.createNode('TEXT', component.id, { name: 'Label', text: 'Badge' })
  const page = source.addPage('Placed')
  for (let index = 0; index < 8; index++) source.createInstance(component.id, page.id)
  const bytes = await exportFigFile(source)

  const session = createFigDocumentSession(bytes.buffer as ArrayBuffer)
  const synced: string[] = []
  const wholeComponents: string[] = []
  const syncInstance = session.graph.syncInstance.bind(session.graph)
  session.graph.syncInstance = (instanceId: string) => {
    synced.push(instanceId)
    return syncInstance(instanceId)
  }
  const syncInstances = session.graph.syncInstances.bind(session.graph)
  session.graph.syncInstances = (componentId: string) => {
    wholeComponents.push(componentId)
    return syncInstances(componentId)
  }
  const placed = session.pages.find((candidate) => candidate.name === 'Placed')
  if (!placed) throw new Error('Missing placed page')
  session.loadPage(placed.id)

  const pageId = session.graphPageId(placed.id)
  if (!pageId) throw new Error('Missing materialized page')
  const instances = session.graph.getChildren(pageId)
  expect(instances).toHaveLength(8)
  expect(wholeComponents).toEqual([])
  expect(synced.toSorted()).toEqual(instances.map((instance) => instance.id).toSorted())
  for (const instance of instances)
    expect(session.graph.getChildren(instance.id)[0].text).toBe('Badge')
})
