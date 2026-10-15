import { supabase } from '@/lib/supabase'
import { nfcDeep } from '@/lib/text'
import type {
  Category, Tag, EntryRow, EntryPayload, CollectionRow, VersionRow, EntryType, EntryStatus, TranslationStatus,
  Alias, Sense, SourceRef, LangRole
} from '@/lib/types'

export class ConflictError extends Error { constructor() { super('这条内容已在别处被修改。请刷新后再编辑。') } }
export class PrivateAssetError extends Error { constructor(public assetIds: string[]) { super('公开条目引用了私密图片。') } }
export class SlugTakenError extends Error { constructor() { super('这个链接名已被使用，请换一个。') } }

function wrap(e: { message: string; details?: string | null; code?: string } | null): never {
  if (!e) throw new Error('未知错误')
  if (e.message === 'conflict') throw new ConflictError()
  if (e.message === 'private_asset_in_public_entry') throw new PrivateAssetError((e.details ?? '').split(',').filter(Boolean))
  if (e.code === '23505' && /slug/.test(e.message)) throw new SlugTakenError()
  throw new Error(e.message)
}

// ------------------------------------------------------------------ 站点
export async function fetchSettings(): Promise<Record<string, string>> {
  const { data } = await supabase.from('site_settings').select('key, value')
  return Object.fromEntries((data ?? []).map((r) => [r.key as string, r.value as string]))
}
export async function saveSetting(key: string, value: string) {
  const { error } = await supabase.from('site_settings').upsert({ key, value: value.normalize('NFC'), updated_at: new Date().toISOString() })
  if (error) wrap(error)
}
export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('*').order('sort_order').order('name')
  if (error) wrap(error)
  return (data ?? []) as Category[]
}
export async function fetchTags(): Promise<Tag[]> {
  const { data, error } = await supabase.from('tags').select('*').order('type').order('name')
  if (error) wrap(error)
  return (data ?? []) as Tag[]
}

// ------------------------------------------------------------------ 搜索 / 列表
export interface SearchParams {
  q?: string; category?: string | null; lang?: string | null; type?: EntryType | null
  tag?: string | null; collection?: string | null; sort?: 'relevance' | 'updated'
  page?: number; pageSize?: number
}
export async function searchEntries(p: SearchParams): Promise<{ rows: EntryRow[]; total: number }> {
  const pageSize = p.pageSize ?? 20
  const { data, error } = await supabase.rpc('search_entries', {
    p_q: p.q?.trim() || null, p_category: p.category || null, p_lang: p.lang || null, p_type: p.type || null,
    p_tag: p.tag || null, p_collection: p.collection || null, p_sort: p.sort ?? 'relevance',
    p_limit: pageSize, p_offset: ((p.page ?? 1) - 1) * pageSize
  })
  if (error) wrap(error)
  const rows = (data ?? []) as EntryRow[]
  return { rows, total: Number(rows[0]?.total_count ?? 0) }
}

// ------------------------------------------------------------------ 详情
export interface EntryDetail {
  id: string; slug: string; type: EntryType; title: string; subtitle: string | null; summary: string | null
  status: EntryStatus; translation_status: TranslationStatus; primary_category_id: string | null
  cover_asset_id: string | null; personal_translation: string | null; translator_credit: string | null
  copyright_note: string | null; material_date: string | null; needs_verify: boolean
  content_json: import('@/lib/types').DocNode
  created_at: string; updated_at: string; published_at: string | null
  entry_languages: { language_code: string; role: LangRole }[]
  aliases: Alias[]
  senses: (Sense & { sort_order: number })[]
  sources: (SourceRef & { sort_order: number })[]
  tags: { tag: Tag | null }[]
  collections: { collection: { id: string; slug: string; title: string; status: EntryStatus } | null }[]
}
const DETAIL_SELECT = `*,
  entry_languages(language_code, role),
  aliases:entry_aliases(text, language_code, alias_type),
  senses:entry_senses(meaning, context, register, personal_translation, sort_order),
  sources(title, creator, work_title, url, source_type, platform, note, sort_order),
  tags:entry_tags(tag:tags(id, name, slug, type)),
  collections:collection_entries(collection:collections(id, slug, title, status))`

export async function fetchEntryBySlug(slug: string): Promise<{ entry: EntryDetail | null; redirectTo?: string }> {
  const sel = async (col: 'slug' | 'id', v: string) => {
    const { data, error } = await supabase.from('entries').select(DETAIL_SELECT).eq(col, v).is('deleted_at', null).maybeSingle()
    if (error) wrap(error)
    return data as unknown as EntryDetail | null
  }
  const hit = await sel('slug', slug)
  if (hit) return { entry: hit }
  // 旧链接兼容：改过 slug 的条目，旧地址跳转到新地址
  const { data: h } = await supabase.from('entry_slug_history').select('entry_id').eq('slug', slug).maybeSingle()
  if (h) { const e = await sel('id', h.entry_id as string); if (e) return { entry: e, redirectTo: e.slug } }
  return { entry: null }
}

export interface MiniEntry { id: string; slug: string; type: EntryType; title: string; personal_translation: string | null; subtitle: string | null }
export async function fetchRelated(entryId: string): Promise<MiniEntry[]> {
  const { data } = await supabase.from('entry_relations').select('entry_id, related_entry_id')
    .or(`entry_id.eq.${entryId},related_entry_id.eq.${entryId}`)
  const ids = [...new Set((data ?? []).map((r) => (r.entry_id === entryId ? r.related_entry_id : r.entry_id) as string))]
  if (!ids.length) return []
  const { data: es } = await supabase.from('entries').select('id, slug, type, title, personal_translation, subtitle').in('id', ids).is('deleted_at', null)
  return (es ?? []) as MiniEntry[]
}

// ------------------------------------------------------------------ 专题
export async function fetchCollections(): Promise<(CollectionRow & { count: number })[]> {
  const { data, error } = await supabase.from('collections').select('*, collection_entries(count)').order('sort_order').order('title')
  if (error) wrap(error)
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...(r as unknown as CollectionRow), count: ((r.collection_entries as { count: number }[])?.[0]?.count) ?? 0
  }))
}
export async function fetchCollection(slug: string) {
  const { data, error } = await supabase.from('collections')
    .select('*, collection_entries(sort_order, entry:entries(id, slug, type, title, subtitle, summary, personal_translation, status, deleted_at))')
    .eq('slug', slug).maybeSingle()
  if (error) wrap(error)
  if (!data) return null
  const c = data as unknown as CollectionRow & { collection_entries: { sort_order: number; entry: (MiniEntry & { summary: string | null; deleted_at: string | null }) | null }[] }
  const entries = c.collection_entries
    .filter((x) => x.entry && !x.entry.deleted_at).sort((a, b) => a.sort_order - b.sort_order).map((x) => x.entry!)
  return { collection: c as CollectionRow, entries }
}

// ------------------------------------------------------------------ 后台：条目
export async function getPayload(id: string): Promise<EntryPayload> {
  const { data, error } = await supabase.rpc('entry_payload', { p_id: id })
  if (error) wrap(error)
  if (!data) throw new Error('找不到这条内容。')
  return data as EntryPayload
}

export async function saveEntry(payload: EntryPayload, opts: { expectedUpdatedAt?: string | null; makeVersion?: boolean; note?: string | null } = {}): Promise<EntryPayload> {
  const { data, error } = await supabase.rpc('save_entry', {
    p_payload: nfcDeep(payload), p_expected_updated_at: opts.expectedUpdatedAt ?? null,
    p_make_version: opts.makeVersion ?? false, p_change_note: opts.note ?? null
  })
  if (error) wrap(error)
  return data as EntryPayload
}

export async function restoreVersion(entryId: string, versionNo: number): Promise<EntryPayload> {
  const { data, error } = await supabase.rpc('restore_version', { p_entry_id: entryId, p_version_no: versionNo })
  if (error) wrap(error)
  return data as EntryPayload
}

export async function listVersions(entryId: string): Promise<Omit<VersionRow, 'snapshot_json'>[]> {
  const { data, error } = await supabase.from('entry_versions').select('id, version_no, created_at, change_note')
    .eq('entry_id', entryId).order('version_no', { ascending: false })
  if (error) wrap(error)
  return (data ?? []) as Omit<VersionRow, 'snapshot_json'>[]
}
export async function getVersion(entryId: string, no: number): Promise<VersionRow> {
  const { data, error } = await supabase.from('entry_versions').select('*').eq('entry_id', entryId).eq('version_no', no).single()
  if (error) wrap(error)
  return data as VersionRow
}

export interface AdminRow {
  id: string; slug: string; type: EntryType; title: string; status: EntryStatus
  translation_status: TranslationStatus; needs_verify: boolean; primary_category_id: string | null
  updated_at: string; deleted_at: string | null
}
export interface AdminFilter {
  q?: string; status?: EntryStatus | ''; type?: EntryType | ''; category?: string | ''
  trash?: boolean; page?: number; pageSize?: number
}
export async function listAdminEntries(f: AdminFilter): Promise<{ rows: AdminRow[]; total: number }> {
  const pageSize = f.pageSize ?? 30, page = f.page ?? 1
  let q = supabase.from('entries')
    .select('id, slug, type, title, status, translation_status, needs_verify, primary_category_id, updated_at, deleted_at', { count: 'exact' })
  q = f.trash ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null)
  if (f.status) q = q.eq('status', f.status)
  if (f.type) q = q.eq('type', f.type)
  if (f.category) q = q.eq('primary_category_id', f.category)
  const term = f.q?.trim()
  if (term) {
    const esc = term.replace(/[\\%_]/g, (c) => '\\' + c)
    q = q.ilike('title', `%${esc}%`)
  }
  const { data, count, error } = await q.order('updated_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)
  if (error) wrap(error)
  return { rows: (data ?? []) as AdminRow[], total: count ?? 0 }
}

export async function setDeleted(id: string, deleted: boolean) {
  const { error } = await supabase.from('entries').update({ deleted_at: deleted ? new Date().toISOString() : null }).eq('id', id)
  if (error) wrap(error)
}
export async function purgeEntry(id: string) {
  const { error } = await supabase.from('entries').delete().eq('id', id).not('deleted_at', 'is', null)
  if (error) wrap(error)
}

export async function dashboardStats() {
  const c = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const { count } = await build(base())
    return count ?? 0
  }
  const base = () => supabase.from('entries').select('id', { count: 'exact', head: true })
  const [total, draft, priv, pub, trash, uncategorized, verify] = await Promise.all([
    c((q) => q.is('deleted_at', null)),
    c((q) => q.is('deleted_at', null).eq('status', 'draft')),
    c((q) => q.is('deleted_at', null).eq('status', 'private')),
    c((q) => q.is('deleted_at', null).eq('status', 'public')),
    c((q) => q.not('deleted_at', 'is', null)),
    c((q) => q.is('deleted_at', null).is('primary_category_id', null)),
    c((q) => q.is('deleted_at', null).or('needs_verify.eq.true,translation_status.eq.verify'))
  ])
  const { data: recent } = await supabase.from('entries').select('id, slug, type, title, status, updated_at')
    .is('deleted_at', null).order('updated_at', { ascending: false }).limit(8)
  return { total, draft, private: priv, public: pub, trash, tidy: uncategorized + verify, uncategorized, verify, recent: (recent ?? []) as Pick<AdminRow, 'id' | 'slug' | 'type' | 'title' | 'status' | 'updated_at'>[] }
}

/** 批量给多条内容加标签 */
export async function addTagToEntries(tagId: string, entryIds: string[]) {
  if (!entryIds.length) return
  const { error } = await supabase.from('entry_tags').upsert(entryIds.map((entry_id) => ({ entry_id, tag_id: tagId })), { ignoreDuplicates: true })
  if (error) wrap(error)
}

// ------------------------------------------------------------------ 后台：分类、标签、专题
export async function saveCategory(c: Partial<Category> & { name: string; slug: string }) {
  const row = { ...c, name: c.name.normalize('NFC') }
  const { error } = c.id ? await supabase.from('categories').update(row).eq('id', c.id) : await supabase.from('categories').insert(row)
  if (error) wrap(error)
}
export async function deleteCategory(id: string) {
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw new Error(error.code === '23503' ? '这个分类下还有子分类，先移走或删除它们。' : error.message)
}
export async function saveTag(t: Partial<Tag> & { name: string; slug: string; type: string }) {
  const row = { ...t, name: t.name.normalize('NFC') }
  const { error } = t.id ? await supabase.from('tags').update(row).eq('id', t.id) : await supabase.from('tags').insert(row)
  if (error) wrap(error)
}
export async function deleteTag(id: string) {
  const { error } = await supabase.from('tags').delete().eq('id', id)
  if (error) wrap(error)
}
/** 合并标签：把 from 的全部关联转给 into，再删除 from。 */
export async function mergeTags(fromId: string, intoId: string) {
  const { data } = await supabase.from('entry_tags').select('entry_id').eq('tag_id', fromId)
  const ids = (data ?? []).map((r) => r.entry_id as string)
  await addTagToEntries(intoId, ids)
  await deleteTag(fromId)
}
export async function tagUsage(): Promise<Record<string, number>> {
  const { data } = await supabase.from('entry_tags').select('tag_id')
  const out: Record<string, number> = {}
  for (const r of data ?? []) out[r.tag_id as string] = (out[r.tag_id as string] ?? 0) + 1
  return out
}

export async function saveCollection(c: Partial<CollectionRow> & { title: string; slug: string }) {
  const row = { ...c, title: c.title.normalize('NFC') }
  const { data, error } = c.id
    ? await supabase.from('collections').update(row).eq('id', c.id).select('id').single()
    : await supabase.from('collections').insert(row).select('id').single()
  if (error) wrap(error)
  return data!.id as string
}
export async function deleteCollection(id: string) {
  const { error } = await supabase.from('collections').delete().eq('id', id)
  if (error) wrap(error)
}
export async function collectionEntries(id: string): Promise<(MiniEntry & { sort_order: number; status: EntryStatus })[]> {
  const { data } = await supabase.from('collection_entries').select('sort_order, entry:entries(id, slug, type, title, subtitle, personal_translation, status)')
    .eq('collection_id', id).order('sort_order')
  return (data ?? []).filter((r: Record<string, unknown>) => r.entry).map((r: Record<string, unknown>) => ({
    ...(r.entry as MiniEntry & { status: EntryStatus }), sort_order: r.sort_order as number
  }))
}
export async function setCollectionOrder(id: string, entryIds: string[]) {
  const rows = entryIds.map((entry_id, i) => ({ collection_id: id, entry_id, sort_order: i }))
  const { error } = await supabase.from('collection_entries').upsert(rows)
  if (error) wrap(error)
}
export async function addEntryToCollection(collectionId: string, entryId: string) {
  const { data } = await supabase.from('collection_entries').select('sort_order').eq('collection_id', collectionId).order('sort_order', { ascending: false }).limit(1)
  const next = ((data?.[0]?.sort_order as number | undefined) ?? -1) + 1
  const { error } = await supabase.from('collection_entries').upsert({ collection_id: collectionId, entry_id: entryId, sort_order: next }, { ignoreDuplicates: true })
  if (error) wrap(error)
}
export async function removeEntryFromCollection(collectionId: string, entryId: string) {
  const { error } = await supabase.from('collection_entries').delete().eq('collection_id', collectionId).eq('entry_id', entryId)
  if (error) wrap(error)
}

/** 编辑器里挑选「相关条目」用：按标题搜（管理员可见全部）。 */
export async function pickEntries(q: string): Promise<MiniEntry[]> {
  const term = q.trim()
  if (!term) return []
  const { rows } = await searchEntries({ q: term, pageSize: 8 })
  return rows.map((r) => ({ id: r.id, slug: r.slug, type: r.type, title: r.title, subtitle: r.subtitle, personal_translation: r.personal_translation }))
}

/** 首页卡片用：取每个条目的第一个罗马转写 / 别名 */
export async function fetchAliasMap(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {}
  const { data } = await supabase.from('entry_aliases').select('entry_id, text, alias_type').in('entry_id', ids)
  const out: Record<string, string> = {}
  for (const r of (data ?? []).sort((a, b) => (a.alias_type === 'romanization' ? -1 : 0) - (b.alias_type === 'romanization' ? -1 : 0))) {
    if (!out[r.entry_id as string]) out[r.entry_id as string] = r.text as string
  }
  return out
}
