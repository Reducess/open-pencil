import type { BlendMode, Color, Effect, Fill, SceneNode, Stroke } from '@open-pencil/scene-graph'
import { colorToHex8, parseColor } from '@open-pencil/scene-graph/color'

import type { FigmaNodeProxy } from '#core/figma-api'
import { toFigmaEffect } from '#core/figma-api/effects'

/**
 * Line-oriented node property format shared by `diff_create`, `diff_show`, and `diff_apply`.
 * One `key: value` per line; `effect` may repeat. Absent keys mean the default value.
 */
type NodeProps = Map<string, string[]>

const EFFECT_TYPES = new Set<Effect['type']>([
  'DROP_SHADOW',
  'INNER_SHADOW',
  'LAYER_BLUR',
  'BACKGROUND_BLUR',
  'FOREGROUND_BLUR'
])

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function paintHex(color: Color, opacity: number): string {
  return colorToHex8(color, round(color.a * opacity))
}

function firstSolidFill(node: SceneNode): Fill | undefined {
  return node.fills.find((fill) => fill.type === 'SOLID' && fill.visible)
}

function firstVisibleStroke(node: SceneNode): Stroke | undefined {
  return node.strokes.find((stroke) => stroke.visible)
}

function serializeEffect(effect: Effect): string {
  const parts = [
    effect.type,
    `r=${round(effect.radius)}`,
    `c=${colorToHex8(effect.color)}`,
    `x=${round(effect.offset.x)} y=${round(effect.offset.y)}`,
    `s=${round(effect.spread)}`
  ]
  if (!effect.visible) parts.push('hidden')
  return parts.join(' ')
}

function serializePaints(node: SceneNode, lines: string[]): void {
  const fill = firstSolidFill(node)
  if (fill) lines.push(`fill: ${paintHex(fill.color, fill.opacity)}`)
  const stroke = firstVisibleStroke(node)
  if (stroke) {
    lines.push(`stroke: ${paintHex(stroke.color, stroke.opacity)}`)
    if (stroke.weight) lines.push(`strokeWeight: ${round(stroke.weight)}`)
  }
}

function serializeRadii(node: SceneNode, lines: string[]): void {
  const {
    topLeftRadius: tl,
    topRightRadius: tr,
    bottomRightRadius: br,
    bottomLeftRadius: bl
  } = node
  if (!tl && !tr && !br && !bl) return
  lines.push(
    tl === tr && tr === br && br === bl
      ? `radius: ${round(tl)}`
      : `radii: ${[tl, tr, br, bl].map(round).join(' ')}`
  )
}

function serializeText(node: SceneNode, lines: string[]): void {
  if (node.type !== 'TEXT') return
  if (node.text) lines.push(`text: ${JSON.stringify(node.text)}`)
  if (node.fontSize) lines.push(`fontSize: ${round(node.fontSize)}`)
  if (node.fontFamily) lines.push(`fontFamily: ${node.fontFamily}`)
  if (node.fontWeight) lines.push(`fontWeight: ${node.fontWeight}`)
}

export function serializeNodeProps(node: SceneNode): string {
  const lines: string[] = []
  lines.push(`type: ${node.type}`)
  lines.push(`size: ${round(node.width)} ${round(node.height)}`)
  lines.push(`pos: ${round(node.x)} ${round(node.y)}`)
  serializePaints(node, lines)
  if (node.opacity !== 1) lines.push(`opacity: ${round(node.opacity)}`)
  serializeRadii(node, lines)
  if (node.blendMode !== 'NORMAL') lines.push(`blendMode: ${node.blendMode}`)
  if (node.rotation !== 0) lines.push(`rotation: ${round(node.rotation)}`)
  if (node.clipsContent) lines.push('clipsContent: true')
  for (const effect of node.effects) lines.push(`effect: ${serializeEffect(effect)}`)
  serializeText(node, lines)
  if (!node.visible) lines.push('visible: false')
  if (node.locked) lines.push('locked: true')
  return lines.join('\n')
}

export function parseNodeProps(text: string): NodeProps {
  const props: NodeProps = new Map()
  for (const line of text.split('\n')) {
    const separator = line.indexOf(': ')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 2).trim()
    props.set(key, [...(props.get(key) ?? []), value])
  }
  return props
}

/** Keys whose values differ, with `null` for keys the new state drops (reset to default). */
export function diffNodeProps(before: NodeProps, after: NodeProps): Map<string, string[] | null> {
  const changes = new Map<string, string[] | null>()
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const oldValue = before.get(key)
    const newValue = after.get(key)
    if (oldValue?.join('\n') === newValue?.join('\n')) continue
    changes.set(key, newValue ?? null)
  }
  return changes
}

type PropMismatch = { key: string; expected: string; actual: string }

/**
 * Expected values that disagree with the node's current state. `touched` keys the patch sets but
 * whose old value it omits must still be at their default, or the patch was made against another state.
 */
export function findPropMismatches(
  expected: NodeProps,
  actual: NodeProps,
  touched: Iterable<string> = []
): PropMismatch[] {
  const mismatches: PropMismatch[] = []
  const describe = (props: NodeProps, key: string) => props.get(key)?.join('\n') ?? '(default)'
  for (const key of new Set([...expected.keys(), ...touched])) {
    const wanted = describe(expected, key)
    const current = describe(actual, key)
    if (current !== wanted) mismatches.push({ key, expected: wanted, actual: current })
  }
  return mismatches
}

function numbers(value: string, count: number, key: string): number[] {
  const parsed = value.split(/\s+/).map(Number)
  if (parsed.length !== count || parsed.some((item) => !Number.isFinite(item))) {
    throw new Error(`Invalid "${key}" value: ${value}`)
  }
  return parsed
}

function single(values: string[] | null, key: string): string | null {
  if (!values) return null
  if (values.length !== 1) throw new Error(`Expected one "${key}" value`)
  return values[0]
}

function parseEffect(value: string): Effect {
  const [type, ...tokens] = value.split(/\s+/)
  if (!EFFECT_TYPES.has(type as Effect['type'])) throw new Error(`Unknown effect type: ${type}`)
  const fields = new Map(
    tokens
      .filter((token) => token.includes('='))
      .map((token) => token.split('=') as [string, string])
  )
  const numberField = (name: string) => {
    const parsed = Number(fields.get(name) ?? 0)
    if (!Number.isFinite(parsed)) throw new Error(`Invalid effect ${name}: ${value}`)
    return parsed
  }
  return {
    type: type as Effect['type'],
    radius: numberField('r'),
    color: parseColor(fields.get('c') ?? '#000000'),
    offset: { x: numberField('x'), y: numberField('y') },
    spread: numberField('s'),
    visible: !tokens.includes('hidden')
  }
}

function applySolidFill(node: FigmaNodeProxy, hex: string | null): void {
  const fills = [...node.fills]
  const index = fills.findIndex((fill) => fill.type === 'SOLID' && fill.visible)
  if (hex === null) {
    if (index !== -1) fills.splice(index, 1)
  } else {
    const { r, g, b, a } = parseColor(hex)
    const fill: Fill = { type: 'SOLID', color: { r, g, b, a: 1 }, opacity: a, visible: true }
    if (index !== -1) fills[index] = { ...fills[index], ...fill }
    else fills.push(fill)
  }
  node.fills = fills
}

function applyStroke(node: FigmaNodeProxy, hex: string | null): void {
  const strokes = [...node.strokes]
  const index = strokes.findIndex((stroke) => stroke.visible)
  if (hex === null) {
    if (index !== -1) strokes.splice(index, 1)
  } else {
    const { r, g, b, a } = parseColor(hex)
    const color = { r, g, b, a: 1 }
    if (index !== -1) strokes[index] = { ...strokes[index], color, opacity: a }
    else strokes.push({ color, opacity: a, weight: 1, visible: true, align: 'INSIDE' })
  }
  node.strokes = strokes
}

type PropApplier = (node: FigmaNodeProxy, values: string[] | null) => void

const APPLIERS: Record<string, PropApplier> = {
  type: (node, values) => {
    if (single(values, 'type') !== node.type) {
      throw new Error(`Cannot change node type of ${node.id}; use render or replace the node`)
    }
  },
  size: (node, values) => {
    const [width, height] = numbers(single(values, 'size') ?? '', 2, 'size')
    node.resize(width, height)
  },
  pos: (node, values) => {
    const [x, y] = numbers(single(values, 'pos') ?? '', 2, 'pos')
    node.x = x
    node.y = y
  },
  fill: (node, values) => applySolidFill(node, single(values, 'fill')),
  stroke: (node, values) => applyStroke(node, single(values, 'stroke')),
  strokeWeight: (node, values) => {
    node.strokeWeight = Number(single(values, 'strokeWeight') ?? 0)
  },
  opacity: (node, values) => {
    node.opacity = Number(single(values, 'opacity') ?? 1)
  },
  radius: (node, values) => {
    node.cornerRadius = Number(single(values, 'radius') ?? 0)
  },
  radii: (node, values) => {
    const radii = single(values, 'radii')
    if (radii === null) {
      node.cornerRadius = 0
      return
    }
    const [tl, tr, br, bl] = numbers(radii, 4, 'radii')
    node.topLeftRadius = tl
    node.topRightRadius = tr
    node.bottomRightRadius = br
    node.bottomLeftRadius = bl
  },
  blendMode: (node, values) => {
    node.blendMode = (single(values, 'blendMode') ?? 'NORMAL') as BlendMode
  },
  rotation: (node, values) => {
    node.rotation = Number(single(values, 'rotation') ?? 0)
  },
  clipsContent: (node, values) => {
    node.clipsContent = single(values, 'clipsContent') === 'true'
  },
  effect: (node, values) => {
    node.effects = (values ?? []).map((value) => toFigmaEffect(parseEffect(value)))
  },
  text: (node, values) => {
    const text = single(values, 'text')
    node.characters = text === null ? '' : String(JSON.parse(text))
  },
  fontSize: (node, values) => {
    const size = single(values, 'fontSize')
    if (size !== null) node.fontSize = Number(size)
  },
  fontFamily: (node, values) => {
    const family = single(values, 'fontFamily')
    if (family !== null) node.fontName = { family, style: node.fontName.style }
  },
  fontWeight: (node, values) => {
    const weight = single(values, 'fontWeight')
    if (weight !== null) node.fontWeight = Number(weight)
  },
  visible: (node, values) => {
    node.visible = single(values, 'visible') !== 'false'
  },
  locked: (node, values) => {
    node.locked = single(values, 'locked') === 'true'
  }
}

/** Apply property changes through the Figma API so editability and change events stay intact. */
export function applyNodeProps(
  node: FigmaNodeProxy,
  changes: Map<string, string[] | null>
): string[] {
  const entries = [...changes]
  // Unlock before editing and lock after, so a patch can both edit and toggle the lock.
  const unlocks = changes.has('locked') && changes.get('locked')?.[0] !== 'true'
  entries.sort(([a], [b]) => {
    const rank = (key: string) => (key === 'locked' ? (unlocks ? -1 : 1) : 0)
    return rank(a) - rank(b)
  })
  const applied: string[] = []
  for (const [key, values] of entries) {
    const apply = APPLIERS[key] as PropApplier | undefined
    if (!apply) throw new Error(`Unsupported property "${key}"`)
    apply(node, values)
    applied.push(key)
  }
  return applied
}
