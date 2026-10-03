<script setup lang="ts">
import IconDownload from '~icons/lucide/download'
import IconGithub from '~icons/lucide/github'
import IconPenTool from '~icons/lucide/pen-tool'

import { LINKS } from '../content/links'
import ActionLink from '../ui/ActionLink.vue'
import StageFrame from '../ui/StageFrame.vue'
</script>

<template>
  <section class="hero">
    <h1>Design without the lock&#8209;in.</h1>
    <p class="lede">
      An open-source design editor that opens your Figma files, runs on your machine, and lets you
      or your AI agent drive every layer.
    </p>
    <div class="landing-actions">
      <ActionLink :href="LINKS.app" :icon="IconPenTool" primary>Open the editor</ActionLink>
      <ActionLink :href="LINKS.download" :icon="IconDownload">Download</ActionLink>
      <ActionLink :href="LINKS.github" :icon="IconGithub">GitHub</ActionLink>
    </div>
    <div class="hero-stage">
      <StageFrame kind="hero" />
    </div>
  </section>
</template>

<style scoped>
.hero {
  padding-top: 72px;
}

h1 {
  font-size: clamp(36px, 6vw, 64px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.05;
}

.lede {
  max-width: 640px;
  margin-top: 20px;
  color: var(--vp-c-text-2);
  font-size: clamp(16px, 2vw, 19px);
  line-height: 1.55;
}

.hero-stage {
  height: min(560px, 64vh);
  min-height: 380px;
  margin-top: 56px;
}

@media (max-width: 860px) {
  .hero {
    padding-top: 40px;
  }

  .hero-stage {
    height: 320px;
    min-height: 0;
    margin-top: 36px;
  }
}
</style>
