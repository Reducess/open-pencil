import 'fake-indexeddb/auto'
import { afterEach, expect, test } from 'bun:test'

import { createEditorStore } from '@/app/editor/session/create'
import {
  addAgent,
  follow,
  presenceByPage,
  presenceOf,
  renameAgent,
  setOwnerColor,
  setPeers
} from '@/app/presence/registry'

const stores: ReturnType<typeof createEditorStore>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.dispose()
})

function setup() {
  const store = createEditorStore()
  stores.push(store)
  return { store, pageId: store.state.currentPageId, other: store.graph.addPage('Other').id }
}

const red = { r: 1, g: 0, b: 0, a: 1 }

test('draws active agents on their page, in their owner color', () => {
  const { store, pageId, other } = setup()
  const here = addAgent(store, 'chat')
  const there = addAgent(store, 'chat')
  here.update({ status: 'editing', cursor: { x: 5, y: 6, pageId } })
  there.update({ status: 'editing', cursor: { x: 1, y: 1, pageId: other } })
  setOwnerColor(store, red)
  expect(store.state.presenceCursors).toEqual([
    { kind: 'agent', name: here.name, color: red, x: 5, y: 6, selection: undefined }
  ])
})

test('hides idle agents and gives each a different callsign', () => {
  const { store, pageId } = setup()
  const agents = Array.from({ length: 5 }, () => addAgent(store, 'chat'))
  expect(new Set(agents.map((agent) => agent.name)).size).toBe(5)
  agents[0]?.update({ status: 'idle', cursor: { x: 0, y: 0, pageId } })
  expect(store.state.presenceCursors).toEqual([])
})

test('draws people and their agents with the person color', () => {
  const { store, pageId } = setup()
  setPeers(store, [
    {
      clientId: 3,
      name: 'Ana',
      color: red,
      cursor: { x: 1, y: 2, pageId },
      agents: [
        { id: 'a', name: 'Orbit', kind: 'mcp', status: 'thinking', cursor: { x: 3, y: 4, pageId } }
      ]
    }
  ])
  expect(
    store.state.presenceCursors.map(({ kind, name, color }) => ({ kind, name, color }))
  ).toEqual([
    { kind: 'person', name: 'Ana', color: red },
    { kind: 'agent', name: 'Orbit', color: red }
  ])
})

test('follows the page on screen', async () => {
  const { store, other } = setup()
  addAgent(store, 'chat').update({ status: 'editing', cursor: { x: 1, y: 1, pageId: other } })
  expect(store.state.presenceCursors).toHaveLength(0)
  store.preparationController.acknowledgePresentation(Number.MAX_SAFE_INTEGER)
  await store.switchPage(other)
  expect(store.state.presenceCursors).toHaveLength(1)
})

/** In app tests the viewport falls back to 1920 × 1080. */
function centered(store: ReturnType<typeof createEditorStore>) {
  const { panX, panY, zoom } = store.state
  return { x: (960 - panX) / zoom, y: (540 - panY) / zoom }
}

test('following an agent takes the view to its page and keeps its cursor centered', async () => {
  const { store, other } = setup()
  store.preparationController.acknowledgePresentation(Number.MAX_SAFE_INTEGER)
  const agent = addAgent(store, 'chat')
  agent.update({ status: 'editing', cursor: { x: 300, y: 200, pageId: other } })
  const switched = new Promise<string>((resolve) => {
    store.onEditorEvent('page:changed', resolve)
  })
  follow(store, { kind: 'agent', agentId: agent.id })
  expect(await switched).toBe(other)
  expect(centered(store)).toEqual({ x: 300, y: 200 })

  agent.update({ cursor: { x: 500, y: 100, pageId: other } })
  expect(centered(store)).toEqual({ x: 500, y: 100 })
})

test('an idle agent keeps its followers; a departed one releases them', () => {
  const { store, pageId } = setup()
  const agent = addAgent(store, 'chat')
  agent.update({ status: 'editing', cursor: { x: 10, y: 10, pageId } })
  follow(store, { kind: 'agent', agentId: agent.id })
  agent.update({ status: 'idle', cursor: undefined })
  expect(presenceOf(store).following.value).toEqual({ kind: 'agent', agentId: agent.id })
  agent.remove()
  expect(presenceOf(store).following.value).toBeNull()
})

test('following a person matches their zoom, and stops when they leave', () => {
  const { store, pageId } = setup()
  const ana = { clientId: 4, name: 'Ana', color: red, agents: [] }
  setPeers(store, [{ ...ana, cursor: { x: 40, y: 50, pageId, zoom: 2 } }])
  follow(store, { kind: 'person', clientId: 4 })
  expect(store.state.zoom).toBe(2)
  expect(centered(store)).toEqual({ x: 40, y: 50 })
  setPeers(store, [])
  expect(presenceOf(store).following.value).toBeNull()
})

test('renames our agents, and their handles report the new name', () => {
  const { store } = setup()
  const agent = addAgent(store, 'chat')
  renameAgent(store, agent.id, '  Juniper  ')
  expect(agent.name).toBe('Juniper')
  renameAgent(store, agent.id, '   ')
  expect(agent.name).toBe('Juniper')
})

test("lists people and working agents by page, knowing an agent's page before its first edit", () => {
  const { store, pageId, other } = setup()
  setPeers(store, [
    {
      clientId: 5,
      name: 'Ana',
      color: red,
      cursor: { x: 0, y: 0, pageId },
      agents: [{ id: 'o', name: 'Orbit', kind: 'mcp', status: 'idle', pageId: other }]
    }
  ])
  const thinking = addAgent(store, 'chat')
  thinking.update({ status: 'thinking', pageId: other })
  expect(
    presenceByPage(store)
      .get(pageId)
      ?.map((entry) => entry.name)
  ).toEqual(['Ana'])
  expect(presenceByPage(store).get(other)).toEqual([
    { kind: 'agent', name: thinking.name, color: expect.anything() }
  ])
})
