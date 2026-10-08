import { describe, expect, test } from 'bun:test'

import { computed } from 'vue'

import { createEditor } from '@open-pencil/core/editor'
import { FONT_WEIGHT_NAMES } from '@open-pencil/core/text'
import type { SceneNode } from '@open-pencil/scene-graph'

import { createTypographyActions } from '#vue/controls/typography/actions'

/** A font loader whose loads stay open until the test settles them. */
function controlledLoader() {
  const calls: Array<{ family: string; style: string; settle: () => void; fail: () => void }> = []
  return {
    calls,
    asked: () => calls.map(({ family, style }) => `${family} ${style}`),
    settleAll: () => calls.forEach((call) => call.settle()),
    load: (family: string, style: string) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ family, style, settle: resolve, fail: () => reject(new Error('no font')) })
      })
  }
}

const flush = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

function setup(overrides: Partial<SceneNode>, withLoader = true) {
  const editor = createEditor()
  const text = editor.graph.createNode('TEXT', editor.state.currentPageId, {
    text: 'Hello world',
    fontFamily: 'Lora',
    ...overrides
  })
  const node = computed(() => editor.graph.getNode(text.id) ?? null)
  const loader = controlledLoader()
  const actions = createTypographyActions({
    editor,
    node,
    currentWeightLabel: computed(() => FONT_WEIGHT_NAMES[node.value?.fontWeight ?? 400]),
    activeFormatting: computed(() => []),
    options: withLoader ? { fontLoader: loader } : {}
  })
  const current = () => editor.graph.getNode(text.id) as SceneNode
  return { editor, actions, loader, current }
}

describe('typography actions load the face the text will use', () => {
  test('changing the family of bold italic text loads the bold italic face', async () => {
    const { actions, loader, current } = setup({ fontWeight: 700, italic: true })
    const done = actions.setFamily('Playfair Display')
    expect(loader.asked()).toEqual(['Playfair Display Bold Italic'])
    expect(current().fontFamily).toBe('Lora')
    loader.settleAll()
    await done
    expect(current().fontFamily).toBe('Playfair Display')
  })

  test('the face is asked for by its engine name, without spaces in the weight', async () => {
    const { actions, loader } = setup({ fontWeight: 600 })
    const done = actions.setFamily('Playfair Display')
    expect(loader.asked()).toEqual(['Playfair Display SemiBold'])
    loader.settleAll()
    await done
  })

  test('changing the family also loads the faces of ranges that inherit it', async () => {
    const { actions, loader } = setup({
      styleRuns: [
        { start: 0, length: 5, style: { fontWeight: 700 } },
        { start: 6, length: 5, style: { fontFamily: 'Inter', italic: true } }
      ]
    })
    const done = actions.setFamily('Playfair Display')
    expect(loader.asked()).toEqual(['Playfair Display Regular', 'Playfair Display Bold'])
    loader.settleAll()
    await done
  })

  test('changing the weight loads the face, italic included, before touching the node', async () => {
    const { actions, loader, current } = setup({ italic: true })
    const done = actions.setWeight(700)
    expect(loader.asked()).toEqual(['Lora Bold Italic'])
    expect(current().fontWeight).toBe(400)
    loader.settleAll()
    await done
    expect(current().fontWeight).toBe(700)
  })

  test('changing the weight loads the faces of ranges that inherit it, whatever their family', async () => {
    const { actions, loader } = setup({
      styleRuns: [{ start: 0, length: 5, style: { fontFamily: 'Inter' } }]
    })
    const done = actions.setWeight(700)
    expect(loader.asked()).toEqual(['Lora Bold', 'Inter Bold'])
    loader.settleAll()
    await done
  })

  test('toggling italic loads the italic face before touching the node', async () => {
    const { actions, loader, current } = setup({ fontWeight: 700 })
    actions.toggleItalic()
    expect(loader.asked()).toEqual(['Lora Bold Italic'])
    expect(current().italic).toBe(false)
    loader.settleAll()
    await flush()
    expect(current().italic).toBe(true)
  })

  test('toggling bold loads the face of the new weight first', async () => {
    const { actions, loader, current } = setup({ italic: true })
    actions.toggleBold()
    expect(loader.asked()).toEqual(['Lora Bold Italic'])
    expect(current().fontWeight).toBe(400)
    loader.settleAll()
    await flush()
    expect(current().fontWeight).toBe(700)
  })

  test('a weight whose face cannot be loaded is still applied, and the failure surfaces', async () => {
    const { actions, loader, current } = setup({})
    const done = actions.setWeight(700)
    loader.calls[0].fail()
    await expect(done).rejects.toThrow('no font')
    expect(current().fontWeight).toBe(700)
  })

  test('italic is applied when the family has no italic face to load', async () => {
    const { actions, loader, current } = setup({})
    actions.toggleItalic()
    loader.calls[0].fail()
    await flush()
    expect(current().italic).toBe(true)
  })

  test('the last weight picked wins when an earlier face arrives later', async () => {
    const { actions, loader, current } = setup({})
    const first = actions.setWeight(700)
    const second = actions.setWeight(500)
    loader.calls[1].settle()
    await second
    expect(current().fontWeight).toBe(500)
    loader.calls[0].settle()
    await first
    expect(current().fontWeight).toBe(500)
  })

  test('bold and italic toggled together are both applied', async () => {
    const { actions, loader, current } = setup({})
    actions.onFormattingChange(['bold', 'italic'])
    loader.settleAll()
    await flush()
    expect(current()).toMatchObject({ fontWeight: 700, italic: true })
  })

  test('each change is one undo step', async () => {
    const { editor, actions, loader, current } = setup({ italic: true })
    const done = actions.setWeight(700)
    loader.settleAll()
    await done
    editor.undo.undo()
    expect(current().fontWeight).toBe(400)
  })

  test('without a font loader the change is applied at once', () => {
    const { actions, current } = setup({}, false)
    void actions.setWeight(700)
    expect(current().fontWeight).toBe(700)
    actions.toggleItalic()
    expect(current().italic).toBe(true)
  })
})
