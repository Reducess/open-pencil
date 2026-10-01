<script setup lang="ts">
import { computed, inject, ref } from 'vue'

import { useI18n } from '@open-pencil/vue'

import { getActiveEditorStoreOrNull, useActiveEditorStoreRef } from '@/app/editor/active-store'
import { focusNodesOnTheirPage } from '@/app/editor/selection/focus'
import { notificationMessages } from '@/app/i18n/notifications'
import { toast } from '@/app/shell/ui'
import { CHAT_NODES_LIVE } from '@/components/chat/tool/context'
import { chatToolTheme } from '@/theme/chat/tool'

const { ids } = defineProps<{ ids: string[] }>()
const { ai } = useI18n()
const ui = chatToolTheme()

const MAX_CHIPS = 8

const live = inject(CHAT_NODES_LIVE, ref(true))
const activeStore = useActiveEditorStoreRef()

const nodes = computed(() => {
  const store = activeStore.value
  // The graph is not reactive; the scene version changes with every edit to it.
  void store?.state.sceneVersion
  const graph = live.value ? store?.graph : undefined
  return ids.slice(0, MAX_CHIPS).map((id) => {
    const node = graph?.getNode(id)
    return { id, label: node?.name || id, present: node !== undefined && node.type !== 'CANVAS' }
  })
})

async function show(id: string): Promise<void> {
  const store = getActiveEditorStoreOrNull()
  if (!store || !live.value) return
  try {
    await focusNodesOnTheirPage(store, [id])
  } catch (error) {
    // A newer page switch supersedes this one.
    if (error instanceof Error && error.name === 'AbortError') return
    toast.error(
      notificationMessages.get().operationFailed({
        error: error instanceof Error ? error.message : String(error)
      })
    )
  }
}
</script>

<template>
  <div v-if="nodes.length" :class="ui.nodes()" data-slot="chat-tool-nodes">
    <button
      v-for="node in nodes"
      :key="node.id"
      type="button"
      :class="ui.node()"
      :disabled="!node.present"
      :aria-label="ai.showNodeOnCanvas({ name: node.label })"
      @click="void show(node.id)"
    >
      <icon-lucide-crosshair :class="ui.nodeIcon()" aria-hidden="true" />
      <span :class="ui.nodeLabel()">{{ node.label }}</span>
    </button>
  </div>
</template>
