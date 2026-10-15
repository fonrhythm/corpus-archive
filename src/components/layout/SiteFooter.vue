<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useSite } from '@/stores/site'
const site = useSite()
</script>

<template>
  <footer class="wrap sans" style="padding-top: 72px; padding-bottom: 56px">
    <div class="double-rule-rev"></div>
    <div style="margin-top: 22px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px 32px; font-size: 13px; letter-spacing: .06em; color: var(--ink-soft)">
      <span>© {{ new Date().getFullYear() }} {{ site.get('site_name') }} · 译者署名：{{ site.get('author_name') }}</span>
      <span>歌词、台词与小说原文的引用范围，依来源与授权而定。</span>
      <RouterLink to="/admin" style="padding: 6px 0">管理入口</RouterLink>
    </div>
  </footer>
</template>
