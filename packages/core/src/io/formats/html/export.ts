import type { NodeType, SceneGraph, SceneNode } from '@open-pencil/scene-graph'

import { collectTailwindClasses, nodeToStyle } from '#core/io/formats/jsx/tailwind-classes'

/** `tailwind`: utility classes on each element. `css`: one class per element plus a stylesheet. */
export type HTMLCodeFormat = 'tailwind' | 'css'

export interface HTMLCodeResult {
  /** Markup for the selection, one root element per selected node. */
  html: string
  /** Stylesheet for the `css` format; empty for `tailwind`. */
  css: string
}

const TAG: Partial<Record<NodeType, string>> = {
  FRAME: 'div',
  RECTANGLE: 'div',
  ROUNDED_RECTANGLE: 'div',
  ELLIPSE: 'div',
  TEXT: 'p',
  LINE: 'div',
  STAR: 'div',
  POLYGON: 'div',
  VECTOR: 'div',
  GROUP: 'div',
  SECTION: 'section',
  COMPONENT: 'div',
  COMPONENT_SET: 'div',
  INSTANCE: 'div'
}

const HTML_ENTITY: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;'
}

function escapeHTML(text: string): string {
  return text.replace(/[&<>"]/g, (character) => HTML_ENTITY[character])
}

function px(value: number): string {
  return `${Math.round(value * 100) / 100}px`
}

function isLaidOutByParent(node: SceneNode, parent: SceneNode | undefined): boolean {
  return !!parent && parent.layoutMode !== 'NONE' && node.layoutPositioning !== 'ABSOLUTE'
}

/**
 * What the JSX exporter's style leaves out and plain HTML needs: where a layer sits inside a
 * free-form parent, and the text properties a browser does not inherit from the design.
 */
function htmlOnlyStyle(
  node: SceneNode,
  graph: SceneGraph,
  isRoot: boolean
): Record<string, string> {
  const style: Record<string, string> = {}
  const parent = node.parentId ? graph.getNode(node.parentId) : undefined
  if (!isRoot && !isLaidOutByParent(node, parent)) {
    style.position = 'absolute'
    style.left = px(node.x)
    style.top = px(node.y)
  } else if (
    graph.getChildren(node.id).some((child) => child.visible && !isLaidOutByParent(child, node))
  ) {
    style.position = 'relative'
  }
  if (node.type === 'ELLIPSE') style.borderRadius = '50%'
  if (node.type === 'TEXT') {
    style.margin = '0'
    if (node.lineHeight != null) style.lineHeight = px(node.lineHeight)
    if (node.letterSpacing !== 0) style.letterSpacing = px(node.letterSpacing)
    if (node.italic) style.fontStyle = 'italic'
    if (node.textDecoration === 'UNDERLINE') style.textDecoration = 'underline'
    if (node.textDecoration === 'STRIKETHROUGH') style.textDecoration = 'line-through'
    if (node.textAutoResize === 'WIDTH_AND_HEIGHT') style.whiteSpace = 'nowrap'
  }
  return style
}

function kebab(property: string): string {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function slug(name: string): string {
  const cleaned = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!cleaned) return 'layer'
  return /^[a-z]/.test(cleaned) ? cleaned : `layer-${cleaned}`
}

type Emitter = {
  format: HTMLCodeFormat
  graph: SceneGraph
  rules: string[]
  usedClasses: Map<string, number>
}

function uniqueClass(emitter: Emitter, name: string): string {
  const base = slug(name)
  const count = (emitter.usedClasses.get(base) ?? 0) + 1
  emitter.usedClasses.set(base, count)
  return count === 1 ? base : `${base}-${count}`
}

function classAttribute(emitter: Emitter, node: SceneNode, isRoot: boolean): string {
  const extra = htmlOnlyStyle(node, emitter.graph, isRoot)
  if (emitter.format === 'tailwind') {
    return collectTailwindClasses(node, emitter.graph, extra).join(' ')
  }
  const style = { ...nodeToStyle(node, emitter.graph), ...extra }
  const declarations = Object.entries(style).map(
    ([property, value]) => `  ${kebab(property)}: ${value};`
  )
  if (declarations.length === 0) return ''
  const className = uniqueClass(emitter, node.name || node.type)
  emitter.rules.push(`.${className} {\n${declarations.join('\n')}\n}`)
  return className
}

function nodeToHTML(emitter: Emitter, node: SceneNode, indent: number, isRoot: boolean): string {
  const tag = TAG[node.type]
  if (!tag) return ''
  const prefix = '  '.repeat(indent)
  const classes = classAttribute(emitter, node, isRoot)
  const name = node.name && node.name !== node.type ? ` data-name="${escapeHTML(node.name)}"` : ''
  const opening = `<${tag}${name}${classes ? ` class="${classes}"` : ''}>`

  if (node.type === 'TEXT') {
    return `${prefix}${opening}${escapeHTML(node.text).replace(/\r?\n/g, '<br>')}</${tag}>`
  }

  const children = emitter.graph
    .getChildren(node.id)
    .filter((child) => child.visible)
    .map((child) => nodeToHTML(emitter, child, indent + 1, false))
    .filter(Boolean)
  if (children.length === 0) return `${prefix}${opening}</${tag}>`
  return [`${prefix}${opening}`, ...children, `${prefix}</${tag}>`].join('\n')
}

/**
 * Static HTML for the given nodes, styled with Tailwind utility classes or with a stylesheet.
 *
 * It covers what {@link nodeToStyle} covers — size, auto layout, padding, solid fill, single
 * stroke, radius, opacity, shadow, blur, font family/size/weight/alignment/colour — plus the
 * position of layers inside free-form frames and line height, letter spacing, italic and
 * decoration. Gradients, image fills, vector shapes, per-range text styles and masks are not
 * exported: those layers come out as plain boxes.
 */
export function selectionToHTML(
  nodeIds: string[],
  graph: SceneGraph,
  format: HTMLCodeFormat = 'tailwind'
): HTMLCodeResult {
  const emitter: Emitter = { format, graph, rules: [], usedClasses: new Map() }
  const html = nodeIds
    .map((id) => graph.getNode(id))
    .filter((node): node is SceneNode => node != null)
    .map((node) => nodeToHTML(emitter, node, 0, true))
    .filter(Boolean)
    .join('\n\n')
  return { html, css: emitter.rules.join('\n\n') }
}
