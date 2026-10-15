<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import SiteHeader from '@/components/layout/SiteHeader.vue'
import SiteFooter from '@/components/layout/SiteFooter.vue'
import FilterPanel from '@/components/ui/FilterPanel.vue'
import EntryResult from '@/components/ui/EntryResult.vue'
import Pager from '@/components/ui/Pager.vue'
import { searchEntries } from '@/services/api'
import { useListQuery } from '@/composables/useListQuery'
import { TYPE_LABEL } from '@/lib/taxonomy'
import type { EntryRow, EntryType } from '@/lib/types'

const props = defineProps<{ kind: EntryType }>()
const { sort, page, filters, update } = useListQuery()
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
    const r = await searchEntries({ ...filters.value, type: props.kind, sort: 'updated', page: page.value, pageSize: PAGE })
    if (my !== seq) return
    rows.value = r.rows; total.value = r.total
  } catch (e) { if (my === seq) error.value = e instanceof Error ? e.message : '加载失败' }
  finally { if (my === seq) loading.value = false }
}
watch([page, filters, () => props.kind, sort], run, { deep: true })
onMounted(run)
</script>

<template>
  <SiteHeader />
  <main id="main" class="wrap" style="padding-top: 48px">
    <p class="lab accent bold">{{ kind === 'corpus_card' ? '词、短语、称谓与固定表达' : '译法的取舍与理由' }}</p>
    <h1 style="font-size: clamp(40px, 7vw, 64px); line-height: 1.25; margin-top: 8px">{{ TYPE_LABEL[kind] }}</h1>
    <div class="layout-2" style="margin-top: 44px">
      <FilterPanel :model-value="filters" hide-type @update:model-value="(f) => update({ ...f })" />
      <div class="results" aria-live="polite">
        <div class="rule-top"><span class="sans" style="font-size: 14px; letter-spacing: .1em"><template v-if="loading">加载中…</template><template v-else>{{ total }} 条</template></span></div>
        <p v-if="error" class="err" role="alert" style="margin-top: 20px">{{ error }} <button type="button" class="linkbtn" @click="run">重试</button></p>
        <EntryResult v-for="r in rows" :key="r.id" :row="r" />
        <div v-if="!loading && !error && !rows.length" class="empty">这里还没有公开的内容。</div>
        <Pager :page="page" :page-size="PAGE" :total="total" @go="(p) => update({ page: p })" />
      </div>
    </div>
  </main>
  <SiteFooter />
</template>
