<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import SiteHeader from '@/components/layout/SiteHeader.vue'
import SiteFooter from '@/components/layout/SiteFooter.vue'
import { fetchCollection } from '@/services/api'
import { useSite } from '@/stores/site'
import { TYPE_LABEL } from '@/lib/taxonomy'
import { scriptLang } from '@/lib/text'

const route = useRoute()
const site = useSite()
const data = ref<Awaited<ReturnType<typeof fetchCollection>>>(null)
const loading = ref(true)
const error = ref('')

watch(() => route.params.slug, async (slug) => {
  loading.value = true; error.value = ''
  try {
    data.value = await fetchCollection(String(slug))
    if (data.value) document.title = `${data.value.collection.title} · ${site.get('site_name')}`
  } catch (e) { error.value = e instanceof Error ? e.message : '加载失败' } finally { loading.value = false }
}, { immediate: true })
</script>

<template>
  <SiteHeader />
  <main id="main" class="wrap" style="padding-top: 48px; min-height: 50vh">
    <p v-if="error" class="err" role="alert">{{ error }}</p>
    <template v-if="data">
      <p class="crumbs"><RouterLink to="/collections">专题合集</RouterLink></p>
      <h1 :lang="scriptLang(data.collection.title)" style="font-size: clamp(40px, 7vw, 72px); line-height: 1.2; margin-top: 8px; overflow-wrap: anywhere">{{ data.collection.title }}</h1>
      <p v-if="data.collection.description" style="margin-top: 14px; font-size: 18px; max-width: 640px; color: var(--ink-soft)">{{ data.collection.description }}</p>
      <ol class="row-list" style="margin-top: 36px; list-style: none">
        <li v-for="e in data.entries" :key="e.id" style="padding: 22px 0">
          <RouterLink :to="`/entries/${e.slug}`" style="display: block">
            <span class="lab">{{ TYPE_LABEL[e.type] }}</span>
            <span :lang="scriptLang(e.title)" style="display: block; font-size: 30px; font-weight: 600; line-height: 1.5; overflow-wrap: anywhere">{{ e.title }}</span>
            <span v-if="e.personal_translation" style="display: block; font-size: 16px">译法：<b class="accent">{{ e.personal_translation }}</b></span>
          </RouterLink>
        </li>
      </ol>
      <p v-if="!data.entries.length" class="empty">这个专题里还没有公开的内容。</p>
    </template>
    <div v-else-if="!loading" class="empty">找不到这个专题。<RouterLink to="/collections" class="accent">查看全部专题</RouterLink></div>
  </main>
  <SiteFooter />
</template>
