import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'

export const TITLE =
  'Promoção de primavera: tudo com até 40% de desconto neste fim de semana'

const solid = (r: number, g: number, b: number, a = 1) => ({
  type: 'SOLID' as const, color: { r, g, b, a }, opacity: 1, visible: true,
})

/** Cria a cena do gate. Devolve os ids. */
export function buildScene(graph: SceneGraph, pageId: string) {
  const frame = graph.createNode('FRAME', pageId, {
    name: 'Post', x: 0, y: 0, width: 1080, height: 1350,
    layoutMode: 'VERTICAL', itemSpacing: 48,
    paddingTop: 80, paddingRight: 80, paddingBottom: 80, paddingLeft: 80,
    primaryAxisSizing: 'FIXED', counterAxisSizing: 'FIXED',
    fills: [solid(1, 1, 1)],
  } as Partial<SceneNode>)
  const title = graph.createNode('TEXT', frame.id, {
    name: 'Titulo', text: TITLE, fontFamily: 'Inter', fontWeight: 700, fontSize: 40,
    width: 920, height: 160, textAutoResize: 'HEIGHT',
    fills: [solid(0.07, 0.09, 0.15)],
  } as Partial<SceneNode>)
  const rect = graph.createNode('RECTANGLE', frame.id, {
    name: 'Faixa', width: 920, height: 280, cornerRadius: 32,
    fills: [{
      type: 'GRADIENT_LINEAR', color: { r: 1, g: 0.35, b: 0.2, a: 1 }, opacity: 1, visible: true,
      gradientStops: [
        { position: 0, color: { r: 1, g: 0.35, b: 0.2, a: 1 } },
        { position: 1, color: { r: 0.45, g: 0.2, b: 0.95, a: 1 } },
      ],
      gradientTransform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
    }],
  } as unknown as Partial<SceneNode>)
  const ellipse = graph.createNode('ELLIPSE', frame.id, {
    name: 'Bola', width: 260, height: 260,
    fills: [solid(0.1, 0.65, 0.45)],
    effects: [{
      type: 'DROP_SHADOW', visible: true, radius: 24,
      color: { r: 0, g: 0, b: 0, a: 0.45 }, offset: { x: 0, y: 16 }, spread: 0,
    }],
  } as unknown as Partial<SceneNode>)
  const selo = graph.createNode('GROUP', frame.id, { name: 'Selo', width: 300, height: 140 } as Partial<SceneNode>)
  const seloA = graph.createNode('RECTANGLE', selo.id, {
    name: 'Selo fundo', x: 0, y: 0, width: 300, height: 140, cornerRadius: 70, fills: [solid(0.98, 0.8, 0.1)],
  } as Partial<SceneNode>)
  const seloB = graph.createNode('ELLIPSE', selo.id, {
    name: 'Selo ponto', x: 30, y: 30, width: 80, height: 80, fills: [solid(0.07, 0.09, 0.15)],
  } as Partial<SceneNode>)
  return { frame: frame.id, title: title.id, rect: rect.id, ellipse: ellipse.id, selo: selo.id, seloA: seloA.id, seloB: seloB.id }
}

/** Serialização mínima: o SDK não expõe JSON de documento (só .fig/.pen de leitura). */
export function serializePage(graph: SceneGraph, pageId: string): string {
  const out: unknown[] = []
  const walk = (id: string) => {
    const n = graph.getNode(id)
    if (!n) return
    const { textPicture: _tp, ...rest } = n as SceneNode & { textPicture?: unknown }
    out.push(rest)
    for (const c of n.childIds) walk(c)
  }
  for (const c of graph.getNode(pageId)?.childIds ?? []) walk(c)
  return JSON.stringify(out, (_k, v) => (ArrayBuffer.isView(v) ? { __u8: Array.from(v as Uint8Array) } : v))
}

export function restorePage(graph: SceneGraph, pageId: string, json: string): string[] {
  const nodes = JSON.parse(json, (_k, v) => (v && typeof v === 'object' && '__u8' in v ? new Uint8Array(v.__u8) : v)) as SceneNode[]
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const roots: string[] = []
  for (const n of nodes) {
    const parentId = n.parentId && byId.has(n.parentId) ? n.parentId : pageId
    if (parentId === pageId) roots.push(n.id)
    const { childIds: _c, parentId: _p, ...rest } = n
    graph.createNodeWithId(n.id, n.type, parentId, { ...rest, childIds: [] } as Partial<SceneNode>)
  }
  return roots
}
