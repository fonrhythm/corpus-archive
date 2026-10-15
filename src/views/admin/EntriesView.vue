<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { listAdminEntries, setDeleted, purgeEntry, addTagToEntries, fetchTags, type AdminRow } from '@/services/api'
import { useSite } from '@/stores/site'
import Pager from '@/components/ui/Pager.vue'
import { TYPE_LABEL, STATUS_LABEL, TSTATUS_LABEL } from '@/lib/taxonomy'
import { fmtDate, debounce } from '@/lib/text'
import type { EntryStatus, EntryType, Tag } from '@/lib/types'

const route = useRoute(); const router = useRouter(); const site = useSite()
const q = ref(String(route.query.q ?? ''))
const status = ref((route.query.status as EntryStatus) || '')
const type = ref((route.query.type as EntryType) || '')
const category = ref(String(route.query.category ?? ''))
const trash = ref(route.query.trash === '1')
const page = ref(Number(route.query.page ?? 1) || 1)
const rows = ref<AdminRow[]>([]); const total = ref(0); const loading = ref(false); const error = ref('')
const PAGE = 30
const picked = ref<string[]>([])
const tags = ref<Tag[]>([])
const bulkTag = ref('')
const allOnPage = () => rows.value.length > 0 && rows.value.every((r) => picked.value.includes(r.id))
function toggleAll() { picked.value = allOnPage() ? [] : rows.value.map((r) => r.id) }
async function bulkAddTag() {
  if (!bulkTag.value || !picked.value.length) return
  try { await addTagToEntries(bulkTag.value, picked.value); msg.value = `已给 ${picked.value.length} 条内容加上标签。`; picked.value = []; bulkTag.value = '' }
  catch (e) { error.value = e instanceof Error ? e.message : '操作失败' }
}
async function bulkTrash() {
  if (!picked.value.length || !confirm(`把选中的 ${picked.value.length} 条内容移到回收站？`)) return
  try { for (const id of picked.value) await setDeleted(id, true); picked.value = []; await run() } catch (e) { error.value = e instanceof Error ? e.message : '操作失败' }
}
const msg = ref('')

async function run() {
  loading.value = true; error.value = ''
  try {
    const r = await listAdminEntries({ q: q.value, status: status.value, type: type.value, category: category.value, trash: trash.value, page: page.value, pageSize: PAGE })
    rows.value = r.rows; total.value = r.total; picked.value = []
  } catch (e) { error.value = e instanceof Error ? e.message : '加载失败' } finally { loading.value = false }
}
function sync() {
  const query: Record<string, string> = {}
  if (q.value) query.q = q.value
  if (status.value) query.status = status.value
  if (type.value) query.type = type.value
  if (category.value) query.category = category.value
  if (trash.value) query.trash = '1'
  if (page.value > 1) query.page = String(page.value)
  void router.replace({ query })
}
const live = debounce(() => { page.value = 1; sync(); void run() }, 350)
watch([status, type, category, trash], () => { page.value = 1; sync(); void run() })
onMounted(async () => { await site.load(); tags.value = await fetchTags(); await run() })

async function del(r: AdminRow) { if (!confirm(`把「${r.title || '无标题'}」移到回收站？`)) return; await setDeleted(r.id, true); await run() }
async function restore(r: AdminRow) { await setDeleted(r.id, false); await run() }
async function purge(r: AdminRow) {
  if (!confirm(`永久删除「${r.title || '无标题'}」？这会同时删除它的版本历史，无法恢复。`)) return
  try { await purgeEntry(r.id); await run() } catch (e) { error.value = e instanceof Error ? e.message : '删除失败' }
}
</script>

<template>
  <div class="sec-head"><h1 style="font-size: 44px; line-height: 1.3">{{ trash ? '回收站' : '内容' }}</h1><RouterLink to="/admin/entries/new" class="btn btn-ink">新建条目</RouterLink></div>

  <div style="margin-top: 24px; display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end">
    <div class="field" style="flex: 2 1 240px"><label for="fq">按标题搜索</label><input id="fq" v-model="q" class="input" type="search" placeholder="标题" @input="live"></div>
    <div class="field" style="flex: 1 1 140px"><label for="fs">状态</label>
      <select id="fs" v-model="status" class="select"><option value="">全部</option><option v-for="(l, k) in STATUS_LABEL" :key="k" :value="k">{{ l }}</option></select></div>
    <div class="field" style="flex: 1 1 140px"><label for="ft">类型</label>
      <select id="ft" v-model="type" class="select"><option value="">全部</option><option v-for="(l, k) in TYPE_LABEL" :key="k" :value="k">{{ l }}</option></select></div>
    <div class="field" style="flex: 1 1 160px"><label for="fc">主题</label>
      <select id="fc" v-model="category" class="select"><option value="">全部</option>
        <optgroup v-for="t in site.topics" :key="t.id" :label="t.name"><option :value="t.id">{{ t.name }}（整体）</option><option v-for="c in site.childrenOf(t.id)" :key="c.id" :value="c.id">{{ c.name }}</option></optgroup></select></div>
    <label class="chk" style="min-height: 44px"><input v-model="trash" type="checkbox">回收站</label>
  </div>

  <p v-if="error" class="err" role="alert" style="margin-top: 16px">{{ error }}</p>
  <p v-if="msg" class="save-state" role="status" style="margin-top: 12px">{{ msg }}</p>
  <div v-if="picked.length && !trash" class="panel" style="margin-top: 16px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center" role="region" aria-label="批量操作">
    <b class="sans" style="font-size: 13px">已选 {{ picked.length }} 条</b>
    <select v-model="bulkTag" class="select" style="width: auto; min-width: 160px" aria-label="选择要添加的标签"><option value="">加标签…</option><option v-for="t in tags" :key="t.id" :value="t.id">{{ t.name }}</option></select>
    <button type="button" class="btn btn-sm" :disabled="!bulkTag" @click="bulkAddTag">应用</button>
    <button type="button" class="btn btn-sm btn-danger" @click="bulkTrash">移到回收站</button>
    <button type="button" class="btn btn-sm btn-ghost" @click="picked = []">取消选择</button>
  </div>
  <div class="table-wrap" style="margin-top: 20px">
    <table class="tbl">
      <thead><tr><th style="width: 36px"><input type="checkbox" aria-label="选择本页全部" :checked="allOnPage()" @change="toggleAll"></th><th>标题</th><th>类型</th><th>主题</th><th>状态</th><th>译文</th><th>更新</th><th></th></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td><input v-model="picked" type="checkbox" :value="r.id" :aria-label="`选择 ${r.title || '无标题'}`"></td>
          <td style="min-width: 200px"><RouterLink :to="`/admin/entries/${r.id}`" style="font-size: 16px; font-weight: 500; overflow-wrap: anywhere">{{ r.title || '（无标题）' }}</RouterLink><span v-if="r.needs_verify" class="badge" style="margin-left: 8px">待核实</span></td>
          <td>{{ TYPE_LABEL[r.type] }}</td>
          <td>{{ site.pathOf(r.primary_category_id).map((c) => c.name).join(' · ') || '—' }}</td>
          <td>{{ STATUS_LABEL[r.status] }}</td><td>{{ TSTATUS_LABEL[r.translation_status] }}</td><td style="white-space: nowrap">{{ fmtDate(r.updated_at) }}</td>
          <td style="white-space: nowrap; text-align: right">
            <template v-if="!trash"><RouterLink v-if="r.status === 'public'" :to="`/entries/${r.slug}`" class="btn btn-sm btn-ghost">查看</RouterLink><button type="button" class="btn btn-sm btn-ghost" @click="del(r)">删除</button></template>
            <template v-else><button type="button" class="btn btn-sm" @click="restore(r)">恢复</button> <button type="button" class="btn btn-sm btn-danger" @click="purge(r)">永久删除</button></template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <p v-if="!loading && !rows.length" class="empty">{{ trash ? '回收站是空的。' : '没有符合条件的内容。' }}</p>
  <Pager :page="page" :page-size="PAGE" :total="total" @go="(p) => { page = p; sync(); run() }" />
</template>
