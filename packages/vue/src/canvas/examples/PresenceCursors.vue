<script setup lang="ts">
import { useTemplateRef, watchEffect } from 'vue'

import { createEditor } from '@open-pencil/core/editor'
import { parseColor } from '@open-pencil/scene-graph/color'

import { useCanvas } from '#vue/canvas/surface/use'

const { person, personColor, agent, otherAgent, otherColor, zoom } = defineProps<{
  person: string
  personColor: string
  agent: string
  otherAgent: string
  otherColor: string
  zoom: number
}>()

/** The scene's middle in canvas pixels, which zooming keeps in place. */
const CENTER = { x: 300, y: 200 }

const editor = createEditor()
const card = editor.graph.createNode('RECTANGLE', editor.state.currentPageId, {
  name: 'Card',
  x: 220,
  y: 200,
  width: 160,
  height: 100,
  fills: [{ type: 'SOLID', color: parseColor('#e8e8eb'), opacity: 1, visible: true }]
})
useCanvas(useTemplateRef('canvas'), editor, { showRulers: false })

watchEffect(() => {
  const owner = parseColor(personColor)
  const other = parseColor(otherColor)
  editor.state.panX = CENTER.x * (1 - zoom)
  editor.state.panY = CENTER.y * (1 - zoom)
  editor.state.zoom = zoom
  editor.state.presenceCursors = [
    { kind: 'person', name: person, color: owner, x: 120, y: 100 },
    { kind: 'agent', name: agent, color: owner, x: 220, y: 200, selection: [card.id] },
    { kind: 'agent', name: otherAgent, color: other, x: 430, y: 150 }
  ]
  editor.requestRender()
})
</script>

<template>
  <canvas ref="canvas" class="block h-[400px] w-[600px]" />
</template>
