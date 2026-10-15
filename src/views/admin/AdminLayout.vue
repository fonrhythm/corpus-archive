<script setup lang="ts">
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { useAuth } from '@/stores/auth'
import { useSite } from '@/stores/site'

const auth = useAuth(); const site = useSite(); const router = useRouter()
async function out() { await auth.signOut(); await router.replace('/') }
</script>

<template>
  <header class="wrap" style="padding-top: 20px">
    <div class="double-rule"></div>
    <div class="mast-compact">
      <div style="display: flex; align-items: baseline; gap: 16px">
        <RouterLink to="/" class="brand" style="font-size: 30px; font-weight: 600; letter-spacing: .14em">{{ site.get('site_name') }}</RouterLink>
        <span class="lab chip" style="padding: 0 10px">管理后台</span>
      </div>
      <div class="sans" style="font-size: 13px; display: flex; gap: 16px; align-items: center">
        <span class="muted">{{ auth.email }}</span>
        <button type="button" class="linkbtn" style="color: var(--ink)" @click="out">退出</button>
      </div>
    </div>
    <nav class="nav" aria-label="后台导航">
      <div class="nav-links">
        <RouterLink to="/admin" exact-active-class="router-link-active">概览</RouterLink>
        <RouterLink to="/admin/entries">内容</RouterLink>
        <RouterLink to="/admin/entries/new">新建</RouterLink>
        <RouterLink to="/admin/taxonomy">分类与标签</RouterLink>
        <RouterLink to="/admin/collections">专题</RouterLink>
        <RouterLink to="/admin/media">媒体</RouterLink>
        <RouterLink to="/admin/backup">备份</RouterLink>
        <RouterLink to="/admin/settings">设置</RouterLink>
      </div>
    </nav>
  </header>
  <main id="main" class="wrap" style="padding-top: 40px; padding-bottom: 80px; min-height: 70vh">
    <RouterView />
  </main>
</template>
