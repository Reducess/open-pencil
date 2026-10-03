<script setup lang="ts">
import type { UIMessage } from 'ai'

import ChatTranscript from '@/components/chat/ChatTranscript.vue'

import { GUARANTEES_JSX } from '../scenes'

/**
 * A recorded turn shown in the app's own transcript. No model runs on this page; the canvas
 * beside it holds the design this turn produced.
 */
const MESSAGES: UIMessage[] = [
  {
    id: 'request',
    role: 'user',
    parts: [{ type: 'text', text: 'Add three guarantees under the plans.' }]
  },
  {
    id: 'response',
    role: 'assistant',
    parts: [
      {
        type: 'reasoning',
        text: 'The plans sit in an auto-layout column, so a row of three cards can go right below them.',
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
        text: 'Added a **Guarantees** row under the plans: three cards that share the plan cards’ background and radius.'
      }
    ]
  }
]
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col bg-panel" aria-label="AI chat">
    <header
      class="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-[11px] font-semibold text-surface"
    >
      <icon-lucide-sparkles class="size-3.5 text-muted" aria-hidden="true" />
      AI
      <span class="ml-auto font-normal text-muted">Recorded turn</span>
    </header>
    <ChatTranscript :messages="MESSAGES" status="ready" />
  </section>
</template>
