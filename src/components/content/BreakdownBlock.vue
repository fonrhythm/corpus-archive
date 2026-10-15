<script setup lang="ts">
import { scriptLang } from '@/lib/text'
defineProps<{ items?: { token?: string; meaning?: string; note?: string }[] }>()
</script>

<template>
  <ul class="row-list" style="margin: 18px 0; padding: 0">
    <li v-for="(it, i) in items ?? []" :key="i" style="display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 24px; padding: 14px 0; border-bottom: 1px solid var(--rule); list-style: none">
      <span :lang="scriptLang(it.token)" style="flex: 0 0 170px; font-size: 30px; line-height: 1.6; overflow-wrap: anywhere">{{ it.token }}</span>
      <span style="font-size: 20px; flex: 1 1 200px">{{ it.meaning }}<span v-if="it.note" class="hint" style="font-size: 14px; display: block">{{ it.note }}</span></span>
    </li>
  </ul>
</template>
