<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import SiteHeader from '@/components/layout/SiteHeader.vue'
import SiteFooter from '@/components/layout/SiteFooter.vue'
import FilterPanel from '@/components/ui/FilterPanel.vue'
import EntryResult from '@/components/ui/EntryResult.vue'
import Pager from '@/components/ui/Pager.vue'
import { searchEntries } from '@/services/api'
import { useListQuery } from '@/composables/useListQuery'
import { useSite } from '@/stores/site'
import type { EntryRow } from '@/lib/types'

const route = useRoute()
const site = useSite()
const { sort, page, filters, update, one } = useListQuery()
const topic = computed(() => site.bySlug(String(route.params.slug)))
const subs = computed(() => (topic.value ? site.childrenOf(topic.value.id) : []))
const sub = computed(() => one('sub'))
const rows = ref<EntryRow[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref('')
const PAGE = 20
let seq = 0

async function run() {
  if (!topic.value) { loading.value = false; return }
  const my = ++seq
  loading.value = true; error.value = ''
  try {
    const r = await searchEntries({ ...filters.value, category: sub.value || topic.value.id, sort: 'updated', page: page.value, pageSize: PAGE })
    if (my !== seq) return
    rows.value = r.rows; total.value = r.total
  } catch (e) { if (my === seq) error.value = e instanceof Error ? e.message : '加载失败' }
  finally { if (my === seq) loading.value = false }
}
watch([() => route.params.slug, page, filters, sub, topic], run, { deep: true })
onMounted(async () => { await site.load(); await run() })
watch(topic, (t) => { if (t) document.title = `${t.name} · ${site.get('site_name')}` }, { immediate: true })
</script>

<template>
  <SiteHeader />
  <main id="main" class="wrap" style="padding-top: 48px">
    <template v-if="topic">
      <p class="crumbs"><RouterLink to="/">首页</RouterLink> / <span>主题</span></p>
      <h1 style="font-size: clamp(48px, 8vw, 88px); line-height: 1.2; letter-spacing: .1em; margin-top: 8px">{{ topic.name }}</h1>
      <p v-if="topic.description" class="muted" style="margin-top: 10px; max-width: 640px">{{ topic.description }}</p>

      <div class="sans" style="margin-top: 28px; display: flex; flex-wrap: wrap; gap: 8px" role="group" aria-label="二级分类">
        <button type="button" class="pill" :class="{ on: !sub }" @click="update({ sub: null })">全部</button>
        <button v-for="s in subs" :key="s.id" type="button" class="pill" :class="{ on: sub === s.id }" @click="update({ sub: s.id })">{{ s.name }}</button>
      </div>

      <div class="layout-2" style="margin-top: 44px">
        <FilterPanel :model-value="filters" hide-category @update:model-value="(f) => update({ ...f })" />
        <div class="results" aria-live="polite">
          <div class="rule-top"><span class="sans" style="font-size: 14px; letter-spacing: .1em"><template v-if="loading">加载中…</template><template v-else>{{ total }} 条</template></span></div>
          <p v-if="error" class="err" role="alert" style="margin-top: 20px">{{ error }} <button type="button" class="linkbtn" @click="run">重试</button></p>
          <EntryResult v-for="r in rows" :key="r.id" :row="r" />
          <div v-if="!loading && !error && !rows.length" class="empty">这个主题下还没有公开的内容。</div>
          <Pager :page="page" :page-size="PAGE" :total="total" @go="(p) => update({ page: p })" />
        </div>
      </div>
    </template>
    <div v-else-if="!loading || site.loaded" class="empty">找不到这个主题。<RouterLink to="/" class="accent">返回首页</RouterLink></div>
  </main>
  <SiteFooter />
</template>
