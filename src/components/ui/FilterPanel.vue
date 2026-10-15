<script setup lang="ts">
import { computed } from 'vue'
import { useSite } from '@/stores/site'
import { LANGS } from '@/lib/taxonomy'
import type { EntryType } from '@/lib/types'

export interface Filters { category: string | null; lang: string | null; type: EntryType | null; tag: string | null }
const props = defineProps<{ modelValue: Filters; hideCategory?: boolean; hideType?: boolean; categoryOptions?: { id: string; name: string }[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Filters): void }>()
const site = useSite()

const cats = computed(() => props.categoryOptions ?? site.topics.map((t) => ({ id: t.id, name: t.name })))
const tagGroups = computed(() => site.tags.slice(0, 40))
function set<K extends keyof Filters>(k: K, v: Filters[K]) {
  emit('update:modelValue', { ...props.modelValue, [k]: props.modelValue[k] === v ? null : v })
}
</script>

<template>
  <aside class="filters" aria-label="筛选">
    <div v-if="!hideCategory" class="fgroup">
      <h2 class="lab bold" style="color: var(--ink)">主题</h2>
      <div style="margin-top: 8px">
        <label v-for="c in cats" :key="c.id" class="chk">
          <input type="checkbox" :checked="modelValue.category === c.id" @change="set('category', c.id)">{{ c.name }}
        </label>
      </div>
    </div>
    <div class="fgroup">
      <h2 class="lab bold" style="color: var(--ink)">语言</h2>
      <div style="margin-top: 8px">
        <label v-for="l in LANGS" :key="l.code" class="chk">
          <input type="checkbox" :checked="modelValue.lang === l.code" @change="set('lang', l.code)">{{ l.native }}
        </label>
      </div>
    </div>
    <div v-if="!hideType" class="fgroup">
      <h2 class="lab bold" style="color: var(--ink)">内容类型</h2>
      <div style="margin-top: 8px">
        <label class="chk"><input type="checkbox" :checked="modelValue.type === 'corpus_card'" @change="set('type', 'corpus_card')">语料卡片</label>
        <label class="chk"><input type="checkbox" :checked="modelValue.type === 'translation_note'" @change="set('type', 'translation_note')">翻译札记</label>
      </div>
    </div>
    <div v-if="tagGroups.length" class="fgroup">
      <h2 class="lab bold" style="color: var(--ink)">标签</h2>
      <div class="tag-line" style="margin-top: 12px">
        <button v-for="t in tagGroups" :key="t.id" type="button" class="pill" :class="{ on: modelValue.tag === t.id }" style="min-height: 34px; font-size: 13px; padding: 0 12px" @click="set('tag', t.id)">{{ t.name }}</button>
      </div>
    </div>
  </aside>
</template>
