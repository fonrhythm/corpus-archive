<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ kind?: string }>()
const meta = computed(() => ({
  fact: { label: '语言事实', cls: 'mark-fact' },
  inference: { label: '情境推断', cls: 'mark-inference' },
  choice: { label: '译者选择', cls: 'mark-choice' }
} as Record<string, { label: string; cls: string }>)[props.kind ?? 'fact'] ?? { label: '说明', cls: 'mark-fact' })
</script>

<template>
  <section class="note-block" :aria-label="meta.label">
    <div class="lab" style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px">
      <span class="mark" :class="meta.cls" style="margin-top: 0" aria-hidden="true"></span>{{ meta.label }}
    </div>
    <slot />
  </section>
</template>
