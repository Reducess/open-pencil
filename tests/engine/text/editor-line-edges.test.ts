import { beforeAll, describe, expect, test } from 'bun:test'

import { initCanvasKit, SkiaRenderer, TextEditor } from '@open-pencil/core'
import { createDefaultNode } from '@open-pencil/scene-graph/node-defaults'

import { expectDefined } from '#tests/helpers/assert'

let ck: Awaited<ReturnType<typeof initCanvasKit>>
let renderer: SkiaRenderer

beforeAll(async () => {
  ck = await initCanvasKit()
  renderer = new SkiaRenderer(ck, expectDefined(ck.MakeSurface(1, 1), 'surface'))
  await renderer.loadFonts()
})

/** Editing starts with the caret after the last character, as a double click does. */
function edit(text: string, width = 400) {
  const editor = new TextEditor(ck)
  editor.setRenderer(renderer)
  editor.start(
    createDefaultNode(() => 'text', 'TEXT', { text, width, height: 100, textAutoResize: 'HEIGHT' })
  )
  return editor
}

describe('TextEditor line edges with a real paragraph', () => {
  test('CanvasKit reports no line for the position after the last character', () => {
    const paragraph = expectDefined(edit('Hello').state?.paragraph, 'paragraph')

    expect(paragraph.getLineNumberAt(4)).toBe(0)
    expect(paragraph.getLineNumberAt(5)).toBe(-1)
  })

  test('Home with the caret at the end of the text goes to the start of the line', () => {
    const editor = edit('Hello World')
    expect(editor.caretIndex).toBe(11)

    editor.moveToLineStart()

    expect(editor.caretIndex).toBe(0)
  })

  test('at the end of wrapped text Home goes to the start of the last line', () => {
    const editor = edit('aaa bbb ccc ddd eee fff', 60)
    const lines = expectDefined(editor.state?.paragraph, 'paragraph').getLineMetrics()
    expect(lines.length).toBeGreaterThan(1)

    editor.moveToLineStart()

    expect(editor.caretIndex).toBe(expectDefined(lines.at(-1), 'last line').startIndex)
    editor.moveToLineEnd()
    expect(editor.caretIndex).toBe(23)
  })

  test('Shift+Home at the end selects the last line', () => {
    const editor = edit('Hello\nWorld')

    editor.moveToLineStart(true)

    expect(editor.getSelectionRange()).toEqual([6, 11])
  })

  test('on the empty line after a trailing line break Home and End stay put', () => {
    const editor = edit('Hello\n')

    editor.moveToLineStart()
    expect(editor.caretIndex).toBe(6)
    editor.moveToLineEnd()
    expect(editor.caretIndex).toBe(6)
  })
})
