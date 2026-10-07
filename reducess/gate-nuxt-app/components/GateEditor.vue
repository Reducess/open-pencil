<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { createDefaultEditorState, createEditor, executeAtomicTool } from '@open-pencil/core/editor'
import { SceneGraph } from '@open-pencil/scene-graph'
import { fontManager } from '@open-pencil/core/text'
import { BUILTIN_IO_FORMATS, IORegistry, renderNodesToImage } from '@open-pencil/core/io'
import { FigmaAPI } from '@open-pencil/core/figma-api'
import { ALL_TOOLS, isAtomicTool, toolsToAI } from '@open-pencil/core/tools'
import {
  provideEditor, CanvasRoot, CanvasSurface, ToolbarRoot, LayerTreeRoot, LayerTreeItem,
} from '@open-pencil/vue'
import { buildScene, serializePage } from '~/lib/scene'

const graph = new SceneGraph()
const page = graph.getPages()[0]!
const host = ref<HTMLElement | null>(null)
const editor = createEditor({
  graph,
  state: reactive(createDefaultEditorState(page.id)),
  getViewportSize: () => ({ width: host.value?.clientWidth ?? 900, height: host.value?.clientHeight ?? 700 }),
})
provideEditor(editor)
const ids = buildScene(graph, page.id)
const io = new IORegistry(BUILTIN_IO_FORMATS)

function makeFigma() {
  const api = new FigmaAPI(editor.graph)
  api.setRenderer(editor.renderer ?? null)
  api.currentPage = api.wrapNode(editor.state.currentPageId)
  api.exportImage = (nodeIds: string[], opts: { scale?: number; format?: 'PNG' | 'JPG' | 'WEBP' }) => {
    const r = editor.renderer
    if (!r) return Promise.resolve(null)
    return Promise.resolve(renderNodesToImage(r.ck, r, editor.graph, editor.state.currentPageId, nodeIds, { scale: opts.scale ?? 1, format: opts.format ?? 'PNG' }))
  }
  return api
}

async function ensureFonts() {
  const keys = fontManager.collectFontKeys(editor.graph, editor.graph.getNode(editor.state.currentPageId)!.childIds)
  const res = await Promise.all(keys.map(async ([f, s]) => [f, s, !!(await fontManager.loadFont(f, s))]))
  editor.renderer?.invalidateAllPictures()
  editor.runLayoutForNode(editor.state.currentPageId)
  editor.requestRender()
  return res
}

let before: ReturnType<typeof editor.snapshotPage> | null = null
const tools = toolsToAI(ALL_TOOLS, {
  getFigma: makeFigma,
  executeTool: async (def, figma, args) => {
    if (isAtomicTool(def)) {
      const r = executeAtomicTool(editor, figma, def, args, { label: 'AI' })
      await ensureFonts()
      return r
    }
    if (def.mutates) before = editor.snapshotPage()
    return def.mutates
      ? editor.runMutationWithLayout(() => def.execute(figma, args), figma.currentPageId, async () => { await ensureFonts() })
      : def.execute(figma, args)
  },
  onAfterExecute: (def) => {
    if (isAtomicTool(def) || !def.mutates) return
    editor.requestRender()
    if (before) {
      const b = before, a = editor.snapshotPage()
      editor.pushUndoEntry({ label: `AI: ${def.name}`, forward: () => editor.restorePageFromSnapshot(a), inverse: () => editor.restorePageFromSnapshot(b) })
      before = null
    }
  },
}, {
  // sem o pacote `ai`: fábrica trivial que valida a entrada pelo standard-schema
  tool: ((o: any) => ({ ...o, run: async (args: unknown) => {
    const v = await o.inputSchema['~standard'].validate(args)
    if (v.issues) return { error: 'input: ' + JSON.stringify(v.issues) }
    return o.execute(v.value)
  } })) as never,
}) as Record<string, any>

async function exportAs(format: string, nodeId: string, options?: unknown) {
  const r = editor.renderer
  const res = await io.getFormat(format)!.exportContent!(
    { graph: editor.graph, target: { scope: 'node', nodeId } }, options,
    r ? { canvasKit: r.ck, renderer: r } : undefined,
  )
  return res
}

const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) }

const status = ref('boot')
const own = useRoute().query.own === '1'
onMounted(() => {
  const w = window as any
  w.__gate = {
    editor, ids, tools, ensureFonts, fontManager,
    toolNames: Object.keys(tools),
    serialize: () => serializePage(editor.graph, editor.state.currentPageId),
    exportB64: async (format: string, nodeId: string, options?: unknown) => {
      const res = await exportAs(format, nodeId, options)
      return typeof res.data === 'string' ? { text: res.data } : { b64: b64(res.data as Uint8Array), n: (res.data as Uint8Array).length }
    },
    // prova de viabilidade do patch de quebra de linha: linhas vêm do Paragraph do CanvasKit
    textLines: (id: string) => {
      const n: any = editor.graph.getNode(id), ck: any = editor.renderer!.ck
      const ps = new ck.ParagraphStyle({ textStyle: { fontFamilies: [n.fontFamily], fontSize: n.fontSize, fontStyle: { weight: { value: n.fontWeight } } } })
      const pb = ck.ParagraphBuilder.MakeFromFontProvider(ps, fontManager.provider())
      pb.addText(n.text); const p = pb.build(); p.layout(n.width)
      const lines = p.getLineMetrics().map((m: any) => ({ text: n.text.slice(m.startIndex, m.endIndex).trimEnd(), baseline: m.baseline }))
      p.delete(); pb.delete()
      return lines
    },
    ready: async () => {
      for (let i = 0; i < 200 && !editor.renderer; i++) await new Promise((r) => setTimeout(r, 50))
      if (!editor.renderer) throw new Error('renderer nunca ficou pronto')
      const fonts = await ensureFonts()
      editor.zoomToFit?.()
      editor.requestRender()
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      status.value = 'ready'
      return fonts
    },
  }
})
</script>

<template>
  <div style="display:grid;grid-template-columns:220px 1fr;grid-template-rows:40px 1fr;height:100vh">
    <ToolbarRoot v-slot="{ tools: tls, activeTool, actions }">
      <header style="grid-column:span 2" data-testid="toolbar">
        <button v-for="t in tls" :key="t.key" :data-active="activeTool === t.key" @click="actions.setTool(t.key)">{{ t.key }}</button>
        <span data-testid="status">{{ status }}</span>
      </header>
    </ToolbarRoot>
    <aside data-testid="layers" style="overflow:auto">
      <LayerTreeRoot v-slot="{ visibleRows }">
        <LayerTreeItem v-for="row in visibleRows" :key="row.node.id" v-slot="{ node, padLeft, isSelected, actions, hasChildren }"
          :node="row.node" :level="row.level" :has-children="row.hasChildren">
          <div :style="{ paddingLeft: padLeft, fontWeight: isSelected ? 700 : 400 }" data-testid="layer-row" @click="actions.select(false)">
            <button v-if="hasChildren" @click.stop="actions.toggleExpand()">+</button>{{ node.name }}
          </div>
        </LayerTreeItem>
      </LayerTreeRoot>
    </aside>
    <main ref="host" style="position:relative;min-width:0;min-height:0">
      <OwnCanvas v-if="own" />
      <CanvasRoot v-else :preserve-drawing-buffer="true">
        <CanvasSurface data-testid="canvas" style="width:100%;height:100%;display:block" />
      </CanvasRoot>
    </main>
  </div>
</template>
