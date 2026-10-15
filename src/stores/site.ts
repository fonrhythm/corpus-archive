import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchSettings, fetchCategories, fetchTags } from '@/services/api'
import type { Category, Tag } from '@/lib/types'

const DEFAULTS: Record<string, string> = {
  site_name: '语料档案馆',
  site_subtitle: 'Corpus & Translation Archive',
  author_name: 'Valar Morghulis·F',
  about: '这是一个长期保存、检索与展示翻译内容、语言表达、文化语境，以及译者个人思考的地方。以中文读者为主，收录中文、英语、泰语、韩语及其他语言的资料。',
  about_2: '语言事实、语境判断与个人译法，会分开呈现。',
  motto: '忠实保存原文，清楚标注个人诠释。'
}

export const useSite = defineStore('site', () => {
  const settings = ref<Record<string, string>>({ ...DEFAULTS })
  const categories = ref<Category[]>([])
  const tags = ref<Tag[]>([])
  const loaded = ref(false)
  const failed = ref(false)

  async function load(force = false) {
    if (loaded.value && !force) return
    try {
      const [s, c, t] = await Promise.all([fetchSettings(), fetchCategories(), fetchTags()])
      settings.value = { ...DEFAULTS, ...s }
      categories.value = c; tags.value = t
      failed.value = false
    } catch { failed.value = true }
    loaded.value = true
  }

  const get = (k: string) => settings.value[k] ?? DEFAULTS[k] ?? ''
  const topics = computed(() => categories.value.filter((c) => !c.parent_id))
  const childrenOf = (id: string) => categories.value.filter((c) => c.parent_id === id)
  const byId = (id: string | null | undefined) => (id ? categories.value.find((c) => c.id === id) : undefined)
  const bySlug = (slug: string) => categories.value.find((c) => c.slug === slug)
  /** 返回 [一级, 二级]，二级可能为空 */
  const pathOf = (id: string | null | undefined): Category[] => {
    const c = byId(id); if (!c) return []
    const p = c.parent_id ? byId(c.parent_id) : undefined
    return p ? [p, c] : [c]
  }
  const findByNames = (topic: string, sub?: string) => {
    const t = categories.value.find((c) => !c.parent_id && c.name === topic)
    if (!t) return null
    return (sub && categories.value.find((c) => c.parent_id === t.id && c.name === sub)) || t
  }

  return { settings, categories, tags, loaded, failed, load, get, topics, childrenOf, byId, bySlug, pathOf, findByNames }
})
