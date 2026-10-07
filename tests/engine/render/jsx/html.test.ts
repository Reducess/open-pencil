import { describe, expect, test } from 'bun:test'

import { SceneGraph, selectionToHTML } from '@open-pencil/core'
import type { Fill } from '@open-pencil/scene-graph'

const solid = (r: number, g: number, b: number): Fill => ({
  type: 'SOLID',
  color: { r, g, b, a: 1 },
  opacity: 1,
  visible: true
})

function card() {
  const graph = new SceneGraph()
  const pageId = graph.getPages()[0].id
  const frame = graph.createNode('FRAME', pageId, {
    name: 'Cartão',
    x: 300,
    y: 200,
    width: 320,
    height: 200,
    fills: [solid(1, 1, 1)]
  })
  const title = graph.createNode('TEXT', frame.id, {
    name: 'Título',
    x: 24,
    y: 32,
    width: 200,
    height: 40,
    text: 'Olá <mundo> & cia\nsegunda linha',
    fontSize: 32,
    fontWeight: 700,
    lineHeight: 40,
    fills: [solid(0, 0, 0)]
  })
  const row = graph.createNode('FRAME', frame.id, {
    name: 'Linha',
    x: 24,
    y: 120,
    layoutMode: 'HORIZONTAL',
    itemSpacing: 8,
    primaryAxisSizing: 'HUG',
    counterAxisSizing: 'HUG'
  })
  graph.createNode('RECTANGLE', row.id, {
    name: 'Item',
    width: 40,
    height: 40,
    fills: [solid(1, 0, 0)]
  })
  graph.createNode('RECTANGLE', row.id, { name: 'Item', width: 40, height: 40, visible: false })
  graph.createNode('RECTANGLE', row.id, { name: 'Item', width: 40, height: 40, cornerRadius: 8 })
  return { graph, frame, title, row }
}

describe('HTML export', () => {
  test('tailwind: elements carry utility classes, text is escaped, hidden layers are left out', () => {
    const { graph, frame } = card()

    const { html, css } = selectionToHTML([frame.id], graph, 'tailwind')

    expect(css).toBe('')
    expect(html).toStartWith('<div data-name="Cartão" class="')
    expect(html).toContain('Olá &lt;mundo&gt; &amp; cia<br>segunda linha</p>')
    expect(html).not.toContain('className')
    expect(html).not.toContain('/>')
    expect(html.match(/data-name="Item"/g)?.length).toBe(2)
    expect(html).toMatch(/data-name="Linha" class="[^"]*\bflex\b[^"]*\bgap-2\b/)
  })

  test('layers inside a free-form frame are positioned; auto layout children are not', () => {
    const { graph, frame } = card()

    const { html } = selectionToHTML([frame.id], graph, 'tailwind')

    // The root is the reference box, wherever it sits on the canvas.
    expect(html).toMatch(/^<div data-name="Cartão" class="[^"]*\brelative\b/)
    expect(html).not.toContain('left-[300px]')
    expect(html).toMatch(/data-name="Título" class="[^"]*\babsolute\b[^"]*\btop-8\b[^"]*\bleft-6\b/)
    expect(html).not.toMatch(/data-name="Item" class="[^"]*\babsolute\b/)
  })

  test('css: one class per element and a stylesheet with the same declarations', () => {
    const { graph, frame } = card()

    const { html, css } = selectionToHTML([frame.id], graph, 'css')

    expect(html).toContain('<div data-name="Cartão" class="cartao">')
    expect(html).toContain('<p data-name="Título" class="titulo">')
    expect(html).toContain('class="item"')
    expect(html).toContain('class="item-2"')
    expect(css).toContain('.cartao {\n  width: 320px;\n  height: 200px;')
    expect(css).toMatch(/\.titulo \{[^}]*position: absolute;[^}]*left: 24px;[^}]*top: 32px;/)
    expect(css).toMatch(/\.titulo \{[^}]*font-size: 32px;[^}]*font-weight: 700;/)
    expect(css).toMatch(/\.titulo \{[^}]*line-height: 40px;/)
    expect(css).toMatch(/\.linha \{[^}]*display: flex;[^}]*gap: 8px;/)
    expect(css).toMatch(/\.item-2 \{[^}]*border-radius: 8px;/)
  })

  test('several nodes are exported side by side and unknown ids are ignored', () => {
    const { graph, title, row } = card()

    const { html } = selectionToHTML([title.id, 'missing', row.id], graph, 'css')

    expect(html.split('\n\n')).toHaveLength(2)
    expect(html).not.toContain('position: absolute')
  })
})
