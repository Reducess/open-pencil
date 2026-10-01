import { expect, test } from 'bun:test'

import { createEditor, graphFromPageSnapshot } from '@open-pencil/core/editor'
import { FigmaAPI } from '@open-pencil/core/figma-api'
import { ALL_TOOLS } from '@open-pencil/core/tools'

import { expectDefined } from '#core-tests/helpers/assert'

type ChangesResult = { diff?: string | null; message?: string; error?: string }

const diffChanges = expectDefined(
  ALL_TOOLS.find((tool) => tool.name === 'diff_changes'),
  'diff_changes'
)

function setup() {
  const editor = createEditor()
  const pageId = editor.state.currentPageId
  const card = editor.graph.createNode('FRAME', pageId, { name: 'Card', width: 100, height: 60 })
  editor.graph.createNode('RECTANGLE', pageId, { name: 'Untouched', x: 300 })
  const figma = new FigmaAPI(editor.graph)
  figma.currentPage = figma.wrapNode(pageId)
  const baselines = new Map<string, ReturnType<typeof editor.snapshotPage>>()
  figma.changeBaseline = (id) => {
    const snapshot = baselines.get(id)
    return snapshot ? graphFromPageSnapshot(editor.graph, snapshot) : null
  }
  /** Records a page's state before the run edits it, as the app does. */
  const startEditing = (id = pageId) => baselines.set(id, editor.snapshotPage(id))
  return { editor, pageId, card, figma, startEditing }
}

async function run(figma: FigmaAPI, args: Record<string, unknown> = {}) {
  return (await diffChanges.execute(figma, args)) as ChangesResult
}

test('diffs the page or one node as JSX against the page before the run edited it', async () => {
  const { editor, pageId, card, figma, startEditing } = setup()
  startEditing()
  editor.graph.updateNode(card.id, { width: 240 })
  editor.graph.createNode('ELLIPSE', pageId, { name: 'Badge' })

  const page = await run(figma)
  expect(page.diff).toMatch(/^-<Frame name="Card" w=\{100\}/m)
  expect(page.diff).toMatch(/^\+<Frame name="Card" w=\{240\}/m)
  expect(page.diff).toMatch(/^\+<Ellipse name="Badge"/m)
  expect(page.diff).not.toContain('Untouched')
  expect(page.diff).not.toContain('No newline at end of file')

  const node = await run(figma, { id: card.id })
  expect(node.diff).toMatch(/^\+<Frame name="Card" w=\{240\}/m)
  expect(node.diff).not.toContain('Badge')
})

test('sees properties a property patch leaves out, such as an auto-layout gap', async () => {
  const { editor, card, figma, startEditing } = setup()
  editor.graph.updateNode(card.id, { layoutMode: 'VERTICAL', itemSpacing: 8 })
  startEditing()
  editor.graph.updateNode(card.id, { itemSpacing: 24 })

  const result = await run(figma, { id: card.id })
  expect(result.diff).toContain('gap={8}')
  expect(result.diff).toContain('gap={24}')
})

test('shows a rename as a changed name, not a removed and re-added layer', async () => {
  const { editor, card, figma, startEditing } = setup()
  startEditing()
  editor.graph.updateNode(card.id, { name: 'Hero' })

  const result = await run(figma, { id: card.id })
  expect(result.diff).toMatch(/^-<Frame name="Card"/m)
  expect(result.diff).toMatch(/^\+<Frame name="Hero"/m)
})

test("compares a node on another page with that page's own baseline", async () => {
  const { editor, figma, startEditing } = setup()
  const other = editor.graph.addPage('Other')
  const elsewhere = editor.graph.createNode('FRAME', other.id, { name: 'Elsewhere' })
  startEditing()

  // The run edited only the current page, so the other page has no baseline.
  expect(await run(figma, { id: elsewhere.id })).toEqual({
    diff: null,
    message: 'This run has not changed that page'
  })
  startEditing(other.id)
  editor.graph.updateNode(elsewhere.id, { width: 50 })
  expect((await run(figma, { id: elsewhere.id })).diff).toContain('w={50}')
})

test('explains when there is no run or no edit to compare with', async () => {
  const { figma } = setup()
  const noRun = new FigmaAPI(figma.graph)
  noRun.currentPage = figma.currentPage
  expect((await run(noRun)).error).toContain('AI chat run')
  expect(await run(figma)).toEqual({ diff: null, message: 'This run has not changed that page' })
})
