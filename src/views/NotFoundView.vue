<script setup lang="ts">
import { RouterLink } from 'vue-router'
import SiteHeader from '@/components/layout/SiteHeader.vue'
import SiteFooter from '@/components/layout/SiteFooter.vue'
</script>

<template>
  <SiteHeader />
  <main id="main" class="wrap" style="padding-top: 80px; min-height: 50vh">
    <p class="lab accent bold">404</p>
    <h1 style="font-size: 56px; line-height: 1.3; margin-top: 8px">这一页不存在，<br>或者尚未公开。</h1>
    <p class="muted sans" style="margin-top: 16px; font-size: 14px">链接可能已经改过，或这条内容还是草稿。</p>
    <p style="margin-top: 28px"><RouterLink to="/" class="btn">返回首页</RouterLink> <RouterLink to="/search" class="btn" style="margin-left: 8px">搜索</RouterLink></p>
  </main>
  <SiteFooter />
</template>
