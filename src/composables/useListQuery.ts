import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Filters } from '@/components/ui/FilterPanel.vue'
import type { EntryType } from '@/lib/types'

/** 把筛选条件放进 URL：刷新、返回、分享链接都能保持同样的结果。 */
export function useListQuery() {
  const route = useRoute()
  const router = useRouter()
  const one = (k: string) => { const v = route.query[k]; const s = Array.isArray(v) ? v[0] : v; return s ? String(s) : null }

  const q = computed(() => one('q') ?? '')
  const sort = computed<'relevance' | 'updated'>(() => (one('sort') === 'updated' ? 'updated' : 'relevance'))
  const page = computed(() => Math.max(1, Number(one('page') ?? 1) || 1))
  const filters = computed<Filters>(() => ({
    category: one('category'), lang: one('lang'),
    type: (one('type') as EntryType | null), tag: one('tag')
  }))

  function update(patch: Record<string, string | number | null | undefined>, replace = false) {
    const next: Record<string, string> = {}
    const cur: Record<string, string | null | undefined | number> = {
      q: q.value || null, sort: sort.value === 'updated' ? 'updated' : null, page: null,
      category: filters.value.category, lang: filters.value.lang, type: filters.value.type, tag: filters.value.tag, sub: one('sub')
    }
    // 任何筛选变化都回到第 1 页，除非显式传 page
    const merged = { ...cur, ...patch }
    for (const [k, v] of Object.entries(merged)) if (v !== null && v !== undefined && v !== '' && !(k === 'page' && Number(v) === 1)) next[k] = String(v)
    const go = replace ? router.replace : router.push
    void go({ path: route.path, query: next })
  }
  return { q, sort, page, filters, update, one }
}
