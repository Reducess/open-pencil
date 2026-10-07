import { deflateSync } from 'node:zlib'

import { recordInstanceOverride, SceneGraph } from '@open-pencil/scene-graph'
import type { Fill, SceneNode } from '@open-pencil/scene-graph'
import { computeImageHash } from '@open-pencil/scene-graph/images'

export const TITLE = 'Promoção de primavera: tudo com até 40% de desconto neste fim de semana'

export const solid = (r: number, g: number, b: number, a = 1): Fill => ({
  type: 'SOLID',
  color: { r, g, b, a },
  opacity: 1,
  visible: true
})

function chunkPNG(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, Bun.hash.crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** Deterministic RGBA PNG: a two-colour checker, so scaling mistakes are visible. */
export function checkerPNG(size = 16, seed = 0): Uint8Array {
  const raw = new Uint8Array(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1)
    for (let x = 0; x < size; x++) {
      const on = ((x >> 2) + (y >> 2) + seed) % 2 === 0
      raw.set(on ? [230, 60, 90, 255] : [30, 40, 160, 255], row + 1 + x * 4)
    }
  }
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, size)
  view.setUint32(4, size)
  header.set([8, 6, 0, 0, 0], 8)
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunkPNG('IHDR', header),
    chunkPNG('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunkPNG('IEND', new Uint8Array())
  ]
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    png.set(part, offset)
    offset += part.length
  }
  return png
}

export interface RichScene {
  graph: SceneGraph
  pageId: string
  ids: Record<
    | 'frame'
    | 'title'
    | 'band'
    | 'ball'
    | 'badge'
    | 'pen'
    | 'component'
    | 'instance'
    | 'instanceLabel'
    | 'themed'
    | 'photo',
    string
  >
  imageHash: string
  imageBytes: Uint8Array
  collectionId: string
  modes: { light: string; dark: string }
  variableId: string
}

/** A 1080x1350 post exercising every node family the persistence format has to carry. */
export function buildRichScene(): RichScene {
  const graph = new SceneGraph()
  const pageId = graph.getPages()[0].id
  const node = (type: SceneNode['type'], parent: string, props: Partial<SceneNode>) =>
    graph.createNode(type, parent, props)

  const frame = node('FRAME', pageId, {
    name: 'Post',
    width: 1080,
    height: 1350,
    layoutMode: 'VERTICAL',
    itemSpacing: 32,
    paddingTop: 64,
    paddingRight: 80,
    paddingBottom: 64,
    paddingLeft: 80,
    primaryAxisSizing: 'FIXED',
    counterAxisSizing: 'FIXED',
    clipsContent: true,
    fills: [solid(1, 1, 1)]
  })
  const title = node('TEXT', frame.id, {
    name: 'Title',
    text: TITLE,
    fontFamily: 'Inter',
    fontWeight: 700,
    fontSize: 40,
    width: 920,
    height: 100,
    textAutoResize: 'HEIGHT',
    fills: [solid(0.07, 0.09, 0.15)],
    styleRuns: [
      { start: 0, length: 8, style: { fontWeight: 400, fills: [solid(0.85, 0.2, 0.3)] } },
      { start: 37, length: 3, style: { fontSize: 48, textDecoration: 'UNDERLINE' } }
    ]
  })
  const band = node('RECTANGLE', frame.id, {
    name: 'Band',
    width: 920,
    height: 180,
    cornerRadius: 32,
    fills: [
      {
        type: 'GRADIENT_LINEAR',
        color: { r: 1, g: 0.35, b: 0.2, a: 1 },
        opacity: 1,
        visible: true,
        gradientStops: [
          { position: 0, color: { r: 1, g: 0.35, b: 0.2, a: 1 } },
          { position: 1, color: { r: 0.45, g: 0.2, b: 0.95, a: 1 } }
        ],
        gradientTransform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 }
      }
    ]
  })
  const ball = node('ELLIPSE', frame.id, {
    name: 'Ball',
    width: 160,
    height: 160,
    fills: [solid(0.1, 0.65, 0.45)],
    effects: [
      {
        type: 'DROP_SHADOW',
        visible: true,
        radius: 24,
        color: { r: 0, g: 0, b: 0, a: 0.45 },
        offset: { x: 0, y: 16 },
        spread: 0
      }
    ]
  })
  const badge = node('GROUP', frame.id, { name: 'Badge', width: 300, height: 100 })
  node('RECTANGLE', badge.id, {
    name: 'Badge background',
    width: 300,
    height: 100,
    cornerRadius: 50,
    fills: [solid(0.98, 0.8, 0.1)]
  })
  node('ELLIPSE', badge.id, {
    name: 'Badge dot',
    x: 20,
    y: 20,
    width: 60,
    height: 60,
    fills: [solid(0.07, 0.09, 0.15)]
  })
  const pen = node('VECTOR', frame.id, {
    name: 'Pen path',
    width: 200,
    height: 120,
    fills: [solid(0.2, 0.5, 0.95)],
    strokes: [
      {
        color: { r: 0.05, g: 0.1, b: 0.3, a: 1 },
        weight: 6,
        opacity: 1,
        visible: true,
        align: 'CENTER',
        join: 'ROUND'
      }
    ],
    vectorNetwork: {
      vertices: [
        { x: 0, y: 120, handleMirroring: 'NONE' },
        { x: 100, y: 0, handleMirroring: 'ANGLE_AND_LENGTH' },
        { x: 200, y: 120, handleMirroring: 'NONE' }
      ],
      segments: [
        { start: 0, end: 1, tangentStart: { x: 0, y: -60 }, tangentEnd: { x: -50, y: 0 } },
        { start: 1, end: 2, tangentStart: { x: 50, y: 0 }, tangentEnd: { x: 0, y: -60 } },
        { start: 2, end: 0, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } }
      ],
      regions: [{ windingRule: 'NONZERO', loops: [[0, 1, 2]] }]
    }
  })

  const component = node('COMPONENT', pageId, {
    name: 'Button',
    x: 1200,
    y: 0,
    width: 280,
    height: 72,
    cornerRadius: 16,
    layoutMode: 'HORIZONTAL',
    primaryAxisAlign: 'CENTER',
    counterAxisAlign: 'CENTER',
    primaryAxisSizing: 'FIXED',
    counterAxisSizing: 'FIXED',
    fills: [solid(0.1, 0.1, 0.12)]
  })
  node('TEXT', component.id, {
    name: 'Label',
    text: 'Comprar',
    fontFamily: 'Inter',
    fontWeight: 600,
    fontSize: 24,
    width: 110,
    height: 30,
    textAutoResize: 'WIDTH_AND_HEIGHT',
    fills: [solid(1, 1, 1)]
  })
  const instance = graph.createInstance(component.id, frame.id, { name: 'Button instance' })
  if (!instance) throw new Error('Expected the component instance to be created')
  const instanceLabel = graph.getChildren(instance.id)[0]
  graph.updateNode(instanceLabel.id, { text: 'Aproveitar', fills: [solid(1, 0.85, 0.2)] })
  recordInstanceOverride(graph, instanceLabel.id, ['text', 'fills'])
  graph.updateNode(instance.id, { fills: [solid(0.45, 0.2, 0.95)] })
  recordInstanceOverride(graph, instance.id, ['fills'])

  const collection = graph.createCollection('Theme')
  const light = collection.defaultModeId
  const dark = 'mode:dark'
  const variable = graph.createVariable('brand/accent', 'COLOR', collection.id, {
    r: 0.9,
    g: 0.3,
    b: 0.1,
    a: 1
  })
  graph.addMode(collection.id, dark, 'Dark')
  variable.valuesByMode[dark] = { r: 0.1, g: 0.8, b: 0.9, a: 1 }
  graph.setActiveMode(collection.id, dark)
  const themed = node('RECTANGLE', frame.id, {
    name: 'Themed',
    width: 920,
    height: 80,
    fills: [solid(0.9, 0.3, 0.1)]
  })
  graph.bindVariable(themed.id, 'fills/0/color', variable.id)

  const imageBytes = checkerPNG()
  const imageHash = computeImageHash(imageBytes)
  graph.images.set(imageHash, imageBytes)
  const photo = node('RECTANGLE', frame.id, {
    name: 'Photo',
    width: 920,
    height: 200,
    cornerRadius: 24,
    fills: [
      {
        type: 'IMAGE',
        color: { r: 0, g: 0, b: 0, a: 1 },
        opacity: 1,
        visible: true,
        imageHash,
        imageScaleMode: 'FILL'
      }
    ]
  })

  return {
    graph,
    pageId,
    ids: {
      frame: frame.id,
      title: title.id,
      band: band.id,
      ball: ball.id,
      badge: badge.id,
      pen: pen.id,
      component: component.id,
      instance: instance.id,
      instanceLabel: instanceLabel.id,
      themed: themed.id,
      photo: photo.id
    },
    imageHash,
    imageBytes,
    collectionId: collection.id,
    modes: { light, dark },
    variableId: variable.id
  }
}
