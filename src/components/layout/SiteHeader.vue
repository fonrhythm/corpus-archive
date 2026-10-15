<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useSite } from '@/stores/site'

const props = defineProps<{ home?: boolean }>()
const site = useSite()
const router = useRouter()
const q = ref('')
const today = computed(() => {
  const d = new Date()
  const w = '日一二三四五六'[d.getDay()]
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${w}`
})
function go() {
  const t = q.value.trim()
  void router.push({ path: '/search', query: t ? { q: t } : {} })
}
</script>

<template>
  <header class="wrap" style="padding-top: 20px">
    <div v-if="props.home" class="mast-top">
      <span>多语言语料库 · 翻译档案馆</span>
      <span>{{ today }}</span>
      <RouterLink to="/admin">管理入口</RouterLink>
    </div>
    <div class="double-rule" :style="{ marginTop: props.home ? '14px' : '0' }"></div>

    <div v-if="props.home" class="mast-title">
      <h1>{{ site.get('site_name') }}</h1>
      <p class="lat">{{ site.get('site_subtitle') }}</p>
    </div>
    <div v-else class="mast-compact">
      <RouterLink to="/" class="brand">{{ site.get('site_name') }}</RouterLink>
    </div>

    <nav class="nav" aria-label="主导航">
      <div class="nav-links">
        <RouterLink v-for="t in site.topics" :key="t.id" :to="`/topics/${t.slug}`">{{ t.name }}</RouterLink>
        <span class="sep" aria-hidden="true">/</span>
        <RouterLink to="/corpus">语料</RouterLink>
        <RouterLink to="/notes">札记</RouterLink>
        <RouterLink to="/collections">专题</RouterLink>
      </div>
      <form class="searchbar" role="search" @submit.prevent="go">
        <label for="site-q" class="sr">搜索原文、译文、别名或转写</label>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <input id="site-q" v-model="q" type="search" maxlength="100" placeholder="搜索原文、译文、别名、转写" autocomplete="off">
      </form>
    </nav>
  </header>
</template>
