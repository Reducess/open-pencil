<script setup lang="ts">
import type { UIMessage } from 'ai'
import { computed } from 'vue'

import ChatTranscript from '@/components/chat/ChatTranscript.vue'

import { useLandingMessages } from '../../content/messages'
import { GUARANTEES_JSX } from '../scenes'

const messages = useLandingMessages()

/**
 * A recorded turn shown in the app's own transcript. No model runs on this page; the canvas
 * beside it holds the design this turn produced.
 */
const transcript = computed<UIMessage[]>(() => [
  {
    id: 'request',
    role: 'user',
    parts: [{ type: 'text', text: messages.value.stage.ai.request }]
  },
  {
    id: 'response',
    role: 'assistant',
    parts: [
      {
        type: 'reasoning',
        text: messages.value.stage.ai.reasoning,
        state: 'done'
      },
      {
        type: 'tool-render',
        toolCallId: 'render-guarantees',
        state: 'output-available',
        input: { jsx: GUARANTEES_JSX, parent_id: 'Pricing' },
        output: { id: 'Guarantees', name: 'Guarantees', type: 'FRAME' }
      },
      {
        type: 'text',
        text: messages.value.stage.ai.reply
      }
    ]
  }
])
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col bg-panel" aria-label="AI chat">
    <header
      class="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-[11px] font-semibold text-surface"
    >
      <icon-lucide-sparkles class="size-3.5 text-muted" aria-hidden="true" />
      AI
      <span class="ml-auto font-normal text-muted">{{ messages.stage.ai.recorded }}</span>
    </header>
    <ChatTranscript :messages="transcript" status="ready" />
  </section>
</template>
