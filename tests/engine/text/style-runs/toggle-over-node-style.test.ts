import { describe, expect, test } from 'bun:test'

import {
  getStyleAt,
  toggleBoldInRange,
  toggleDecorationInRange,
  toggleItalicInRange,
  type StyleRun
} from '@open-pencil/core'

/** What a character shows: its run override, or the node value when the run says nothing. */
function effective<T>(override: T | undefined, nodeValue: T): T {
  return override ?? nodeValue
}

describe('toggling a range off when the whole node carries the style', () => {
  test('italic node: the range gets an explicit upright run, the rest stays italic', () => {
    const { runs, newItalic } = toggleItalicInRange([], 2, 6, true, 10)
    expect(newItalic).toBe(false)
    expect(runs).toEqual([{ start: 2, length: 4, style: { italic: false } }])
    for (let i = 0; i < 10; i++) {
      expect(effective(getStyleAt(runs, i).italic, true)).toBe(i < 2 || i >= 6)
    }
  })

  test('italic node: toggling the range again drops the override instead of stacking one', () => {
    const { runs: upright } = toggleItalicInRange([], 2, 6, true, 10)
    const { runs, newItalic } = toggleItalicInRange(upright, 2, 6, true, 10)
    expect(newItalic).toBe(true)
    expect(runs).toEqual([])
  })

  test('italic node: other overrides of the range survive', () => {
    const existing: StyleRun[] = [{ start: 0, length: 4, style: { fontWeight: 700 } }]
    const { runs } = toggleItalicInRange(existing, 0, 4, true, 4)
    expect(runs).toEqual([{ start: 0, length: 4, style: { fontWeight: 700, italic: false } }])
  })

  test('bold node: the range gets a regular-weight run', () => {
    const { runs, newWeight } = toggleBoldInRange([], 2, 6, 700, 10)
    expect(newWeight).toBe(400)
    expect(runs).toEqual([{ start: 2, length: 4, style: { fontWeight: 400 } }])
  })

  test('bold node: toggling the range again drops the override', () => {
    const { runs: regular } = toggleBoldInRange([], 2, 6, 700, 10)
    const { runs, newWeight } = toggleBoldInRange(regular, 2, 6, 700, 10)
    expect(newWeight).toBe(700)
    expect(runs).toEqual([])
  })

  test('heavier node: a range toggled off and on ends at weight 700, as before', () => {
    const { runs: regular } = toggleBoldInRange([], 0, 3, 800, 5)
    expect(regular).toEqual([{ start: 0, length: 3, style: { fontWeight: 400 } }])
    const { runs } = toggleBoldInRange(regular, 0, 3, 800, 5)
    expect(runs).toEqual([{ start: 0, length: 3, style: { fontWeight: 700 } }])
  })

  test('underlined node: the range gets an explicit NONE run', () => {
    const { runs, newDeco } = toggleDecorationInRange([], 2, 6, 'UNDERLINE', 'UNDERLINE', 10)
    expect(newDeco).toBe('NONE')
    expect(runs).toEqual([{ start: 2, length: 4, style: { textDecoration: 'NONE' } }])
  })

  test('underlined node: toggling the range again drops the override', () => {
    const { runs: plain } = toggleDecorationInRange([], 2, 6, 'UNDERLINE', 'UNDERLINE', 10)
    const { runs, newDeco } = toggleDecorationInRange(plain, 2, 6, 'UNDERLINE', 'UNDERLINE', 10)
    expect(newDeco).toBe('UNDERLINE')
    expect(runs).toEqual([])
  })

  test('underlined node: strikethrough on a range is still a plain override', () => {
    const { runs, newDeco } = toggleDecorationInRange([], 0, 3, 'STRIKETHROUGH', 'UNDERLINE', 5)
    expect(newDeco).toBe('STRIKETHROUGH')
    expect(runs).toEqual([{ start: 0, length: 3, style: { textDecoration: 'STRIKETHROUGH' } }])
  })

  test('a node without the style keeps the old behaviour: the override is removed', () => {
    const italic: StyleRun[] = [{ start: 0, length: 5, style: { italic: true } }]
    expect(toggleItalicInRange(italic, 0, 5, false, 5).runs).toEqual([])
    const bold: StyleRun[] = [{ start: 0, length: 5, style: { fontWeight: 700 } }]
    expect(toggleBoldInRange(bold, 0, 5, 400, 5).runs).toEqual([])
    const underlined: StyleRun[] = [{ start: 0, length: 5, style: { textDecoration: 'UNDERLINE' } }]
    expect(toggleDecorationInRange(underlined, 0, 5, 'UNDERLINE', 'NONE', 5).runs).toEqual([])
  })
})
