<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import SiteHeader from '@/components/layout/SiteHeader.vue'
import SiteFooter from '@/components/layout/SiteFooter.vue'
import { fetchCollections } from '@/services/api'
import { scriptLang } from '@/lib/text'

const list = ref<Awaited<ReturnType<typeof fetchCollections>>>([])
const loading = ref(true)
const error = ref('')
onMounted(async () => {
  try { list.value = await fetchCollections() } catch (e) { error.value = e instanceof Error ? e.message : '加载失败' } finally { loading.value = false }
})
</script>

<template>
  <SiteHeader />
  <main id="main" class="wrap" style="padding-top: 48px; min-height: 50vh">
    <p class="lab accent bold">按作品、主题或学习阶段组织</p>
    <h1 style="font-size: clamp(40px, 7vw, 64px); line-height: 1.25; margin-top: 8px">专题合集</h1>
    <p v-if="error" class="err" role="alert" style="margin-top: 24px">{{ error }}</p>
    <ul class="row-list" style="margin-top: 36px">
      <li v-for="c in list" :key="c.id" style="padding: 26px 0">
        <RouterLink :to="`/collections/${c.slug}`" style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 16px; align-items: baseline">
          <span :lang="scriptLang(c.title)" style="font-size: 36px; font-weight: 600; overflow-wrap: anywhere">{{ c.title }}</span>
          <span class="sans muted" style="font-size: 13px">{{ c.count }} 条</span>
        </RouterLink>
        <p v-if="c.description" class="muted" style="margin-top: 6px; max-width: 640px">{{ c.description }}</p>
      </li>
    </ul>
    <p v-if="!loading && !list.length && !error" class="empty">还没有公开的专题。</p>
  </main>
  <SiteFooter />
</template>
