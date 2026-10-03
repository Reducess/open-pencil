<script setup lang="ts">
import { colorToCSS } from '@open-pencil/scene-graph/color'
import { useI18n } from '@open-pencil/vue'

import { initials } from '@/app/shell/ui'
import { useCollabPanelContext } from '@/components/collab-panel/context'
import Tip from '@/components/ui/overlay/Tip.vue'
import { avatar } from '@/theme/collaboration/avatar'

const collab = useCollabPanelContext()
const { common, collaboration: collaborationMessages } = useI18n()
const localAvatar = avatar({ bordered: true })

function peerAvatarClass(following: boolean) {
  return avatar({ bordered: true, following, interactive: true })
}
</script>

<template>
  <div class="flex -space-x-1.5">
    <Tip :label="`${collab.state.localName || common.you} (${common.youSuffix})`">
      <div
        data-test-id="collab-local-avatar"
        :class="localAvatar"
        :style="{ background: colorToCSS(collab.state.localColor) }"
      >
        {{ initials(collab.state.localName || common.you) }}
      </div>
    </Tip>

    <Tip
      v-for="peer in collab.peers"
      :key="peer.clientId"
      :label="
        collab.followingPeer === peer.clientId
          ? collaborationMessages.followingPeerStop({ name: peer.name })
          : collaborationMessages.clickToFollowPeer({ name: peer.name })
      "
    >
      <div
        data-test-id="collab-peer-avatar"
        :data-following="collab.followingPeer === peer.clientId || undefined"
        :class="peerAvatarClass(collab.followingPeer === peer.clientId)"
        :style="{ background: colorToCSS(peer.color) }"
        @click="collab.toggleFollowPeer(peer.clientId)"
      >
        {{ initials(peer.name) }}
      </div>
    </Tip>
  </div>
</template>
