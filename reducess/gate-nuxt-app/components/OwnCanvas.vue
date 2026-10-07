<script setup lang="ts">
import { ref } from 'vue'
import { useCanvas, useEditor } from '@open-pencil/vue'
const canvasRef = ref<HTMLCanvasElement | null>(null)
useCanvas(canvasRef, useEditor(), { preserveDrawingBuffer: true })
</script>
<template><canvas ref="canvasRef" data-testid="canvas" style="width:100%;height:100%;display:block" /></template>
