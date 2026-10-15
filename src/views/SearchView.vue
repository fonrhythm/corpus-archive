<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import SiteHeader from '@/components/layout/SiteHeader.vue'
import SiteFooter from '@/components/layout/SiteFooter.vue'
import FilterPanel from '@/components/ui/FilterPanel.vue'
import EntryResult from '@/components/ui/EntryResult.vue'
import Pager from '@/components/ui/Pager.vue'
import { searchEntries } from '@/services/api'
import { useListQuery } from '@/composables/useListQuery'
import { debounce } from '@/lib/text'
import { useSite } from '@/stores/site'
import type { EntryRow } from '@/lib/types'

const { q, sort, page, filters, update } = useListQuery()
const site = useSite()
const text = ref(q.value)
const rows = ref<EntryRow[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const PAGE = 20
let seq = 0

async function run() {
  const my = ++seq
  loading.value = true; error.value = ''
  try {
    const r = await searchEntries({ q: q.value, ...filters.value, sort: sort.value, page: page.value, pageSize: PAGE })
    if (my !== seq) return
    rows.value = r.rows; total.value = r.total
  } catch (e) {
    if (my !== seq) return
    error.value = e instanceof Error ? e.message : '搜索失败'
  } finally { if (my === seq) loading.value = false }
}
watch([q, sort, page, filters], run, { deep: true })
onMounted(() => { void run(); document.title = (q.value ? `${q.value} · 搜索` : '搜索') + ' · ' + site.get('site_name') })
watch(q, (v) => { if (v !== text.value) text.value = v })

const live = debounce((v: string) => update({ q: v.trim() || null }, true), 400)
function onInput(e: Event) { text.value = (e.target as HTMLInputElement).value; live(text.value) }
function submit() { live.cancel(); update({ q: text.value.trim() || null }) }
const hasFilter = computed(() => Object.values(filters.value).some(Boolean))
</script>

<template>
  <SiteHeader />
  <main id="main">
    <section class="wrap" style="padding-top: 48px">
      <div class="lab accent bold">搜索</div>
      <form class="searchhero" role="search" style="margin-top: 10px" @submit.prevent="submit">
        <label for="q" class="sr">搜索原文、译文、别名或转写</label>
        <input id="q" :value="text" type="search" maxlength="100" placeholder="原文、译文、别名、转写……" autocomplete="off" @input="onInput">
        <button class="btn btn-ink" type="submit">搜索</button>
      </form>
      <p class="hint" style="margin-top: 16px; letter-spacing: .04em">支持中、英、泰、韩混合输入。原文、别名与罗马转写，会命中同一条内容。</p>
    </section>

    <section class="wrap" style="padding-top: 48px">
      <div class="layout-2">
        <FilterPanel :model-value="filters" @update:model-value="(f) => update({ ...f })" />
        <div class="results" aria-live="polite">
          <div class="rule-top sec-head" style="align-items: baseline">
            <h2 class="sans" style="font-size: 14px; letter-spacing: .1em; font-weight: 500">
              <template v-if="loading">搜索中…</template><template v-else>{{ total }} 条结果</template>
            </h2>
            <div class="sans" style="display: flex; gap: 20px; font-size: 13px; letter-spacing: .08em">
              <span class="muted">排序</span>
              <button type="button" class="linkbtn" :style="{ color: sort === 'relevance' ? 'var(--ink)' : 'var(--ink-soft)', borderBottom: sort === 'relevance' ? '1px solid var(--ink)' : '0' }" @click="update({ sort: null })">相关性</button>
              <button type="button" class="linkbtn" :style="{ color: sort === 'updated' ? 'var(--ink)' : 'var(--ink-soft)', borderBottom: sort === 'updated' ? '1px solid var(--ink)' : '0' }" @click="update({ sort: 'updated' })">最近更新</button>
            </div>
          </div>

          <p v-if="error" class="err" role="alert" style="margin-top: 20px">{{ error }} <button type="button" class="linkbtn" @click="run">重试</button></p>
          <EntryResult v-for="r in rows" :key="r.id" :row="r" :q="q" />
          <div v-if="!loading && !error && !rows.length" class="empty">
            <template v-if="q || hasFilter">没有找到匹配的内容。可以换个写法，比如原文、罗马转写或中文译法；也可以去掉一些筛选条件。</template>
            <template v-else>还没有公开的内容。</template>
          </div>
          <Pager :page="page" :page-size="PAGE" :total="total" @go="(p) => update({ page: p })" />
        </div>
      </div>
    </section>
  </main>
  <SiteFooter />
</template>
