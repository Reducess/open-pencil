<script setup lang="ts">
import SchemaOrg from '../SchemaOrg.vue'
import { FEATURE_BLOCKS } from './content/features'
import AgentList from './sections/AgentList.vue'
import ClosingSection from './sections/ClosingSection.vue'
import CommandList from './sections/CommandList.vue'
import FeatureSection from './sections/FeatureSection.vue'
import HeroSection from './sections/HeroSection.vue'
import OwnershipSection from './sections/OwnershipSection.vue'
import RoadmapSection from './sections/RoadmapSection.vue'

import './landing.css'
</script>

<template>
  <div class="landing">
    <HeroSection />
    <FeatureSection v-for="block in FEATURE_BLOCKS" :key="block.kind" :block="block">
      <AgentList v-if="block.kind === 'ai'" />
      <CommandList v-else-if="block.kind === 'script'" />
    </FeatureSection>
    <OwnershipSection />
    <RoadmapSection />
    <ClosingSection />
    <SchemaOrg />
  </div>
</template>
