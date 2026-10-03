<script setup lang="ts">
import { data as stats } from '../content/stats.data'
</script>

<template>
  <div class="commands">
    <h3>{{ stats.cliCommands.length }} commands</h3>
    <ul>
      <li v-for="command in stats.cliCommands" :key="command">{{ command }}</li>
    </ul>
    <h3>{{ stats.mcpTools }} MCP tools</h3>
    <p>
      Create, style, lay out, inspect, and export, each one also available to the built-in agent.
    </p>
  </div>
</template>

<style scoped>
.commands {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

h3 {
  color: var(--vp-c-text-1);
  font-size: 13px;
  font-weight: 600;
}

h3:not(:first-child) {
  margin-top: 8px;
}

ul {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

li {
  padding: 2px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  line-height: 20px;
}

p {
  font-size: 14px;
  line-height: 1.55;
}
</style>
