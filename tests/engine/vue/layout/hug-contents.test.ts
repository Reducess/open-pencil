import { describe, expect, test } from 'bun:test'

import type { SceneNode } from '@open-pencil/scene-graph'

import {
  axisSizingPatchForNode,
  widthSizingForNode,
  heightSizingForNode,
  sizingOptionsForNode
} from '#vue/controls/layout/helpers'

function node(overrides: Partial<SceneNode>): SceneNode {
  return {
    id: 'node',
    type: 'FRAME',
    name: 'Frame',
    parentId: 'page',
    childIds: [],
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    layoutMode: 'NONE',
    primaryAxisSizing: 'FIXED',
    counterAxisSizing: 'FIXED',
    layoutGrow: 0,
    layoutAlignSelf: 'AUTO',
    ...overrides
  } as SceneNode
}

describe('layout sizing controls', () => {
  test('plain containers with children expose hug contents', () => {
    const frame = node({ childIds: ['child'] })

    expect(sizingOptionsForNode(frame, false).map((option) => option.value)).toContain('HUG')
  })

  test('plain container width and height reflect hug sizing fields', () => {
    const frame = node({
      childIds: ['child'],
      primaryAxisSizing: 'HUG',
      counterAxisSizing: 'HUG'
    })

    expect(widthSizingForNode(frame, false)).toBe('HUG')
    expect(heightSizingForNode(frame, false)).toBe('HUG')
  })

  test('leaf frames do not expose hug contents', () => {
    const frame = node({ childIds: [] })

    expect(sizingOptionsForNode(frame, false).map((option) => option.value)).not.toContain('HUG')
  })

  test('editing derived flex dimensions can switch only that axis to fixed', () => {
    const frame = node({
      layoutMode: 'VERTICAL',
      primaryAxisSizing: 'FILL',
      counterAxisSizing: 'HUG'
    })

    expect(axisSizingPatchForNode(frame, 'width', 'FIXED', false)).toEqual({
      counterAxisSizing: 'FIXED'
    })
    expect(axisSizingPatchForNode(frame, 'height', 'FIXED', false)).toEqual({
      primaryAxisSizing: 'FIXED'
    })
  })

  test('switching an auto-layout child from fill to hug clears fill mechanics', () => {
    const frame = node({
      childIds: ['child'],
      layoutGrow: 1,
      layoutAlignSelf: 'STRETCH'
    })

    expect(axisSizingPatchForNode(frame, 'width', 'HUG', true)).toEqual({
      counterAxisSizing: 'HUG',
      layoutGrow: 0
    })
    expect(axisSizingPatchForNode(frame, 'height', 'HUG', true)).toEqual({
      primaryAxisSizing: 'HUG',
      layoutAlignSelf: 'AUTO'
    })
  })

  test('fill follows the parent direction: grow along its primary axis, stretch across it', () => {
    const child = node({})

    expect(axisSizingPatchForNode(child, 'width', 'FILL', true, 'HORIZONTAL')).toEqual({
      layoutGrow: 1
    })
    expect(axisSizingPatchForNode(child, 'height', 'FILL', true, 'HORIZONTAL')).toEqual({
      layoutAlignSelf: 'STRETCH'
    })
    expect(axisSizingPatchForNode(child, 'width', 'FILL', true, 'VERTICAL')).toEqual({
      layoutAlignSelf: 'STRETCH'
    })
    expect(axisSizingPatchForNode(child, 'height', 'FILL', true, 'VERTICAL')).toEqual({
      layoutGrow: 1
    })
  })

  test('reading fill follows the parent direction too', () => {
    const growing = node({ layoutGrow: 1 })
    const stretched = node({ layoutAlignSelf: 'STRETCH' })

    expect(widthSizingForNode(growing, true, 'VERTICAL')).toBe('FIXED')
    expect(heightSizingForNode(growing, true, 'VERTICAL')).toBe('FILL')
    expect(widthSizingForNode(stretched, true, 'VERTICAL')).toBe('FILL')
    expect(heightSizingForNode(stretched, true, 'VERTICAL')).toBe('FIXED')
    expect(widthSizingForNode(growing, true, 'HORIZONTAL')).toBe('FILL')
    expect(heightSizingForNode(stretched, true, 'HORIZONTAL')).toBe('FILL')
  })

  test('leaving fill in a vertical parent clears the field the engine reads', () => {
    const filled = node({ childIds: ['child'], layoutGrow: 1, layoutAlignSelf: 'STRETCH' })

    expect(axisSizingPatchForNode(filled, 'width', 'FIXED', true, 'VERTICAL')).toEqual({
      layoutAlignSelf: 'AUTO'
    })
    expect(axisSizingPatchForNode(filled, 'height', 'HUG', true, 'VERTICAL')).toEqual({
      primaryAxisSizing: 'HUG',
      layoutGrow: 0
    })
  })
})
