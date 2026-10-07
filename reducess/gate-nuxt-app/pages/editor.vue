<script setup lang="ts">
import { defineAsyncComponent, ref, onMounted, shallowRef } from 'vue'

const route = useRoute()
const Editor = shallowRef<any>(null)
const baseURL = useRuntimeConfig().app.baseURL

onMounted(async () => {
  const q = route.query
  if (q.fix) {
    const { getCanvasKit } = await import('@open-pencil/core/canvaskit')
    await getCanvasKit({ locateFile: (f: string) => `${baseURL}openpencil/${f}` })
  }
  if (q.fix === '1') {
    const { fontManager } = await import('@open-pencil/core/text')
    const FILES: Record<string, string> = {
      'Inter|Regular': 'Inter-Regular.ttf', 'Inter|Medium': 'Inter-Medium.ttf', 'Inter|SemiBold': 'Inter-SemiBold.ttf',
      'Inter|Bold': 'Inter-Bold.ttf', 'Inter|ExtraBold': 'Inter-ExtraBold.ttf', 'Noto Naskh Arabic|Regular': 'NotoNaskhArabic-Regular.ttf',
    }
    fontManager.setHostFontLoader(async (family: string, style: string) => {
      const f = FILES[`${family}|${style}`]
      if (!f) return null
      const r = await fetch(`${baseURL}openpencil/fonts/${f}`)
      return r.ok ? r.arrayBuffer() : null
    })
  }
  if (q.online === 'off') {
    const { fontManager } = await import('@open-pencil/core/text')
    fontManager.setOnlineFontProviders({ google: false, fontsource: false, bunny: false, fontshare: false })
  }
  Editor.value = defineAsyncComponent(() => import('~/components/GateEditor.vue'))
})
</script>

<template>
  <ClientOnly><component :is="Editor" v-if="Editor" /></ClientOnly>
</template>
