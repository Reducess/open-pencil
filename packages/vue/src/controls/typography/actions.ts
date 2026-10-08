import { computed } from 'vue'
import type { ComputedRef } from 'vue'

import type { Editor } from '@open-pencil/core/editor'
import { collectNodeFontFaces, FONT_WEIGHT_NAMES } from '@open-pencil/core/text'
import type { SceneNode, TextDecoration } from '@open-pencil/scene-graph'

import type { UseTypographyOptions } from '#vue/controls/typography/use'
import { useSceneComputed } from '#vue/internal/scene-computed/use'
import { useNodeFontStatus } from '#vue/shared/font-status/use'

type TextAlign = SceneNode['textAlignHorizontal']
type TextDirection = SceneNode['textDirection']
type TextVerticalAlign = SceneNode['textAlignVertical']
type TextCase = SceneNode['textCase']
type TextTruncation = SceneNode['textTruncation']

export const TYPOGRAPHY_WEIGHTS = Object.entries(FONT_WEIGHT_NAMES).map(([value, label]) => ({
  value: Number(value),
  label
}))

export function createTypographyState(editor: Editor) {
  const node = useSceneComputed<SceneNode | null>(() => editor.getSelectedNode() ?? null)
  const { missingFonts, hasMissingFonts } = useNodeFontStatus(() => node.value)
  const fontFamily = computed(() => node.value?.fontFamily ?? '')
  const fontWeight = computed(() => node.value?.fontWeight ?? 400)
  const fontSize = computed(() => node.value?.fontSize ?? 16)
  const currentWeightLabel = computed(
    () => FONT_WEIGHT_NAMES[node.value?.fontWeight ?? 400] ?? 'Regular'
  )
  const activeFormatting = computed(() => {
    const n = node.value
    if (!n) return []
    const result: string[] = []
    if (n.fontWeight >= 700) result.push('bold')
    if (n.italic) result.push('italic')
    if (n.textDecoration === 'UNDERLINE') result.push('underline')
    if (n.textDecoration === 'STRIKETHROUGH') result.push('strikethrough')
    return result
  })

  return {
    node,
    fontFamily,
    fontWeight,
    fontSize,
    currentWeightLabel,
    activeFormatting,
    missingFonts,
    hasMissingFonts
  }
}

type TypographyActionOptions = {
  editor: Editor
  node: ComputedRef<SceneNode | null>
  currentWeightLabel: ComputedRef<string>
  activeFormatting: ComputedRef<string[]>
  options: UseTypographyOptions
}

export function createTypographyActions({
  editor,
  node,
  activeFormatting,
  options
}: TypographyActionOptions) {
  let propBeforePreview:
    | { key: keyof SceneNode; value: SceneNode[keyof SceneNode]; textStyleId: string | null }
    | undefined

  const latestFontRequest = new Map<string, number>()

  /**
   * Applies a change that makes the text ask for other font faces — family, weight, italic — once
   * those faces are loaded, so no frame is painted with a stand-in. The faces are the ones the
   * changed node asks for: weight and slant together, plus the ranges that inherit the change.
   * Without a font loader the change is applied at once, as it always was.
   */
  async function applyWithFonts(
    change: Pick<Partial<SceneNode>, 'fontFamily' | 'fontWeight' | 'italic'>,
    label: string,
    { applyOnLoadFailure }: { applyOnLoadFailure: boolean }
  ) {
    const current = node.value
    if (!current) return
    const { id } = current
    const apply = () => {
      if (editor.graph.getNode(id)) editor.updateNodeWithUndo(id, change, label)
    }
    const loader = options.fontLoader
    if (!loader) {
      apply()
      return
    }
    // A new family leaves the ranges that name their own family as they are.
    const faces = collectNodeFontFaces({ ...current, ...change }).filter(
      (face) => change.fontFamily === undefined || face.family === change.fontFamily
    )
    // A face that arrives late must not write over a newer pick of the same property.
    const key = Object.keys(change).join(',')
    const request = (latestFontRequest.get(key) ?? 0) + 1
    latestFontRequest.set(key, request)
    let loaded = false
    try {
      await Promise.all(faces.map((face) => loader.load(face.family, face.style)))
      loaded = true
    } finally {
      if ((loaded || applyOnLoadFailure) && latestFontRequest.get(key) === request) apply()
    }
  }

  async function setFamily(family: string) {
    await applyWithFonts({ fontFamily: family }, 'Change font', { applyOnLoadFailure: false })
  }

  async function setWeight(weight: number) {
    await applyWithFonts({ fontWeight: weight }, 'Change font weight', {
      applyOnLoadFailure: true
    })
  }

  function setAlign(align: TextAlign) {
    if (!node.value) return
    editor.updateNodeWithUndo(
      node.value.id,
      { textAlignHorizontal: align },
      'Change text alignment'
    )
  }

  function setDirection(direction: TextDirection) {
    if (!node.value) return
    editor.updateNodeWithUndo(node.value.id, { textDirection: direction }, 'Change text direction')
  }

  function setVerticalAlign(align: TextVerticalAlign) {
    if (!node.value) return
    editor.updateNodeWithUndo(
      node.value.id,
      { textAlignVertical: align },
      'Change vertical text alignment'
    )
  }

  function setTextCase(textCase: TextCase) {
    if (!node.value) return
    editor.updateNodeWithUndo(node.value.id, { textCase }, 'Change text case')
  }

  function setTruncation(textTruncation: TextTruncation) {
    if (!node.value) return
    editor.updateNodeWithUndo(node.value.id, { textTruncation }, 'Change text truncation')
  }

  function setFontFeature(tag: string, enabled: boolean) {
    if (!node.value) return
    const fontFeatures = node.value.fontFeatures.filter((feature) => feature.tag !== tag)
    fontFeatures.push({ tag, enabled })
    editor.updateNodeWithUndo(node.value.id, { fontFeatures }, `Change ${tag} feature`)
  }

  function toggleBold() {
    if (!node.value) return
    void setWeight(node.value.fontWeight >= 700 ? 400 : 700)
  }

  function toggleItalic() {
    if (!node.value) return
    // Many families have no italic face: the toggle still applies and the engine reports the
    // stand-in, so a loader that rejects must not become an unhandled rejection here.
    void applyWithFonts({ italic: !node.value.italic }, 'Toggle italic', {
      applyOnLoadFailure: true
    }).catch(() => undefined)
  }

  function toggleDecoration(deco: 'UNDERLINE' | 'STRIKETHROUGH') {
    if (!node.value) return
    const current = node.value.textDecoration
    editor.updateNodeWithUndo(
      node.value.id,
      { textDecoration: (current === deco ? 'NONE' : deco) as TextDecoration },
      `Toggle ${deco.toLowerCase()}`
    )
  }

  function onFormattingChange(values: string[]) {
    if (!node.value) return
    const prev = activeFormatting.value
    const added = values.filter((v) => !prev.includes(v))
    const removed = prev.filter((v) => !values.includes(v))
    for (const item of [...added, ...removed]) {
      if (item === 'bold') toggleBold()
      else if (item === 'italic') toggleItalic()
      else if (item === 'underline') toggleDecoration('UNDERLINE')
      else if (item === 'strikethrough') toggleDecoration('STRIKETHROUGH')
    }
  }

  function updateProp(key: keyof SceneNode, value: number | string | null) {
    if (!node.value) return
    if (!propBeforePreview || propBeforePreview.key !== key) {
      propBeforePreview = {
        key,
        value: node.value[key],
        textStyleId: node.value.textStyleId
      }
    }
    editor.updateNode(node.value.id, { [key]: value } as Partial<SceneNode>)
  }

  function commitProp(
    key: keyof SceneNode,
    _value: number | string | null,
    previous: number | string | null
  ) {
    if (!node.value) return
    const snapshot = propBeforePreview?.key === key ? propBeforePreview : undefined
    editor.commitNodeUpdate(
      node.value.id,
      {
        [key]: snapshot ? snapshot.value : previous,
        ...(snapshot ? { textStyleId: snapshot.textStyleId } : {})
      } as Partial<SceneNode>,
      `Change ${String(key)}`
    )
    propBeforePreview = undefined
  }

  return {
    setFamily,
    setWeight,
    setAlign,
    setDirection,
    setVerticalAlign,
    setTextCase,
    setTruncation,
    setFontFeature,
    toggleBold,
    toggleItalic,
    toggleDecoration,
    onFormattingChange,
    updateProp,
    commitProp
  }
}
