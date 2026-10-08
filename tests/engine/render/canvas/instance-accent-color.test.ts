import { describe, expect, mock, test } from 'bun:test'

import { createEditor } from '@open-pencil/core/editor'
import { SceneGraph } from '@open-pencil/scene-graph'

import { drawHoverHighlight } from '#core/canvas/overlays/selection'
import { SkiaRenderer } from '#core/canvas/renderer'
import { COMPONENT_COLOR, INSTANCE_COLOR, SELECTION_COLOR } from '#core/constants'

const GREEN = { r: 0, g: 0.6, b: 0.3, a: 1 }
const ORANGE = { r: 1, g: 0.5, b: 0, a: 1 }

/** Enough of a renderer to resolve colours and stroke a hover outline. */
function createRenderer() {
  const renderer = Object.create(SkiaRenderer.prototype) as SkiaRenderer
  const strokeColors: number[][] = []
  Object.assign(renderer, {
    ck: { Color4f: (r: number, g: number, b: number, a: number) => [r, g, b, a] },
    canvasColors: { component: COMPONENT_COLOR, instance: INSTANCE_COLOR },
    zoom: 1,
    panX: 0,
    panY: 0,
    auxStroke: {
      setStrokeWidth: mock(),
      setPathEffect: mock(),
      setColor: (color: number[]) => strokeColors.push([...color])
    },
    strokeNodeShape: mock()
  })
  return { renderer, strokeColors }
}

const rgba = (color: { r: number; g: number; b: number }, alpha = 1) => [
  color.r,
  color.g,
  color.b,
  alpha
]

describe('instance accent colour', () => {
  test('an instance is drawn in the component colour unless the host says otherwise', () => {
    const { renderer } = createRenderer()

    expect(INSTANCE_COLOR).toEqual(COMPONENT_COLOR)
    expect([...renderer.accentColor('INSTANCE')]).toEqual(rgba(COMPONENT_COLOR))
    expect([...renderer.accentColor('COMPONENT')]).toEqual(rgba(COMPONENT_COLOR))
    expect([...renderer.accentColor('COMPONENT_SET')]).toEqual(rgba(COMPONENT_COLOR))
    expect([...renderer.accentColor('FRAME')]).toEqual(rgba(SELECTION_COLOR))
  })

  test('a configured instance colour applies to instances only', () => {
    const { renderer } = createRenderer()
    renderer.canvasColors = { component: GREEN, instance: ORANGE }

    expect([...renderer.accentColor('INSTANCE', 0.5)]).toEqual(rgba(ORANGE, 0.5))
    expect([...renderer.accentColor('COMPONENT')]).toEqual(rgba(GREEN))
    expect([...renderer.compColor()]).toEqual(rgba(GREEN))
    expect([...renderer.accentColor('RECTANGLE')]).toEqual(rgba(SELECTION_COLOR))
  })

  test('the hover outline of an instance uses the instance colour', () => {
    const { renderer, strokeColors } = createRenderer()
    renderer.canvasColors = { component: GREEN, instance: ORANGE }
    const graph = new SceneGraph()
    const page = graph.getPages()[0]
    const component = graph.createNode('COMPONENT', page.id, { name: 'Card' })
    const instance = graph.createInstance(component.id, page.id)
    const frame = graph.createNode('FRAME', page.id)
    type Canvas = Parameters<typeof drawHoverHighlight>[1]
    const canvas = { save: mock(), concat: mock(), restore: mock() } as Partial<Canvas> as Canvas

    for (const node of [instance, component, frame]) {
      drawHoverHighlight(renderer, canvas, graph, node?.id)
    }

    expect(strokeColors).toEqual([rgba(ORANGE), rgba(GREEN), rgba(SELECTION_COLOR)])
  })

  test('the editor hands its colours to every canvas, also when they change later', () => {
    type CanvasKitArgs = Parameters<ReturnType<typeof createEditor>['setCanvasKit']>
    const editor = createEditor({ canvasColors: { instance: ORANGE } })
    const renderer = {} as CanvasKitArgs[1]

    editor.setCanvasKit({} as CanvasKitArgs[0], renderer)
    expect(renderer.canvasColors).toEqual({ component: COMPONENT_COLOR, instance: ORANGE })

    const renders = mock()
    editor.onEditorEvent('render:requested', renders)
    editor.setCanvasColors({ component: GREEN })
    expect(renderer.canvasColors).toEqual({ component: GREEN, instance: ORANGE })
    expect(renders).toHaveBeenCalledTimes(1)

    const plain = createEditor()
    const untouched = {} as CanvasKitArgs[1]
    plain.setCanvasKit({} as CanvasKitArgs[0], untouched)
    expect(untouched.canvasColors).toEqual({
      component: COMPONENT_COLOR,
      instance: COMPONENT_COLOR
    })
    editor.dispose()
    plain.dispose()
  })
})
