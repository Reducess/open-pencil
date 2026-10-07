import { beforeAll, describe, expect, test } from 'bun:test'

import {
  headlessRenderNodes,
  initCanvasKit,
  SceneGraph,
  SkiaRenderer,
  type TextRenderIssue
} from '@open-pencil/core'
import type { SceneNode } from '@open-pencil/scene-graph'

import { collectTextRenderIssues } from '#core/canvas'

import { expectDefined } from '#tests/helpers/assert'

type Readiness = ReturnType<SkiaRenderer['nodeFontReadiness']>

/** Stands in for a renderer: readiness is decided by the node's font family. */
function readinessByFamily(states: Record<string, Readiness>) {
  const asked: string[] = []
  return {
    asked,
    nodeFontReadiness: (node: SceneNode): Readiness => {
      asked.push(node.id)
      return states[node.fontFamily] ?? 'ready'
    }
  }
}

function text(graph: SceneGraph, parentId: string, overrides: Partial<SceneNode>): SceneNode {
  return graph.createNode('TEXT', parentId, { text: 'Hello', width: 80, height: 20, ...overrides })
}

describe('text render issues', () => {
  test('lists the visible text nodes whose fonts are not ready, with the faces they ask for', () => {
    const graph = new SceneGraph()
    const pageId = graph.getPages()[0].id
    const frame = graph.createNode('FRAME', pageId, { width: 300, height: 300 })
    text(graph, frame.id, { name: 'Fine', fontFamily: 'Inter' })
    const missing = text(graph, frame.id, {
      name: 'Title',
      fontFamily: 'Poppins',
      fontWeight: 600,
      styleRuns: [{ start: 0, length: 2, style: { fontFamily: 'Lora', italic: true } }]
    })
    const glyphs = text(graph, frame.id, { name: 'CJK', fontFamily: 'Roboto', text: '你好' })
    const loading = text(graph, frame.id, { name: 'Loading', fontFamily: 'Slow' })
    const hidden = text(graph, frame.id, { name: 'Hidden', fontFamily: 'Poppins', visible: false })
    const hiddenGroup = graph.createNode('GROUP', frame.id, { visible: false })
    const insideHidden = text(graph, hiddenGroup.id, { fontFamily: 'Poppins' })
    const empty = text(graph, frame.id, { name: 'Empty', fontFamily: 'Poppins', text: '' })
    const elsewhere = text(graph, pageId, { name: 'Elsewhere', fontFamily: 'Poppins' })

    const renderer = readinessByFamily({
      Poppins: 'substituted',
      Roboto: 'exhausted',
      Slow: 'pending'
    })
    const issues = collectTextRenderIssues(renderer, graph, [frame.id])

    expect(issues).toEqual([
      {
        nodeId: missing.id,
        nodeName: 'Title',
        readiness: 'substituted',
        fonts: [
          { family: 'Poppins', style: 'SemiBold' },
          { family: 'Lora', style: 'SemiBold Italic' }
        ]
      },
      {
        nodeId: glyphs.id,
        nodeName: 'CJK',
        readiness: 'exhausted',
        fonts: [{ family: 'Roboto', style: 'Regular' }]
      },
      {
        nodeId: loading.id,
        nodeName: 'Loading',
        readiness: 'pending',
        fonts: [{ family: 'Slow', style: 'Regular' }]
      }
    ])
    for (const skipped of [hidden, insideHidden, empty, elsewhere]) {
      expect(renderer.asked).not.toContain(skipped.id)
    }
    expect(collectTextRenderIssues(renderer, graph, pageId).map((issue) => issue.nodeId)).toEqual([
      missing.id,
      glyphs.id,
      loading.id,
      elsewhere.id
    ])
  })

  describe('with a real renderer', () => {
    let ck: Awaited<ReturnType<typeof initCanvasKit>>
    const family = `NoSuchFamily${Date.now()}`

    function documentWithMissingFont() {
      const graph = new SceneGraph()
      const pageId = graph.getPages()[0].id
      const frame = graph.createNode('FRAME', pageId, { width: 200, height: 80 })
      const node = text(graph, frame.id, { name: 'Headline', fontFamily: family, fontWeight: 700 })
      return { graph, pageId, frame, node }
    }

    beforeAll(async () => {
      ck = await initCanvasKit()
    })

    test('the renderer reports a text node whose family was never loaded', async () => {
      const { graph, pageId, frame, node } = documentWithMissingFont()
      const renderer = new SkiaRenderer(ck, expectDefined(ck.MakeSurface(1, 1), 'surface'))
      try {
        await renderer.loadFonts()
        const restore = await renderer.prepareForExport(graph, pageId, [frame.id])
        try {
          const issues = renderer.textRenderIssues(graph, [frame.id])
          expect(issues).toHaveLength(1)
          expect(issues[0]).toMatchObject({
            nodeId: node.id,
            nodeName: 'Headline',
            fonts: [{ family, style: 'Bold' }]
          })
          expect(issues[0].readiness).not.toBe('ready')
        } finally {
          restore()
        }
      } finally {
        renderer.destroy()
      }
    })

    test('headlessRenderNodes hands the issues to the caller after rendering', async () => {
      const { graph, pageId, frame, node } = documentWithMissingFont()
      const reported: TextRenderIssue[][] = []
      const image = await headlessRenderNodes(graph, pageId, [frame.id], {
        onTextIssues: (issues) => reported.push(issues)
      })
      expect(image).not.toBeNull()
      expect(reported).toHaveLength(1)
      expect(reported[0].map((issue) => issue.nodeId)).toEqual([node.id])
      expect(reported[0][0].fonts).toEqual([{ family, style: 'Bold' }])

      const clean = new SceneGraph()
      const cleanPage = clean.getPages()[0].id
      const shape = clean.createNode('RECTANGLE', cleanPage, { width: 10, height: 10 })
      const none: TextRenderIssue[][] = []
      await headlessRenderNodes(clean, cleanPage, [shape.id], {
        onTextIssues: (issues) => none.push(issues)
      })
      expect(none).toEqual([[]])
    })
  })
})
