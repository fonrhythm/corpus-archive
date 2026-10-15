<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useSite } from '@/stores/site'
import { TYPE_LABEL, TSTATUS_LABEL, STATUS_LABEL } from '@/lib/taxonomy'
import { highlightParts, scriptLang } from '@/lib/text'
import type { EntryRow, MatchSource } from '@/lib/types'

const props = defineProps<{ row: EntryRow; q?: string; showStatus?: boolean }>()
const site = useSite()
const path = computed(() => site.pathOf(props.row.primary_category_id).map((c) => c.name).join(' · '))
const MATCH: Record<MatchSource, string> = {
  title: '标题', alias: '别名', translation: '译法', subtitle: '副标题', summary: '摘要', tag: '标签', source: '来源', body: '正文', fuzzy: '近似'
}
const title = computed(() => highlightParts(props.row.title, props.q ?? ''))
const snippet = computed(() => highlightParts(props.row.snippet ?? '', props.q ?? ''))
</script>

<template>
  <RouterLink :to="`/entries/${row.slug}`" class="result">
    <div class="r-meta">
      <span class="lab">{{ TYPE_LABEL[row.type] }}<template v-if="path"> · {{ path }}</template></span>
      <span v-if="q && row.match_source" class="badge">命中：{{ MATCH[row.match_source] }}</span>
      <span v-if="row.translation_status === 'verify'" class="badge badge-ink">{{ TSTATUS_LABEL.verify }}</span>
      <span v-if="showStatus && row.status !== 'public'" class="badge badge-ink">{{ STATUS_LABEL[row.status] }}</span>
    </div>
    <div class="r-title" :lang="scriptLang(row.title)">
      <template v-for="(p, i) in title" :key="i"><mark v-if="p.hit">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template>
    </div>
    <p v-if="row.subtitle" class="muted" :lang="scriptLang(row.subtitle)" style="font-size: 18px">{{ row.subtitle }}</p>
    <p v-if="row.personal_translation" style="font-size: 18px; margin-top: 4px">
      {{ row.type === 'corpus_card' ? '个人译法：' : '最终译法：' }}<b class="accent">{{ row.personal_translation }}</b>
    </p>
    <p v-if="row.snippet" style="margin-top: 8px; font-size: 16px; line-height: 1.95; color: var(--ink-soft); max-width: 640px">
      <span v-if="q && row.match_source && ['alias', 'tag', 'source'].includes(row.match_source)" class="lab" style="margin-right: 8px">{{ MATCH[row.match_source] }}</span>
      <template v-for="(p, i) in snippet" :key="i"><mark v-if="p.hit">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template>
    </p>
  </RouterLink>
</template>
