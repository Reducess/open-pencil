<script setup lang="ts">
import { tv } from 'tailwind-variants'
import { computed } from 'vue'

import { colorToCSS } from '@open-pencil/scene-graph/color'

import type { PagePresenceEntry } from '@/app/presence/registry'
import Tip from '@/components/ui/overlay/Tip.vue'
import collaborationTheme from '@/theme/collaboration'

/** How many people and agents a row shows before summarizing the rest as "+N". */
const MAX_MARKERS = 3

const { entries } = defineProps<{ entries: PagePresenceEntry[] }>()

const ui = tv(collaborationTheme)()
const shown = computed(() => entries.slice(0, MAX_MARKERS))
const hidden = computed(() => entries.length - shown.value.length)
const names = computed(() => entries.map((entry) => entry.name).join(', '))
</script>

<template>
  <Tip v-if="entries.length > 0" :label="names">
    <span data-test-id="presence-markers" :aria-label="names" role="img" :class="ui.markers()">
      <template v-for="entry in shown" :key="`${entry.kind}:${entry.name}`">
        <icon-lucide-sparkle
          v-if="entry.kind === 'agent'"
          :class="ui.agentMarker()"
          :style="{ color: colorToCSS(entry.color) }"
        />
        <span v-else :class="ui.personMarker()" :style="{ background: colorToCSS(entry.color) }" />
      </template>
      <span v-if="hidden > 0" :class="ui.markerOverflow()">+{{ hidden }}</span>
    </span>
  </Tip>
</template>
