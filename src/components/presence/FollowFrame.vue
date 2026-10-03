<script setup lang="ts">
import { computed } from 'vue'

import { colorToCSS } from '@open-pencil/scene-graph/color'
import { useI18n } from '@open-pencil/vue'

import type { FollowedLabel } from '@/app/presence/registry'
import { followFrame } from '@/theme/collaboration/follow-frame'

const { followed } = defineProps<{ followed: FollowedLabel }>()
const emit = defineEmits<{ stop: [] }>()

const { collaboration: messages } = useI18n()
const ui = followFrame()

const color = computed(() => colorToCSS(followed.color))
const text = computed(() =>
  followed.owner
    ? messages.value.followingAgent({ agent: `✦ ${followed.name}`, owner: followed.owner })
    : messages.value.followingPerson({ name: followed.name })
)
</script>

<template>
  <div data-test-id="follow-frame" :class="ui.root()" :style="{ borderColor: color }">
    <div role="status" :class="ui.bar()" :style="{ background: color }">
      <span :class="ui.label()">{{ text }}</span>
      <button type="button" data-test-id="follow-stop" :class="ui.stop()" @click="emit('stop')">
        {{ messages.stopFollowingShort }}
      </button>
    </div>
  </div>
</template>
