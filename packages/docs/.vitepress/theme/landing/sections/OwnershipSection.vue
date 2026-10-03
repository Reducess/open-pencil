<script setup lang="ts">
import { OWNERSHIP } from '../content/ownership'
</script>

<template>
  <section class="landing-section">
    <h2>Your files stay yours</h2>
    <dl class="landing-facts">
      <div v-for="item in OWNERSHIP" :key="item.title">
        <dt>{{ item.title }}</dt>
        <dd>{{ item.detail }}</dd>
      </div>
    </dl>
  </section>
</template>
