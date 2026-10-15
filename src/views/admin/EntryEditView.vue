<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, RouterLink } from 'vue-router'
import RichEditor from '@/components/editor/RichEditor.vue'
import ContentRenderer from '@/components/content/ContentRenderer'
import {
  getPayload, saveEntry, listVersions, getVersion, restoreVersion, fetchTags, fetchCollections, pickEntries, saveTag,
  ConflictError, PrivateAssetError, SlugTakenError, type MiniEntry
} from '@/services/api'
import { convertAssetsPublic, demoteUnusedAssets } from '@/services/assets'
import { useSite } from '@/stores/site'
import { classify, type Detection } from '@/lib/detect'
import { docToText } from '@/lib/doc'
import { diffLines } from '@/lib/diff'
import { slugify, randomSlug, debounce, fmtDate, safeUrl, scriptLang } from '@/lib/text'
import { LANGS, TYPE_LABEL, STATUS_LABEL, TSTATUS_LABEL, ALIAS_LABEL, SOURCE_LABEL, TAG_TYPES, langName } from '@/lib/taxonomy'
import { emptyDoc, type EntryPayload, type EntryType, type Tag, type CollectionRow, type VersionRow } from '@/lib/types'

const route = useRoute(); const router = useRouter(); const site = useSite()

const blank = (type: EntryType): EntryPayload => ({
  id: crypto.randomUUID(), slug: '', type, title: '', subtitle: null, summary: null, status: 'draft', translation_status: 'provisional',
  primary_category_id: null, cover_asset_id: null, personal_translation: null, translator_credit: null, copyright_note: null,
  material_date: null, needs_verify: false, remarks: null, content_json: emptyDoc(), languages: [], tag_ids: [], aliases: [],
  senses: [], sources: [], collection_ids: [], related: []
})

const isNew = ref(route.path.endsWith('/new'))
const form = reactive<EntryPayload>(blank(route.query.type === 'translation_note' ? 'translation_note' : 'corpus_card'))
const loading = ref(true)
const loadError = ref('')
const allTags = ref<Tag[]>([])
const allCollections = ref<CollectionRow[]>([])
const relatedMap = reactive<Record<string, MiniEntry>>({})
const msg = ref('')
const state = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const conflict = ref(false)
const savedOnce = ref(false)           // 数据库里是否已有这条记录
let baseline = ''
let expectedUpdatedAt: string | null = null

const isDirty = () => JSON.stringify(form) !== baseline
const dirty = ref(false)

// ------------------------------------------------------------------ 载入
async function load() {
  loading.value = true; loadError.value = ''
  try {
    await site.load()
    const [t, c] = await Promise.all([fetchTags(), fetchCollections()])
    allTags.value = t; allCollections.value = c
    if (!isNew.value) {
      const p = await getPayload(String(route.params.id))
      Object.assign(form, p)
      expectedUpdatedAt = p.updated_at ?? null
      savedOnce.value = true
      await loadRelatedTitles()
      auto.value = false
    } else {
      auto.value = true
    }
    baseline = JSON.stringify(form); dirty.value = false
    state.value = 'idle'
    document.title = `${form.title || '新建条目'} · 编辑`
  } catch (e) { loadError.value = e instanceof Error ? e.message : '加载失败' } finally { loading.value = false }
}
async function loadRelatedTitles() {
  const ids = form.related.map((r) => r.related_entry_id).filter((id) => !relatedMap[id])
  if (!ids.length) return
  const { supabase } = await import('@/lib/supabase')
  const { data } = await supabase.from('entries').select('id, slug, type, title, subtitle, personal_translation').in('id', ids)
  for (const r of (data ?? []) as MiniEntry[]) relatedMap[r.id] = r
}
onMounted(load)

// ------------------------------------------------------------------ 保存
const saveNow = async (opts: { version?: boolean; note?: string | null; forceOverwrite?: boolean } = {}): Promise<boolean> => {
  if (state.value === 'saving') return false
  msg.value = ''
  if (form.status === 'public' && !form.title.trim()) { state.value = 'error'; msg.value = '公开的内容需要有标题。'; return false }
  if (!form.slug.trim()) form.slug = slugify(form.title) || randomSlug()
  for (const s of form.sources) if (s.url && !safeUrl(s.url)) { state.value = 'error'; msg.value = `来源链接必须以 http:// 或 https:// 开头：${s.url}`; return false }

  const snap = JSON.stringify(form)
  const snapObj = JSON.parse(snap) as EntryPayload
  const wasPublic = savedPublic.value
  state.value = 'saving'
  const run = async (retry = 0): Promise<EntryPayload> => {
    try {
      return await saveEntry(snapObj, { expectedUpdatedAt: opts.forceOverwrite ? null : expectedUpdatedAt, makeVersion: opts.version, note: opts.note })
    } catch (e) {
      if (e instanceof SlugTakenError && retry < 2) { snapObj.slug = `${slugify(snapObj.title) || 'e'}-${randomSlug().slice(2, 6)}`; form.slug = snapObj.slug; return run(retry + 1) }
      if (e instanceof PrivateAssetError) {
        if (!confirm(`这条内容引用了 ${e.assetIds.length} 张私密图片。发布后它们会变成公开可访问。要把这些图片转为公开并继续发布吗？`)) throw e
        await convertAssetsPublic(e.assetIds)
        return run(retry + 1)
      }
      throw e
    }
  }
  try {
    const res = await run()
    form.id = res.id; form.slug = res.slug; form.updated_at = res.updated_at; form.published_at = res.published_at
    expectedUpdatedAt = res.updated_at ?? null
    baseline = JSON.stringify({ ...snapObj, id: res.id, slug: res.slug, updated_at: res.updated_at, published_at: res.published_at })
    dirty.value = isDirty()
    savedOnce.value = true; conflict.value = false
    state.value = 'saved'
    savedPublic.value = res.status === 'public'
    if (wasPublic && res.status !== 'public') {
      // 条目不再公开：把只被它使用的公开图片收回私有桶
      try { const n = await demoteUnusedAssets(res.id!); if (n) msg.value = `已将 ${n} 张图片改为私密。` } catch { /* 不阻塞保存 */ }
    }
    if (isNew.value) { isNew.value = false; void router.replace(`/admin/entries/${res.id}`) }
    if (opts.version) void refreshVersions()
    return true
  } catch (e) {
    state.value = 'error'
    if (e instanceof ConflictError) { conflict.value = true; msg.value = e.message }
    else msg.value = e instanceof Error ? e.message : '保存失败'
    return false
  }
}
const savedPublic = ref(false)
watch(loading, (v) => { if (!v) savedPublic.value = form.status === 'public' && savedOnce.value })

const autosave = debounce(() => { if (dirty.value && !conflict.value && hasContent()) void saveNow() }, 1500)
const hasContent = () => !!(form.title.trim() || form.subtitle || form.personal_translation || docToText(form.content_json).trim() || form.aliases.length || form.senses.length)
watch(form, () => {
  if (loading.value) return
  dirty.value = isDirty()
  if (dirty.value) { if (state.value !== 'saving') state.value = 'idle'; autosave() }
}, { deep: true })

async function publish() { form.status = 'public'; await saveNow({ version: true, note: '发布' }) }
async function saveVersion() { const note = window.prompt('给这个版本写一句说明（可留空）', ''); if (note === null) return; await saveNow({ version: true, note: note || null }) }

onBeforeRouteLeave(async () => {
  if (!dirty.value || conflict.value) return true
  autosave.cancel()
  if (hasContent() && (await saveNow())) return true
  return confirm('还有改动没有保存成功，确定离开吗？')
})
const beforeUnload = (e: BeforeUnloadEvent) => { if (dirty.value || state.value === 'saving') { e.preventDefault(); e.returnValue = '' } }
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => { window.removeEventListener('beforeunload', beforeUnload); autosave.cancel() })

async function reloadLatest() { autosave.cancel(); conflict.value = false; isNew.value = false; await load() }

// ------------------------------------------------------------------ 输入即识别分类
const auto = ref(true)
const manual = reactive(new Set<string>())
const det = ref<Detection | null>(null)
const bodyText = computed(() => docToText(form.content_json))
const detectInput = computed(() => ({
  text: [form.title, form.subtitle ?? '', bodyText.value.slice(0, 400)].join('\n').trim(),
  source: form.sources.map((s) => `${s.work_title ?? ''} ${s.title ?? ''}`).join(' ')
}))
const lookupTag = (name: string) => allTags.value.find((t) => t.name === name)

function applyDetection(d: Detection, force = false) {
  const can = (k: string) => force || !manual.has(k)
  if (can('type')) form.type = d.type
  if (can('category')) { const c = site.findByNames(d.topic, d.sub); if (c) form.primary_category_id = c.id }
  if (can('languages')) {
    const keep = form.languages.filter((l) => l.role === 'related')
    const next = [...keep]
    if (d.sourceLang) next.push({ language_code: d.sourceLang, role: 'source' })
    if (d.targetLang) next.push({ language_code: d.targetLang, role: 'target' })
    if (JSON.stringify(next) !== JSON.stringify(form.languages)) form.languages = next
  }
  if (can('tag') && d.dailyDetail) { const t = lookupTag(d.dailyDetail); if (t && !form.tag_ids.includes(t.id)) form.tag_ids.push(t.id) }
}
const recompute = debounce(() => {
  const { text, source } = detectInput.value
  det.value = text ? classify(text, source) : null
  if (auto.value && det.value) applyDetection(det.value)
}, 400)
watch(detectInput, () => { if (!loading.value) recompute() }, { deep: true })
watch(loading, (v) => { if (!v) recompute() })
const redo = () => { manual.clear(); auto.value = true; if (det.value) applyDetection(det.value, true) }
const detCategoryName = computed(() => (det.value ? `${det.value.topic} › ${det.value.sub}` : ''))
const touch = (k: string) => manual.add(k)

// ------------------------------------------------------------------ 语言 / 标签 / 专题
const hasLang = (code: string, role: 'source' | 'target') => form.languages.some((l) => l.language_code === code && l.role === role)
function toggleLang(code: string, role: 'source' | 'target') {
  touch('languages')
  const i = form.languages.findIndex((l) => l.language_code === code && l.role === role)
  if (i >= 0) form.languages.splice(i, 1); else form.languages.push({ language_code: code, role })
}
const tagFilter = ref('')
const tagOptions = computed(() => allTags.value.filter((t) => !form.tag_ids.includes(t.id) && (!tagFilter.value || t.name.toLowerCase().includes(tagFilter.value.toLowerCase()))).slice(0, 12))
const tagById = (id: string) => allTags.value.find((t) => t.id === id)
const newTagType = ref('其他')
async function createTag() {
  const name = tagFilter.value.trim(); if (!name) return
  const slug = (slugify(name) || 'tag') + '-' + randomSlug().slice(2, 6)
  try { await saveTag({ name, slug, type: newTagType.value }); allTags.value = await fetchTags(); const t = allTags.value.find((x) => x.slug === slug); if (t) form.tag_ids.push(t.id); tagFilter.value = '' }
  catch (e) { msg.value = e instanceof Error ? e.message : '创建标签失败' }
}
function toggleCollection(id: string) { const i = form.collection_ids.indexOf(id); if (i >= 0) form.collection_ids.splice(i, 1); else form.collection_ids.push(id) }

// 相关条目
const relQ = ref(''); const relResults = ref<MiniEntry[]>([])
const searchRel = debounce(async () => { relResults.value = (await pickEntries(relQ.value)).filter((r) => r.id !== form.id && !form.related.some((x) => x.related_entry_id === r.id)) }, 300)
function addRelated(r: MiniEntry) { relatedMap[r.id] = r; form.related.push({ related_entry_id: r.id, relation_type: 'related' }); relResults.value = []; relQ.value = '' }

// 重复检测：同标题 / 同别名提醒
const dup = ref<MiniEntry[]>([])
const checkDup = debounce(async () => {
  const t = form.title.trim()
  dup.value = t.length >= 1 ? (await pickEntries(t)).filter((r) => r.id !== form.id && r.title.trim().toLowerCase() === t.toLowerCase()) : []
}, 600)
watch(() => form.title, () => { if (!loading.value) checkDup() })

// ------------------------------------------------------------------ 重复行编辑
const addAlias = () => form.aliases.push({ text: '', language_code: null, alias_type: 'romanization' })
const addSense = () => form.senses.push({ meaning: '', context: null, register: null, personal_translation: null })
const addSource = () => form.sources.push({ title: null, creator: null, work_title: null, url: null, source_type: 'work', platform: null, note: null })
const nz = (v: string) => (v.trim() === '' ? null : v)

// ------------------------------------------------------------------ 版本
const versions = ref<Omit<VersionRow, 'snapshot_json'>[]>([])
const diff = ref<{ no: number; fields: { label: string; before: string; after: string }[]; body: ReturnType<typeof diffLines> } | null>(null)
async function refreshVersions() { if (savedOnce.value && form.id) { try { versions.value = await listVersions(form.id) } catch { /* 忽略 */ } } }
watch(savedOnce, (v) => { if (v) void refreshVersions() })
async function showDiff(no: number) {
  const v = await getVersion(form.id!, no); const o = v.snapshot_json
  const f = (label: string, a: string | null | undefined, b: string | null | undefined) => ({ label, before: a ?? '', after: b ?? '' })
  diff.value = {
    no,
    fields: [f('标题', o.title, form.title), f('副标题', o.subtitle, form.subtitle), f('个人译法', o.personal_translation, form.personal_translation), f('摘要', o.summary, form.summary)]
      .filter((x) => x.before !== x.after),
    body: diffLines(docToText(o.content_json), bodyText.value)
  }
}
async function restore(no: number) {
  if (!confirm(`恢复到版本 ${no}？当前内容会先被覆盖，但恢复动作本身会记成一个新版本，之后还能再恢复回来。`)) return
  try {
    autosave.cancel()
    if (dirty.value) await saveNow({ version: true, note: `恢复前自动存档` })
    await restoreVersion(form.id!, no); diff.value = null; await reloadLatest(); await refreshVersions()
  } catch (e) { msg.value = e instanceof Error ? e.message : '恢复失败' }
}

// ------------------------------------------------------------------ 预览
const preview = ref<'off' | 'desktop' | 'mobile'>('off')
const rom = ['i', 'ii', 'iii', 'iv', 'v', 'vi']
const stateText = computed(() => ({ idle: dirty.value ? '有未保存的改动' : savedOnce.value ? '已保存' : '尚未保存', saving: '保存中…', saved: '已保存', error: '保存失败' }[state.value]))
</script>

<template>
  <p v-if="loadError" class="err" role="alert">{{ loadError }} <RouterLink to="/admin/entries" class="bold">返回列表</RouterLink></p>
  <p v-else-if="loading" class="empty" role="status">加载中…</p>

  <template v-else>
    <!-- 顶栏：保存状态与动作 -->
    <div class="editor-bar">
      <span class="save-state" :class="{ bad: state === 'error' }" role="status" aria-live="polite">{{ stateText }}</span>
      <span v-if="msg" class="save-state bad" role="alert">{{ msg }}</span>
      <span style="flex: 1"></span>
      <button type="button" class="btn btn-sm" :disabled="state === 'saving'" @click="saveNow()">保存</button>
      <button type="button" class="btn btn-sm" :disabled="state === 'saving'" @click="saveVersion">保存为版本</button>
      <button v-if="form.status !== 'public'" type="button" class="btn btn-sm btn-accent" :disabled="state === 'saving'" @click="publish">发布</button>
      <RouterLink v-if="savedOnce" :to="`/entries/${form.slug}`" class="btn btn-sm btn-ghost" target="_blank">前台查看</RouterLink>
    </div>

    <div v-if="conflict" class="banner" role="alert" style="margin-top: 16px">
      这条内容在别处被修改过，自动保存已暂停，以免覆盖对方的改动。
      <button type="button" class="linkbtn" @click="reloadLatest">载入最新版本（放弃我的改动）</button>
      <button type="button" class="linkbtn" style="margin-left: 12px" @click="saveNow({ forceOverwrite: true })">用我的版本覆盖</button>
    </div>

    <div class="admin-grid" style="margin-top: 28px">
      <!-- ===== 主编辑区 ===== -->
      <div class="admin-main" style="display: flex; flex-direction: column; gap: 26px">
        <!-- 输入即识别 -->
        <section class="panel" aria-label="自动识别分类">
          <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px">
            <h3 style="margin: 0">输入即识别</h3>
            <label class="chk" style="min-height: 32px"><input v-model="auto" type="checkbox">自动应用识别结果</label>
          </div>
          <template v-if="det">
            <p class="sans" style="font-size: 14px; line-height: 1.9">
              <b>{{ TYPE_LABEL[det.type] }}</b> · {{ detCategoryName }}<template v-if="det.dailyDetail"> · {{ det.dailyDetail }}</template>
              <span class="accent bold"> · 置信度 {{ det.confidence }}</span>
            </p>
            <p class="hint">{{ det.basis }} {{ det.langNote }}</p>
            <button type="button" class="btn btn-sm" style="margin-top: 10px" @click="redo">按识别结果重新套用</button>
          </template>
          <p v-else class="hint">在标题或正文里输入内容，这里会即时给出语言、类型和分类建议。你手动改过的项目，不会再被覆盖。</p>
        </section>

        <div class="field">
          <label for="title">标题 / 原词 / 原句</label>
          <input id="title" v-model="form.title" class="input big" :lang="scriptLang(form.title)" placeholder="例如原文的词、句，或札记的题目" autocomplete="off">
          <p v-if="dup.length" class="hint" style="color: var(--accent)" role="status">已有同名条目：<RouterLink v-for="d in dup" :key="d.id" :to="`/admin/entries/${d.id}`" class="bold" style="text-decoration: underline">{{ d.title }}</RouterLink>。确认不是重复再继续。</p>
        </div>
        <div class="field"><label for="sub">副标题（可选：原题、别称）</label><input id="sub" v-model="form.subtitle" class="input" :lang="scriptLang(form.subtitle)" @input="form.subtitle = nz(($event.target as HTMLInputElement).value)"></div>
        <div class="field">
          <label for="pt">{{ form.type === 'corpus_card' ? '个人译法' : '最终译法' }}</label>
          <input id="pt" v-model="form.personal_translation" class="input" style="font-size: 20px" @input="form.personal_translation = nz(($event.target as HTMLInputElement).value)">
          <p class="hint">只写你的译法；词典释义与语境说明放在下面的「义项」和正文里。</p>
        </div>
        <div class="field"><label for="sm">摘要（首页与搜索结果里显示）</label><textarea id="sm" v-model="form.summary" class="textarea" style="min-height: 72px" @input="form.summary = nz(($event.target as HTMLTextAreaElement).value)"></textarea></div>

        <!-- 别名 / 转写 -->
        <section>
          <div class="sec-head rule-top"><h2 style="font-size: 20px; letter-spacing: .1em">别名与转写</h2><button type="button" class="btn btn-sm" @click="addAlias">+ 添加</button></div>
          <p class="hint" style="margin-top: 6px">罗马转写、常见拼写、其他译名。系统不会自动推导，请自己补充；搜索会命中这里的内容。</p>
          <div v-for="(a, i) in form.aliases" :key="i" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; align-items: center">
            <input v-model="a.text" class="input" style="flex: 2 1 200px" :aria-label="`别名 ${i + 1}`" placeholder="Khun Nu">
            <select v-model="a.alias_type" class="select" style="flex: 1 1 120px" :aria-label="`别名 ${i + 1} 类型`"><option v-for="(l, k) in ALIAS_LABEL" :key="k" :value="k">{{ l }}</option></select>
            <button type="button" class="btn btn-sm btn-ghost" @click="form.aliases.splice(i, 1)">删除</button>
          </div>
        </section>

        <!-- 义项 -->
        <section>
          <div class="sec-head rule-top"><h2 style="font-size: 20px; letter-spacing: .1em">常见释义与语境</h2><button type="button" class="btn btn-sm" @click="addSense">+ 添加义项</button></div>
          <div v-for="(s, i) in form.senses" :key="i" class="panel" style="margin-top: 12px">
            <div style="display: flex; justify-content: space-between; align-items: center"><span class="lat" style="font-size: 18px">{{ rom[i] ?? i + 1 }}.</span><button type="button" class="btn btn-sm btn-ghost" @click="form.senses.splice(i, 1)">删除</button></div>
            <div class="field" style="margin-top: 6px"><label :for="`sn${i}`">释义</label><textarea :id="`sn${i}`" v-model="s.meaning" class="textarea" style="min-height: 64px"></textarea></div>
            <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px">
              <div class="field" style="flex: 1 1 180px"><label :for="`sc${i}`">语境</label><input :id="`sc${i}`" v-model="s.context" class="input" @input="s.context = nz(($event.target as HTMLInputElement).value)"></div>
              <div class="field" style="flex: 1 1 140px"><label :for="`sr${i}`">语气 / 语域</label><input :id="`sr${i}`" v-model="s.register" class="input" @input="s.register = nz(($event.target as HTMLInputElement).value)"></div>
              <div class="field" style="flex: 1 1 140px"><label :for="`sp${i}`">此义项的译法</label><input :id="`sp${i}`" v-model="s.personal_translation" class="input" @input="s.personal_translation = nz(($event.target as HTMLInputElement).value)"></div>
            </div>
          </div>
        </section>

        <!-- 正文 -->
        <section>
          <div class="sec-head rule-top"><h2 style="font-size: 20px; letter-spacing: .1em">正文</h2>
            <div class="sans" style="display: flex; gap: 8px">
              <button type="button" class="btn btn-sm" :class="{ 'btn-ink': preview === 'desktop' }" @click="preview = preview === 'desktop' ? 'off' : 'desktop'">桌面预览</button>
              <button type="button" class="btn btn-sm" :class="{ 'btn-ink': preview === 'mobile' }" @click="preview = preview === 'mobile' ? 'off' : 'mobile'">手机预览</button>
            </div>
          </div>
          <div style="margin-top: 12px"><RichEditor v-model="form.content_json" :public-context="form.status === 'public'" /></div>
          <div v-if="preview !== 'off'" class="preview-frame" :style="{ maxWidth: preview === 'mobile' ? '390px' : '100%', marginTop: '16px' }" aria-label="预览">
            <p class="lab">预览 · {{ preview === 'mobile' ? '手机' : '桌面' }}</p>
            <h2 :lang="scriptLang(form.title)" style="font-size: 36px; line-height: 1.3; margin-top: 8px; overflow-wrap: anywhere">{{ form.title || '（无标题）' }}</h2>
            <p v-if="form.personal_translation" style="margin-top: 6px; font-size: 20px; color: var(--accent); font-weight: 700">{{ form.personal_translation }}</p>
            <div style="margin-top: 14px"><ContentRenderer :doc="form.content_json" /></div>
          </div>
        </section>

        <!-- 来源 -->
        <section>
          <div class="sec-head rule-top"><h2 style="font-size: 20px; letter-spacing: .1em">来源</h2><button type="button" class="btn btn-sm" @click="addSource">+ 添加来源</button></div>
          <p class="hint" style="margin-top: 6px">视频只记录外部链接，不会上传或托管视频文件。</p>
          <div v-for="(s, i) in form.sources" :key="i" class="panel" style="margin-top: 12px">
            <div style="display: flex; flex-wrap: wrap; gap: 10px">
              <div class="field" style="flex: 1 1 130px"><label :for="`st${i}`">类型</label><select :id="`st${i}`" v-model="s.source_type" class="select"><option v-for="(l, k) in SOURCE_LABEL" :key="k" :value="k">{{ l }}</option></select></div>
              <div class="field" style="flex: 2 1 200px"><label :for="`sw${i}`">作品名</label><input :id="`sw${i}`" v-model="s.work_title" class="input" @input="s.work_title = nz(($event.target as HTMLInputElement).value)"></div>
              <div class="field" style="flex: 2 1 200px"><label :for="`sti${i}`">标题 / 集数 / 章节</label><input :id="`sti${i}`" v-model="s.title" class="input" @input="s.title = nz(($event.target as HTMLInputElement).value)"></div>
              <div class="field" style="flex: 1 1 160px"><label :for="`sc2${i}`">创作者</label><input :id="`sc2${i}`" v-model="s.creator" class="input" @input="s.creator = nz(($event.target as HTMLInputElement).value)"></div>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px">
              <div class="field" style="flex: 3 1 260px"><label :for="`su${i}`">链接</label><input :id="`su${i}`" v-model="s.url" class="input" type="url" placeholder="https://" @input="s.url = nz(($event.target as HTMLInputElement).value)"></div>
              <div class="field" style="flex: 1 1 140px"><label :for="`sp2${i}`">平台</label><input :id="`sp2${i}`" v-model="s.platform" class="input" @input="s.platform = nz(($event.target as HTMLInputElement).value)"></div>
              <div class="field" style="flex: 2 1 200px"><label :for="`sn2${i}`">备注（如时间点）</label><input :id="`sn2${i}`" v-model="s.note" class="input" @input="s.note = nz(($event.target as HTMLInputElement).value)"></div>
              <button type="button" class="btn btn-sm btn-ghost" style="align-self: flex-end" @click="form.sources.splice(i, 1)">删除</button>
            </div>
          </div>
        </section>

        <!-- 版本 -->
        <section v-if="savedOnce">
          <div class="rule-top"><h2 style="font-size: 20px; letter-spacing: .1em">版本历史</h2></div>
          <p class="hint" style="margin-top: 6px">自动保存不产生版本；点「保存为版本」或「发布」才会存一份快照。</p>
          <ul v-if="versions.length" class="row-list" style="margin-top: 10px">
            <li v-for="v in versions" :key="v.id" style="display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center">
              <span class="lat" style="font-size: 18px; min-width: 40px">v{{ v.version_no }}</span>
              <span class="sans" style="font-size: 13px; flex: 1 1 200px">{{ fmtDate(v.created_at) }} · {{ v.change_note || '无说明' }}</span>
              <button type="button" class="btn btn-sm" @click="showDiff(v.version_no)">与当前比较</button>
              <button type="button" class="btn btn-sm btn-danger" @click="restore(v.version_no)">恢复</button>
            </li>
          </ul>
          <p v-else class="empty" style="padding: 16px 0">还没有版本。</p>
          <div v-if="diff" class="panel" style="margin-top: 14px">
            <div style="display: flex; justify-content: space-between"><h3>版本 {{ diff.no }} → 当前</h3><button type="button" class="btn btn-sm btn-ghost" @click="diff = null">关闭</button></div>
            <p v-for="f in diff.fields" :key="f.label" class="sans" style="font-size: 13px"><b>{{ f.label }}</b>：<span class="diff-del">{{ f.before || '（空）' }}</span> → <span class="diff-add">{{ f.after || '（空）' }}</span></p>
            <div style="margin-top: 8px; max-height: 320px; overflow: auto; border-top: 1px solid var(--rule); padding-top: 8px">
              <div v-for="(l, i) in diff.body" :key="i" class="diff-line" :class="{ 'diff-add': l.kind === 'add', 'diff-del': l.kind === 'del' }">{{ l.kind === 'add' ? '+ ' : l.kind === 'del' ? '− ' : '  ' }}{{ l.text }}</div>
            </div>
          </div>
        </section>
      </div>

      <!-- ===== 侧栏 ===== -->
      <aside class="admin-side">
        <section class="panel">
          <h3>发布</h3>
          <div class="field"><label for="stt">可见性</label>
            <select id="stt" v-model="form.status" class="select"><option v-for="(l, k) in STATUS_LABEL" :key="k" :value="k">{{ l }}</option></select>
            <p class="hint">草稿与私密：只有你能看到，也搜不到。</p></div>
          <div class="field" style="margin-top: 12px"><label for="tst">译文状态</label>
            <select id="tst" v-model="form.translation_status" class="select"><option v-for="(l, k) in TSTATUS_LABEL" :key="k" :value="k">{{ l }}</option></select></div>
          <label class="chk" style="margin-top: 8px"><input v-model="form.needs_verify" type="checkbox">标记为待核实</label>
        </section>

        <section class="panel">
          <h3>类型与分类</h3>
          <div class="field"><label for="typ">内容类型</label>
            <select id="typ" v-model="form.type" class="select" @change="touch('type')"><option v-for="(l, k) in TYPE_LABEL" :key="k" :value="k">{{ l }}</option></select>
            <p class="hint">两种类型的字段互通，切换不会丢内容。</p></div>
          <div class="field" style="margin-top: 12px"><label for="cat">主题</label>
            <select id="cat" v-model="form.primary_category_id" class="select" @change="touch('category')">
              <option :value="null">（未分类）</option>
              <optgroup v-for="t in site.topics" :key="t.id" :label="t.name"><option :value="t.id">{{ t.name }}（整体）</option><option v-for="c in site.childrenOf(t.id)" :key="c.id" :value="c.id">{{ t.name }} › {{ c.name }}</option></optgroup>
            </select></div>
        </section>

        <section class="panel">
          <h3>语言</h3>
          <div class="lab" style="margin-bottom: 4px">原文</div>
          <div class="tag-line"><label v-for="l in LANGS" :key="'s' + l.code" class="chk" style="min-height: 32px"><input type="checkbox" :checked="hasLang(l.code, 'source')" @change="toggleLang(l.code, 'source')">{{ l.name }}</label></div>
          <div class="lab" style="margin: 10px 0 4px">译文</div>
          <div class="tag-line"><label v-for="l in LANGS" :key="'t' + l.code" class="chk" style="min-height: 32px"><input type="checkbox" :checked="hasLang(l.code, 'target')" @change="toggleLang(l.code, 'target')">{{ l.name }}</label></div>
        </section>

        <section class="panel">
          <h3>标签</h3>
          <div class="tag-line"><button v-for="id in form.tag_ids" :key="id" type="button" class="chip" :aria-label="`移除标签 ${tagById(id)?.name}`" style="background: none; cursor: pointer" @click="touch('tag'); form.tag_ids.splice(form.tag_ids.indexOf(id), 1)">{{ tagById(id)?.name ?? id }} ×</button></div>
          <div class="field" style="margin-top: 10px"><label for="tg">添加或新建</label><input id="tg" v-model="tagFilter" class="input" placeholder="输入标签名" @keydown.enter.prevent="createTag"></div>
          <div class="tag-line" style="margin-top: 8px"><button v-for="t in tagOptions" :key="t.id" type="button" class="chip chip-soft" style="background: none; cursor: pointer" @click="touch('tag'); form.tag_ids.push(t.id)">+ {{ t.name }}</button></div>
          <div v-if="tagFilter.trim() && !allTags.some((t) => t.name === tagFilter.trim())" style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap">
            <select v-model="newTagType" class="select" style="flex: 1 1 100px" aria-label="新标签类型"><option v-for="t in TAG_TYPES" :key="t">{{ t }}</option></select>
            <button type="button" class="btn btn-sm" @click="createTag">新建「{{ tagFilter.trim() }}」</button>
          </div>
        </section>

        <section class="panel">
          <h3>专题</h3>
          <label v-for="c in allCollections" :key="c.id" class="chk"><input type="checkbox" :checked="form.collection_ids.includes(c.id)" @change="toggleCollection(c.id)">{{ c.title }}</label>
          <p v-if="!allCollections.length" class="hint">还没有专题，去「专题」里建一个。</p>
        </section>

        <section class="panel">
          <h3>相关条目</h3>
          <ul style="list-style: none"><li v-for="(r, i) in form.related" :key="r.related_entry_id" style="display: flex; justify-content: space-between; gap: 8px; align-items: center; font: 14px var(--sans)">
            <span :lang="scriptLang(relatedMap[r.related_entry_id]?.title)">{{ relatedMap[r.related_entry_id]?.title ?? r.related_entry_id }}</span>
            <button type="button" class="btn btn-sm btn-ghost" @click="form.related.splice(i, 1)">移除</button></li></ul>
          <div class="field" style="margin-top: 8px"><label for="rl">搜索条目</label><input id="rl" v-model="relQ" class="input" placeholder="标题或别名" @input="searchRel"></div>
          <ul style="list-style: none; margin-top: 4px"><li v-for="r in relResults" :key="r.id"><button type="button" class="btn btn-sm btn-ghost" style="width: 100%; justify-content: flex-start" @click="addRelated(r)">+ {{ r.title }}</button></li></ul>
        </section>

        <section class="panel">
          <h3>其他信息</h3>
          <div class="field"><label for="sl">链接名（网址里的名字）</label><input id="sl" v-model="form.slug" class="input" placeholder="留空则自动生成"><p class="hint">改了之后，旧链接会自动跳转到新链接。</p></div>
          <div class="field" style="margin-top: 12px"><label for="tc">译者署名（留空用站点默认）</label><input id="tc" v-model="form.translator_credit" class="input" @input="form.translator_credit = nz(($event.target as HTMLInputElement).value)"></div>
          <div class="field" style="margin-top: 12px"><label for="md">资料日期</label><input id="md" v-model="form.material_date" class="input" type="date" @input="form.material_date = nz(($event.target as HTMLInputElement).value)"></div>
          <div class="field" style="margin-top: 12px"><label for="cp">版权说明</label><textarea id="cp" v-model="form.copyright_note" class="textarea" style="min-height: 72px" @input="form.copyright_note = nz(($event.target as HTMLTextAreaElement).value)"></textarea><p class="hint">公开页面会显示。长篇歌词、台词、小说原文是否公开，请自行判断。</p></div>
          <div class="field" style="margin-top: 12px"><label for="rm">私人备注</label><textarea id="rm" v-model="form.remarks" class="textarea" style="min-height: 72px" @input="form.remarks = nz(($event.target as HTMLTextAreaElement).value)"></textarea><p class="hint">只有你能看到，不会出现在前台或搜索里。</p></div>
        </section>
      </aside>
    </div>
  </template>
</template>
