<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import {
  fetchCollections, saveCollection, deleteCollection, collectionEntries, setCollectionOrder, addEntryToCollection,
  removeEntryFromCollection, pickEntries, type MiniEntry
} from '@/services/api'
import { slugify, randomSlug, debounce } from '@/lib/text'
import { STATUS_LABEL, TYPE_LABEL } from '@/lib/taxonomy'
import type { CollectionRow, EntryStatus } from '@/lib/types'

const list = ref<(CollectionRow & { count: number })[]>([])
const msg = ref('')
const form = reactive<{ id?: string; title: string; slug: string; description: string; status: EntryStatus }>({ title: '', slug: '', description: '', status: 'draft' })
const items = ref<(MiniEntry & { status: EntryStatus })[]>([])
const q = ref(''); const results = ref<MiniEntry[]>([])

async function reload() { list.value = await fetchCollections() }
onMounted(reload)

async function pick(c: CollectionRow) {
  Object.assign(form, { id: c.id, title: c.title, slug: c.slug, description: c.description ?? '', status: c.status })
  items.value = await collectionEntries(c.id)
}
function fresh() { Object.assign(form, { id: undefined, title: '', slug: '', description: '', status: 'draft' }); items.value = [] }
async function save() {
  msg.value = ''
  try {
    const id = await saveCollection({ id: form.id, title: form.title, slug: form.slug.trim() || `${slugify(form.title) || 'c'}-${randomSlug().slice(2, 6)}`, description: form.description || null, status: form.status })
    await reload(); form.id = id; msg.value = '专题已保存。'
    const c = list.value.find((x) => x.id === id); if (c) form.slug = c.slug
  } catch (e) { msg.value = e instanceof Error ? e.message : '保存失败' }
}
async function remove() { if (!form.id || !confirm('删除这个专题？里面的条目不会被删除。')) return; await deleteCollection(form.id); fresh(); await reload() }

const search = debounce(async () => { results.value = (await pickEntries(q.value)).filter((r) => !items.value.some((i) => i.id === r.id)) }, 300)
async function add(r: MiniEntry) { if (!form.id) return; await addEntryToCollection(form.id, r.id); items.value = await collectionEntries(form.id); results.value = []; q.value = ''; await reload() }
async function remEntry(id: string) { if (!form.id) return; await removeEntryFromCollection(form.id, id); items.value = await collectionEntries(form.id); await reload() }
async function move(i: number, d: -1 | 1) {
  const j = i + d; if (!form.id || j < 0 || j >= items.value.length) return
  const a = [...items.value]; [a[i], a[j]] = [a[j], a[i]]; items.value = a
  await setCollectionOrder(form.id, a.map((x) => x.id))
}
</script>

<template>
  <div class="sec-head"><h1 style="font-size: 44px; line-height: 1.3">专题</h1><button type="button" class="btn btn-ink" @click="fresh">新建专题</button></div>
  <p v-if="msg" class="save-state" role="status" style="margin-top: 8px">{{ msg }}</p>
  <div class="admin-grid" style="margin-top: 28px">
    <section class="admin-side" style="flex: 2 1 260px">
      <ul class="row-list" style="list-style: none">
        <li v-for="c in list" :key="c.id"><button type="button" class="linkbtn" style="color: var(--ink); font-size: 18px; text-align: left; width: 100%" @click="pick(c)">{{ c.title }}<span class="sans muted" style="font-size: 12px"> · {{ STATUS_LABEL[c.status] }} · {{ c.count }} 条</span></button></li>
      </ul>
      <p v-if="!list.length" class="empty" style="padding: 12px 0">还没有专题。</p>
    </section>
    <section class="admin-main">
      <form class="panel" @submit.prevent="save">
        <h3>{{ form.id ? '编辑专题' : '新专题' }}</h3>
        <div class="field"><label for="ct">标题</label><input id="ct" v-model="form.title" class="input big" required></div>
        <div class="field" style="margin-top: 12px"><label for="cdd">说明</label><textarea id="cdd" v-model="form.description" class="textarea"></textarea></div>
        <div style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px">
          <div class="field" style="flex: 1 1 160px"><label for="cst">可见性</label><select id="cst" v-model="form.status" class="select"><option v-for="(l, k) in STATUS_LABEL" :key="k" :value="k">{{ l }}</option></select></div>
          <div class="field" style="flex: 2 1 200px"><label for="csl">链接名</label><input id="csl" v-model="form.slug" class="input" placeholder="留空自动生成"></div>
        </div>
        <div style="margin-top: 14px; display: flex; gap: 8px"><button class="btn btn-ink" type="submit">保存专题</button><button v-if="form.id" type="button" class="btn btn-danger" @click="remove">删除专题</button></div>
      </form>

      <div v-if="form.id" style="margin-top: 28px">
        <div class="rule-top"><h2 style="font-size: 20px">专题里的条目</h2></div>
        <ol class="row-list" style="list-style: none">
          <li v-for="(e, i) in items" :key="e.id" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between">
            <span style="font-size: 18px">{{ e.title }} <span class="sans muted" style="font-size: 12px">{{ TYPE_LABEL[e.type] }} · {{ STATUS_LABEL[e.status] }}</span></span>
            <span><button type="button" class="btn btn-sm btn-ghost" :disabled="i === 0" :aria-label="`上移 ${e.title}`" @click="move(i, -1)">↑</button><button type="button" class="btn btn-sm btn-ghost" :disabled="i === items.length - 1" :aria-label="`下移 ${e.title}`" @click="move(i, 1)">↓</button><button type="button" class="btn btn-sm btn-ghost" @click="remEntry(e.id)">移除</button></span>
          </li>
        </ol>
        <div class="field" style="margin-top: 14px"><label for="cq">添加条目</label><input id="cq" v-model="q" class="input" placeholder="搜索标题、别名" @input="search"></div>
        <ul style="list-style: none; margin-top: 6px"><li v-for="r in results" :key="r.id"><button type="button" class="btn btn-sm btn-ghost" @click="add(r)">+ {{ r.title }}</button></li></ul>
        <p class="hint" style="margin-top: 8px">前台只会显示已公开的条目。</p>
      </div>
    </section>
  </div>
</template>
