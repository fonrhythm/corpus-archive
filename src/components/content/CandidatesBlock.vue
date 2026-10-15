<script setup lang="ts">
defineProps<{ items?: { text?: string; note?: string; chosen?: boolean }[] }>()
</script>

<template>
  <ul class="row-list" style="margin: 18px 0; padding: 0">
    <li v-for="(it, i) in items ?? []" :key="i" :style="{ display: 'flex', flexWrap: 'wrap', gap: '4px 24px', padding: '16px 14px 16px 0', listStyle: 'none', background: it.chosen ? 'var(--panel)' : 'transparent', paddingLeft: it.chosen ? '14px' : '0' }">
      <span class="lab" :style="{ flex: '0 0 56px', paddingTop: '8px', color: it.chosen ? 'var(--accent)' : undefined, fontWeight: it.chosen ? 700 : 400 }">{{ it.chosen ? '最终' : `候选 ${i + 1}` }}</span>
      <div style="flex: 1 1 260px; min-width: 0">
        <div :style="{ fontSize: it.chosen ? '24px' : '22px', fontWeight: it.chosen ? 700 : 400, overflowWrap: 'anywhere' }">{{ it.text }}</div>
        <div v-if="it.note" class="hint" style="font-size: 15px">取舍：{{ it.note }}</div>
      </div>
    </li>
  </ul>
</template>
