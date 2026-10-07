<script setup lang="ts">
import { templateRef } from '@vueuse/core'
import { watchEffect } from 'vue'

import { useCanvasContext } from '#vue/canvas/context'

const { canvasRef } = useCanvasContext()
const surfaceRef = templateRef<HTMLCanvasElement>('surfaceRef')

// Reducess: sync flush so useCanvas sees the element before its own mount hook runs.
watchEffect(
  () => {
    canvasRef.value = surfaceRef.value
  },
  { flush: 'sync' }
)
</script>

<template>
  <canvas ref="surfaceRef" v-bind="$attrs" />
</template>

<script lang="ts">
export default { inheritAttrs: false }
</script>
