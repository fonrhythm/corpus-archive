<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useSite } from '@/stores/site'
import { saveCategory, deleteCategory, saveTag, deleteTag, mergeTags, tagUsage, fetchTags } from '@/services/api'
import { slugify, randomSlug } from '@/lib/text'
import { TAG_TYPES } from '@/lib/taxonomy'
import type { Category, Tag } from '@/lib/types'

const site = useSite()
const tags = ref<Tag[]>([])
const usage = ref<Record<string, number>>({})
const msg = ref('')
const catForm = reactive<{ id?: string; parent_id: string | null; name: string; slug: string; description: string; sort_order: number; is_active: boolean }>({
  parent_id: null, name: '', slug: '', description: '', sort_order: 0, is_active: true
})
const tagForm = reactive({ name: '', type: '其他' })
const tagFilter = ref('')
const mergeTarget = reactive<Record<string, string>>({})

async function reload() { await site.load(true); tags.value = await fetchTags(); usage.value = await tagUsage() }
onMounted(reload)

function editCat(c: Category) { Object.assign(catForm, { id: c.id, parent_id: c.parent_id, name: c.name, slug: c.slug, description: c.description ?? '', sort_order: c.sort_order, is_active: c.is_active }) }
function newCat(parent: string | null) { Object.assign(catForm, { id: undefined, parent_id: parent, name: '', slug: '', description: '', sort_order: 0, is_active: true }) }
async function submitCat() {
  msg.value = ''
  try {
    await saveCategory({ ...catForm, slug: catForm.slug.trim() || `${slugify(catForm.name) || 'c'}-${randomSlug().slice(2, 6)}`, description: catForm.description || null })
    await reload(); newCat(null); msg.value = '分类已保存。'
  } catch (e) { msg.value = e instanceof Error ? e.message : '保存失败' }
}
async function removeCat(c: Category) {
  if (!confirm(`删除分类「${c.name}」？用到它的条目会变成「未分类」。`)) return
  try { await deleteCategory(c.id); await reload() } catch (e) { msg.value = e instanceof Error ? e.message : '删除失败' }
}

const shownTags = computed(() => tags.value.filter((t) => !tagFilter.value || t.name.includes(tagFilter.value) || t.type === tagFilter.value))
async function addTag() {
  const name = tagForm.name.trim(); if (!name) return
  try { await saveTag({ name, slug: `${slugify(name) || 't'}-${randomSlug().slice(2, 6)}`, type: tagForm.type }); tagForm.name = ''; await reload() }
  catch (e) { msg.value = e instanceof Error ? e.message : '新建失败' }
}
async function updateTag(t: Tag) { try { await saveTag(t); msg.value = `标签「${t.name}」已保存。` } catch (e) { msg.value = e instanceof Error ? e.message : '保存失败' } }
async function removeTag(t: Tag) { if (!confirm(`删除标签「${t.name}」？它会从 ${usage.value[t.id] ?? 0} 条内容上移除。`)) return; await deleteTag(t.id); await reload() }
async function merge(t: Tag) {
  const to = mergeTarget[t.id]; if (!to) return
  const target = tags.value.find((x) => x.id === to)
  if (!confirm(`把「${t.name}」合并进「${target?.name}」？「${t.name}」会被删除。`)) return
  try { await mergeTags(t.id, to); mergeTarget[t.id] = ''; await reload(); msg.value = '已合并。' } catch (e) { msg.value = e instanceof Error ? e.message : '合并失败' }
}
</script>

<template>
  <h1 style="font-size: 44px; line-height: 1.3">分类与标签</h1>
  <p v-if="msg" class="save-state" role="status" style="margin-top: 8px">{{ msg }}</p>

  <div class="admin-grid" style="margin-top: 32px">
    <section class="admin-main">
      <div class="rule-top sec-head"><h2 style="font-size: 24px">主题与二级分类</h2><button type="button" class="btn btn-sm" @click="newCat(null)">+ 新主题</button></div>
      <div v-for="t in site.topics" :key="t.id" style="padding: 14px 0; border-bottom: 1px solid var(--rule)">
        <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between">
          <b style="font-size: 22px">{{ t.name }}<span v-if="!t.is_active" class="badge badge-ink" style="margin-left: 8px">已隐藏</span></b>
          <span><button type="button" class="btn btn-sm btn-ghost" @click="editCat(t)">编辑</button><button type="button" class="btn btn-sm btn-ghost" @click="newCat(t.id)">+ 子分类</button><button type="button" class="btn btn-sm btn-ghost" @click="removeCat(t)">删除</button></span>
        </div>
        <div class="tag-line" style="margin-top: 8px">
          <button v-for="c in site.childrenOf(t.id)" :key="c.id" type="button" class="pill" style="min-height: 34px; font-size: 13px" :style="{ opacity: c.is_active ? 1 : .5 }" @click="editCat(c)">{{ c.name }}</button>
        </div>
      </div>
    </section>
    <aside class="admin-side">
      <form class="panel" @submit.prevent="submitCat">
        <h3>{{ catForm.id ? '编辑分类' : catForm.parent_id ? '新子分类' : '新主题' }}</h3>
        <div class="field"><label for="cn">名称</label><input id="cn" v-model="catForm.name" class="input" required></div>
        <div class="field" style="margin-top: 10px"><label for="cs">链接名</label><input id="cs" v-model="catForm.slug" class="input" placeholder="留空自动生成"></div>
        <div class="field" style="margin-top: 10px"><label for="cd">说明</label><textarea id="cd" v-model="catForm.description" class="textarea" style="min-height: 64px"></textarea></div>
        <div class="field" style="margin-top: 10px"><label for="co">排序（小的在前）</label><input id="co" v-model.number="catForm.sort_order" class="input" type="number"></div>
        <label class="chk" style="margin-top: 8px"><input v-model="catForm.is_active" type="checkbox">在前台显示</label>
        <div style="margin-top: 12px; display: flex; gap: 8px"><button class="btn btn-ink" type="submit">保存</button><button v-if="catForm.id || catForm.name" type="button" class="btn btn-ghost" @click="newCat(null)">清空</button></div>
      </form>
    </aside>
  </div>

  <section style="margin-top: 56px">
    <div class="rule-top sec-head"><h2 style="font-size: 24px">标签</h2></div>
    <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; align-items: flex-end">
      <div class="field" style="flex: 2 1 200px"><label for="tn">新标签</label><input id="tn" v-model="tagForm.name" class="input" @keydown.enter.prevent="addTag"></div>
      <div class="field" style="flex: 1 1 140px"><label for="tt">类型</label><select id="tt" v-model="tagForm.type" class="select"><option v-for="t in TAG_TYPES" :key="t">{{ t }}</option></select></div>
      <button type="button" class="btn btn-ink" @click="addTag">添加</button>
      <div class="field" style="flex: 1 1 160px; margin-left: auto"><label for="tf">筛选</label><input id="tf" v-model="tagFilter" class="input" placeholder="名称或类型"></div>
    </div>
    <div class="table-wrap" style="margin-top: 16px">
      <table class="tbl">
        <thead><tr><th>名称</th><th>类型</th><th>使用</th><th>合并到…</th><th></th></tr></thead>
        <tbody>
          <tr v-for="t in shownTags" :key="t.id">
            <td><input v-model="t.name" class="input" :aria-label="`标签名 ${t.name}`" style="min-width: 140px"></td>
            <td><select v-model="t.type" class="select" :aria-label="`${t.name} 类型`"><option v-for="x in TAG_TYPES" :key="x">{{ x }}</option></select></td>
            <td>{{ usage[t.id] ?? 0 }}</td>
            <td><select v-model="mergeTarget[t.id]" class="select" :aria-label="`把 ${t.name} 合并到`"><option value="">—</option><option v-for="o in tags.filter((x) => x.id !== t.id)" :key="o.id" :value="o.id">{{ o.name }}</option></select><button v-if="mergeTarget[t.id]" type="button" class="btn btn-sm" style="margin-left: 6px" @click="merge(t)">合并</button></td>
            <td style="white-space: nowrap"><button type="button" class="btn btn-sm" @click="updateTag(t)">保存</button> <button type="button" class="btn btn-sm btn-danger" @click="removeTag(t)">删除</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
