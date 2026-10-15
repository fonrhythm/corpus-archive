<script setup lang="ts">
import { scriptLang } from '@/lib/text'
defineProps<{ text?: string; from?: string }>()
</script>

<template>
  <blockquote style="margin: 18px 0; padding-left: 18px; border-left: 1px solid var(--ink)">
    <p :lang="scriptLang(text)" style="white-space: pre-wrap; font-size: 20px; line-height: 1.9">{{ text }}</p>
    <footer v-if="from" class="hint" style="font-size: 13px; margin-top: 6px">— {{ from }}</footer>
  </blockquote>
</template>
