<script setup lang="ts">
import { withBase } from 'vitepress'
import IconBookOpen from '~icons/lucide/book-open'
import IconDownload from '~icons/lucide/download'

import { LINKS } from '../content/links'
import ActionLink from '../ui/ActionLink.vue'
</script>

<template>
  <section class="landing-section">
    <h2>Take your designs with you.</h2>
    <div class="landing-actions">
      <ActionLink :href="LINKS.download" :icon="IconDownload" primary>
        Download OpenPencil
      </ActionLink>
      <ActionLink :href="withBase(LINKS.docs)" :icon="IconBookOpen">Read the docs</ActionLink>
    </div>
  </section>
</template>
