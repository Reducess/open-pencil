<script setup lang="ts">
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { foldGutter } from '@codemirror/language'
import { unifiedMergeView } from '@codemirror/merge'
import { search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, highlightSpecialChars, keymap } from '@codemirror/view'
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'

import { resolvedAppTheme } from '@/app/shell/theme'
import { codeEditorTheme, codeViewerTheme } from '@/theme/code/editor'

export type CodeViewerLanguage = 'json' | 'design-jsx' | 'javascript'

const { code, language, label, original } = defineProps<{
  code: string
  language: CodeViewerLanguage
  label: string
  /** Shows `code` as a unified diff against this text. Read at mount. */
  original?: string
}>()

const host = useTemplateRef('host')
const themeCompartment = new Compartment()
const languageCompartment = new Compartment()
const labelCompartment = new Compartment()
let view: EditorView | undefined

function languageExtension(language: CodeViewerLanguage): Extension {
  return language === 'json' ? json() : javascript({ jsx: true, typescript: true })
}

function labelAttributes(name: string): Extension {
  return EditorView.contentAttributes.of({ 'aria-label': name })
}

function theme(): Extension {
  return [codeEditorTheme(resolvedAppTheme.value === 'dark'), codeViewerTheme]
}

onMounted(() => {
  const parent = host.value
  if (!parent) return
  view = new EditorView({
    doc: code,
    parent,
    extensions: [
      EditorState.readOnly.of(true),
      highlightSpecialChars(),
      foldGutter(),
      search({ top: true }),
      keymap.of(searchKeymap),
      EditorView.lineWrapping,
      labelCompartment.of(labelAttributes(label)),
      themeCompartment.of(theme()),
      languageCompartment.of(languageExtension(language)),
      original === undefined
        ? []
        : unifiedMergeView({ original, mergeControls: false, collapseUnchanged: {} })
    ]
  })
})

// Streamed tool input only grows; append when possible so folds and scroll survive.
watch(
  () => code,
  (next) => {
    if (!view) return
    const current = view.state.doc.toString()
    if (current === next) return
    view.dispatch(
      next.startsWith(current)
        ? { changes: { from: current.length, insert: next.slice(current.length) } }
        : { changes: { from: 0, to: current.length, insert: next } }
    )
  }
)

watch(
  () => language,
  (next) => view?.dispatch({ effects: languageCompartment.reconfigure(languageExtension(next)) })
)

watch(
  () => label,
  (next) => view?.dispatch({ effects: labelCompartment.reconfigure(labelAttributes(next)) })
)

watch(resolvedAppTheme, () => view?.dispatch({ effects: themeCompartment.reconfigure(theme()) }))

onBeforeUnmount(() => view?.destroy())
</script>

<template>
  <div
    ref="host"
    data-slot="code-viewer"
    class="max-h-64 overflow-hidden rounded border border-border"
  />
</template>
