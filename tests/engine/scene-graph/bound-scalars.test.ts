import { describe, expect, test } from 'bun:test'

import { SceneGraph } from '@open-pencil/scene-graph'

function setup() {
  const graph = new SceneGraph()
  graph.addCollection({
    id: 'sizes',
    name: 'Sizes',
    modes: [
      { modeId: 'compact', name: 'Compact' },
      { modeId: 'roomy', name: 'Roomy' }
    ],
    defaultModeId: 'compact',
    variableIds: []
  })
  graph.addVariable({
    id: 'space',
    name: 'Space',
    type: 'FLOAT',
    collectionId: 'sizes',
    valuesByMode: { compact: 8, roomy: 24 },
    description: '',
    hiddenFromPublishing: false
  })
  return { graph, pageId: graph.getPages()[0].id }
}

describe('boundScalarChanges', () => {
  test('reports the fields that differ from the variable in the active mode', () => {
    const { graph, pageId } = setup()
    const frame = graph.createNode('FRAME', pageId, {
      itemSpacing: 0,
      paddingLeft: 8,
      boundVariables: { itemSpacing: 'space', paddingLeft: 'space' }
    })

    expect(graph.boundScalarChanges(frame.id)).toEqual({ itemSpacing: 8 })
    graph.setActiveMode('sizes', 'roomy')
    expect(graph.boundScalarChanges(frame.id)).toEqual({ itemSpacing: 24, paddingLeft: 24 })
  })

  test('resolves through the mode pinned on an ancestor', () => {
    const { graph, pageId } = setup()
    const scope = graph.createNode('FRAME', pageId, { variableModes: { sizes: 'roomy' } })
    const inner = graph.createNode('RECTANGLE', scope.id, {
      boundVariables: { strokeWeight: 'space' }
    })
    const outer = graph.createNode('RECTANGLE', pageId, {
      boundVariables: { strokeWeight: 'space' }
    })

    expect(graph.boundScalarChanges(inner.id)).toEqual({ strokeWeight: 24 })
    expect(graph.boundScalarChanges(outer.id)).toEqual({ strokeWeight: 8 })
  })

  test('a uniform radius carries the four corners unless they are independent or bound', () => {
    const { graph, pageId } = setup()
    const uniform = graph.createNode('RECTANGLE', pageId, {
      boundVariables: { cornerRadius: 'space' }
    })
    const independent = graph.createNode('RECTANGLE', pageId, {
      independentCorners: true,
      boundVariables: { cornerRadius: 'space' }
    })

    expect(graph.boundScalarChanges(uniform.id)).toEqual({
      cornerRadius: 8,
      topLeftRadius: 8,
      topRightRadius: 8,
      bottomRightRadius: 8,
      bottomLeftRadius: 8
    })
    expect(graph.boundScalarChanges(independent.id)).toEqual({ cornerRadius: 8 })
  })

  test('leaves alone a size or position that the layout computes', () => {
    const { graph, pageId } = setup()
    const column = graph.createNode('FRAME', pageId, {
      layoutMode: 'VERTICAL',
      primaryAxisSizing: 'HUG',
      counterAxisSizing: 'FIXED',
      width: 200,
      boundVariables: { width: 'space', height: 'space' }
    })
    const stretched = graph.createNode('RECTANGLE', column.id, {
      layoutAlignSelf: 'STRETCH',
      boundVariables: { width: 'space', height: 'space', x: 'space' }
    })
    const absolute = graph.createNode('RECTANGLE', column.id, {
      layoutPositioning: 'ABSOLUTE',
      boundVariables: { width: 'space', x: 'space' }
    })
    const label = graph.createNode('TEXT', pageId, {
      textAutoResize: 'HEIGHT',
      boundVariables: { width: 'space', height: 'space' }
    })

    expect(graph.boundScalarChanges(column.id)).toEqual({ width: 8 })
    expect(graph.boundScalarChanges(stretched.id)).toEqual({ height: 8 })
    expect(graph.boundScalarChanges(absolute.id)).toEqual({ width: 8, x: 8 })
    expect(graph.boundScalarChanges(label.id)).toEqual({ width: 8 })
  })

  test('ignores bindings that do not resolve to a number', () => {
    const { graph, pageId } = setup()
    const node = graph.createNode('RECTANGLE', pageId, {
      boundVariables: { opacity: 'missing', 'fills/0/color': 'space' }
    })

    expect(graph.boundScalarChanges(node.id)).toEqual({})
  })
})
