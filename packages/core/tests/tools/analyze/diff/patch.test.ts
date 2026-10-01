import { describe, expect, test } from 'bun:test'

import { FigmaAPI } from '@open-pencil/core/figma-api'
import { ALL_TOOLS, diffDocuments } from '@open-pencil/core/tools'
import { SceneGraph } from '@open-pencil/scene-graph'

import { expectDefined, getNodeOrThrow } from '#core-tests/helpers/assert'

type DiffResult = { diff?: string | null; error?: string }
type ApplyResult = {
  error?: string
  applied?: number
  failed?: number
  results?: { status: string; error?: string; changes?: string[] }[]
}

function tool(name: string) {
  return expectDefined(
    ALL_TOOLS.find((candidate) => candidate.name === name),
    name
  )
}

async function run<Result>(figma: FigmaAPI, name: string, args: Record<string, unknown>) {
  return (await tool(name).execute(figma, args)) as Result
}

function setup() {
  const graph = new SceneGraph()
  const figma = new FigmaAPI(graph)
  const card = figma.createFrame()
  card.name = 'Card'
  card.resize(200, 100)
  card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true }]
  const label = figma.createRectangle()
  label.name = 'Label'
  label.resize(80, 20)
  card.appendChild(label)
  return { graph, figma, card, label }
}

describe('diff_create and diff_apply', () => {
  test('a patch from a modified copy makes the original match it', async () => {
    const { graph, figma, card } = setup()
    const copy = card.clone()
    copy.name = 'Card copy'
    copy.opacity = 0.5
    copy.cornerRadius = 12
    const copiedLabel = expectDefined(copy.children[0], 'copied label')
    copiedLabel.resize(120, 24)

    const created = await run<DiffResult>(figma, 'diff_create', { from: card.id, to: copy.id })
    const patch = expectDefined(created.diff, 'patch')
    expect(patch).toContain('+opacity: 0.5')
    expect(patch).toContain('+size: 120 24')

    const applied = await run<ApplyResult>(figma, 'diff_apply', { patch })
    expect(applied.failed).toBe(0)
    expect(applied.applied).toBe(2)
    expect(getNodeOrThrow(graph, card.id).opacity).toBe(0.5)
    expect(getNodeOrThrow(graph, card.id).cornerRadius).toBe(12)

    const after = await run<DiffResult>(figma, 'diff_create', { from: card.id, to: copy.id })
    expect(after.diff).toBeNull()
  })

  test('rejects a stale patch without changing any node', async () => {
    const { graph, figma, card } = setup()
    const copy = card.clone()
    copy.opacity = 0.5
    const copiedLabel = expectDefined(copy.children[0], 'copied label')
    copiedLabel.resize(120, 24)
    const patch = expectDefined(
      (await run<DiffResult>(figma, 'diff_create', { from: card.id, to: copy.id })).diff,
      'patch'
    )
    card.resize(300, 100)

    const applied = await run<ApplyResult>(figma, 'diff_apply', { patch })
    expect(applied.error).toBe('Patch does not apply')
    expect(applied.results?.[0]?.error).toContain('size: expected 200 100, found 300 100')
    // The label still matched, but a stale patch must not half-apply.
    expect(getNodeOrThrow(graph, card.children[0].id).width).toBe(80)
    expect(getNodeOrThrow(graph, card.id).opacity).toBe(1)
  })

  test.each([false, true])(
    'rejects a patch with an invalid value without changing any node (force: %p)',
    async (force) => {
      const { graph, figma, card, label } = setup()
      const copy = card.clone()
      copy.opacity = 0.5
      expectDefined(copy.children[0], 'copied label').resize(120, 24)
      const patch = expectDefined(
        (await run<DiffResult>(figma, 'diff_create', { from: card.id, to: copy.id })).diff,
        'patch'
      ).replace('+size: 120 24', '+size: wide 24')

      const applied = await run<ApplyResult>(figma, 'diff_apply', { patch, force })
      expect(applied.error).toBe('Patch does not apply')
      // The card's change was valid, but it must not land without the label's.
      expect(getNodeOrThrow(graph, card.id).opacity).toBe(1)
      expect(getNodeOrThrow(graph, label.id).width).toBe(80)
    }
  )

  test('rejects a patch that adds a property the node has since gained', async () => {
    const { figma, label } = setup()
    const patch = expectDefined(
      (
        await run<DiffResult>(figma, 'diff_show', {
          id: label.id,
          props: JSON.stringify({ stroke: '#000000' })
        })
      ).diff,
      'patch'
    )
    label.strokes = [
      { color: { r: 1, g: 0, b: 0, a: 1 }, weight: 2, opacity: 1, visible: true, align: 'INSIDE' }
    ]

    const applied = await run<ApplyResult>(figma, 'diff_apply', { patch })
    expect(applied.results?.[0]?.error).toContain('stroke: expected (default), found #FF0000')
  })

  test('dry run reports changes without applying them', async () => {
    const { graph, figma, card } = setup()
    const copy = card.clone()
    copy.opacity = 0.25
    const patch = expectDefined(
      (await run<DiffResult>(figma, 'diff_create', { from: card.id, to: copy.id })).diff,
      'patch'
    )

    const applied = await run<ApplyResult>(figma, 'diff_apply', { patch, dryRun: true })
    expect(applied.results?.[0]?.changes).toEqual(['opacity'])
    expect(getNodeOrThrow(graph, card.id).opacity).toBe(1)
  })

  test('deletes children the target no longer has', async () => {
    const { graph, figma, card, label } = setup()
    const copy = card.clone()
    expectDefined(copy.children[0], 'copied label').remove()
    const patch = expectDefined(
      (await run<DiffResult>(figma, 'diff_create', { from: card.id, to: copy.id })).diff,
      'patch'
    )

    const applied = await run<ApplyResult>(figma, 'diff_apply', { patch })
    expect(applied.results?.map((result) => result.status)).toEqual(['deleted'])
    expect(graph.getNode(label.id)).toBeUndefined()
  })
})

describe('diff_show', () => {
  test('previews proposed properties without changing the node', async () => {
    const { graph, figma, card } = setup()

    const shown = await run<DiffResult>(figma, 'diff_show', {
      id: card.id,
      props: JSON.stringify({ fill: '#FF0000', width: 240, opacity: 0.5 })
    })
    const patch = expectDefined(shown.diff, 'patch')
    expect(patch).toContain('-fill: #FFFFFF')
    expect(patch).toContain('+fill: #FF0000')
    expect(patch).toContain('+size: 240 100')
    expect(patch).toContain('+opacity: 0.5')
    expect(getNodeOrThrow(graph, card.id).width).toBe(200)

    await run<ApplyResult>(figma, 'diff_apply', { patch })
    const node = getNodeOrThrow(graph, card.id)
    expect(node.width).toBe(240)
    expect(node.opacity).toBe(0.5)
    expect(node.fills[0]?.color).toEqual({ r: 1, g: 0, b: 0, a: 1 })
  })

  test('rejects unknown properties', async () => {
    const { figma, card } = setup()
    const shown = await run<DiffResult>(figma, 'diff_show', {
      id: card.id,
      props: JSON.stringify({ opacity: 'half' })
    })
    expect(shown.error).toContain('Invalid props')
  })
})

describe('diffDocuments', () => {
  test('matches pages by name and nodes by path across documents', () => {
    const before = setup()
    const after = setup()
    after.label.resize(80, 40)
    const extra = after.figma.createEllipse()
    extra.name = 'Badge'

    const result = diffDocuments(before.graph, after.graph)
    expect(result.pages.map((page) => page.status)).toEqual(['changed'])
    const diff = expectDefined(result.diff, 'document diff')
    expect(diff).toContain('/Page 1/Card/Label')
    expect(diff).toContain('+size: 80 40')
    expect(diff).toContain('+++ /Page 1/Badge')
  })

  test('reports identical documents as unchanged', () => {
    const result = diffDocuments(setup().graph, setup().graph)
    expect(result.diff).toBeNull()
    expect(result.pages.map((page) => page.status)).toEqual(['unchanged'])
  })
})
