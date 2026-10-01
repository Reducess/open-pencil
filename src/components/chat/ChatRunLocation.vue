<script setup lang="ts">
import { computed } from 'vue'

import { useI18n } from '@open-pencil/vue'

import { runAgentId } from '@/app/ai/tools'
import { presenceOf } from '@/app/presence/registry'
import { activeTab } from '@/app/tabs'
import AppButton from '@/components/ui/button/AppButton.vue'

const { ai } = useI18n()

/** The page the chat's reply works on, while you look at a different one. */
const elsewhere = computed(() => {
  const tab = activeTab.value
  if (!tab || tab.kind === 'home') return null
  const store = tab.store
  const agentId = runAgentId(store)
  const agent = presenceOf(store).agents.value.find((entry) => entry.id === agentId)
  if (!agent || agent.status === 'idle' || !agent.pageId) return null
  if (agent.pageId === store.state.currentPageId) return null
  const page = store.graph.getNode(agent.pageId)?.name
  return page ? { store, agent: agent.name, page, pageId: agent.pageId } : null
})
</script>

<template>
  <p
    v-if="elsewhere"
    role="status"
    data-test-id="chat-run-location"
    class="flex items-center gap-2 px-3 py-1.5 text-xs text-muted"
  >
    <span class="min-w-0 flex-1 truncate">
      {{ ai.chatAgentWorkingOn({ agent: elsewhere.agent, page: elsewhere.page }) }}
    </span>
    <AppButton size="xs" variant="link" @click="elsewhere.store.switchPage(elsewhere.pageId)">
      {{ ai.chatGoToPage }}
    </AppButton>
  </p>
</template>
