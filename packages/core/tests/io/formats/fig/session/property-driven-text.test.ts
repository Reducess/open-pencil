import { expect, test } from 'bun:test'

import { exportFigFile } from '@open-pencil/core/io'
import { initCodec } from '@open-pencil/core/kiwi'
import { createFigDocumentSession, materializeFigArchive } from '@open-pencil/fig'
import { SceneGraph } from '@open-pencil/scene-graph'

/**
 * The component lives on one page and the instance that assigns its label on another, so
 * loading the second page alone has to interpret the assignment and keep it: the resumed
 * load synchronises each component it places, which used to reset the text.
 */
async function archiveWithCrossPageAssignment() {
  const source = new SceneGraph()
  const library = source.getPages()[0]
  source.updateNode(library.id, { name: 'Library' })
  const item = source.createNode('COMPONENT', library.id, {
    name: 'NavItem',
    componentPropertyDefinitions: [
      { id: '207:1', name: 'Label', type: 'TEXT', defaultValue: 'Default' }
    ]
  })
  source.createNode('TEXT', item.id, {
    name: 'Label',
    text: 'Default',
    componentPropertyReferences: [{ propertyId: '207:1', field: 'TEXT' }]
  })
  const page = source.addPage('Dashboard')
  const instance = source.createInstance(item.id, page.id)
  source.updateNode(instance.id, { componentPropertyAssignments: { '207:1': 'Assigned' } })
  const bytes = await exportFigFile(source)
  return bytes.buffer as ArrayBuffer
}

function labelOf(graph: SceneGraph) {
  const page = graph.getPages().find((candidate) => candidate.name === 'Dashboard')
  if (!page) throw new Error('Missing page')
  const instance = graph.getChildren(page.id)[0]
  return graph.getChildren(instance.id)[0]?.text
}

test('a page loaded on its own keeps text its instance assigns', async () => {
  await initCodec()
  const archive = await archiveWithCrossPageAssignment()
  const session = createFigDocumentSession(archive)
  const placed = session.pages.find((page) => page.name === 'Dashboard')
  if (!placed) throw new Error('Missing source page')
  session.loadPage(placed.id)
  expect(labelOf(session.graph)).toBe('Assigned')
})

test('the whole document reads the same text', async () => {
  await initCodec()
  const { graph } = materializeFigArchive(await archiveWithCrossPageAssignment())
  expect(labelOf(graph)).toBe('Assigned')
})
