/**
 * 接口层集成测试：前端数据层 + 真实 PostgREST + 真实 PostgreSQL（含迁移与 RLS）。
 * 只在设置了 VITE_INTEGRATION=1 时运行；用 supabase/tests/integration/run.sh 启动。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { supabase } from '@/lib/supabase'
import * as api from '@/services/api'
import { toCsv, exportAll } from '@/services/backup'
import { emptyDoc, type EntryPayload } from '@/lib/types'

const suite = import.meta.env.VITE_INTEGRATION ? describe : describe.skip

const mk = (o: Partial<EntryPayload>): EntryPayload => ({
  slug: '', type: 'corpus_card', title: '', subtitle: null, summary: null, status: 'public', translation_status: 'provisional',
  primary_category_id: null, cover_asset_id: null, personal_translation: null, translator_credit: null, copyright_note: null,
  material_date: null, needs_verify: false, remarks: null, content_json: emptyDoc(), languages: [], tag_ids: [], aliases: [],
  senses: [], sources: [], collection_ids: [], related: [], ...o
})
const doc = (...nodes: unknown[]) => ({ type: 'doc', content: nodes }) as EntryPayload['content_json']
const signIn = async () => { const { error } = await supabase.auth.signInWithPassword({ email: 'admin@test', password: 'correct-horse' }); expect(error).toBeNull() }
const signOut = async () => { await supabase.auth.signOut() }

const ID = { khun: '10000000-0000-0000-0000-0000000000a1', note: '10000000-0000-0000-0000-0000000000a2', secret: '10000000-0000-0000-0000-0000000000a3', draft: '10000000-0000-0000-0000-0000000000a4' }

suite('前端数据层 × PostgREST', () => {
  let dailyCat = ''; let tagId = ''; let collId = ''
  let khun: EntryPayload

  beforeAll(async () => {
    await signIn()
    const cats = await api.fetchCategories()
    dailyCat = cats.find((c) => c.slug === 'local-daily')!.id
    await api.saveTag({ name: '称谓', slug: 'tag-honorific', type: '称谓' })
    tagId = (await api.fetchTags()).find((t) => t.slug === 'tag-honorific')!.id
    collId = await api.saveCollection({ title: 'Round One', slug: 'round-one', status: 'public', description: '同一部作品' })

    khun = await api.saveEntry(mk({
      id: ID.khun, slug: 'khun-nu', title: 'คุณหนู', primary_category_id: dailyCat, personal_translation: '大小姐',
      languages: [{ language_code: 'th', role: 'source' }, { language_code: 'zh', role: 'target' }],
      tag_ids: [tagId], aliases: [{ text: 'Khun Nu', language_code: 'en', alias_type: 'romanization' }],
      senses: [{ meaning: '佣人对雇主家年轻成员的称呼', context: '雇佣关系', register: null, personal_translation: null }, { meaning: '朋友之间的调侃', context: null, register: '调侃', personal_translation: null }],
      sources: [{ title: null, creator: null, work_title: 'Round One', url: 'https://example.com/v', source_type: 'video', platform: 'YouTube', note: '12:30' }],
      collection_ids: [collId], remarks: '私人备注-不公开',
      content_json: doc({ type: 'paragraph', content: [{ type: 'text', text: '关于 ลูกคุณหนู 的差异' }] })
    }), { makeVersion: true, note: '首版' })
    await api.saveEntry(mk({
      id: ID.note, slug: 'round-one-title', type: 'translation_note', title: '爱、循环和你', subtitle: 'รักวนกับคนเดิม', translation_status: 'final',
      personal_translation: '《爱、循环和你》', aliases: [{ text: 'Round One', language_code: 'en', alias_type: 'other' }],
      collection_ids: [collId], related: [{ related_entry_id: ID.khun, relation_type: 'related' }],
      content_json: doc(
        { type: 'bilingualPair', attrs: { source: 'รักวนกับคนเดิม', target: '爱、循环和你', sourceLang: 'th', targetLang: 'zh', note: '' } },
        { type: 'wordBreakdown', attrs: { items: [{ token: 'คนเดิม', meaning: '原来的人', note: '' }] } })
    }))
    await api.saveEntry(mk({ id: ID.secret, slug: 'secret', title: 'secretword', status: 'private' }))
    await api.saveEntry(mk({ id: ID.draft, slug: 'draft', title: 'draftword', status: 'draft' }))
  })

  describe('管理员', () => {
    it('getPayload 与保存互通，并带出私人备注', async () => {
      const p = await api.getPayload(ID.khun)
      expect(p.remarks).toBe('私人备注-不公开')
      expect(p.aliases).toHaveLength(1); expect(p.senses).toHaveLength(2); expect(p.related).toHaveLength(1)
      expect(p.related[0].related_entry_id).toBe(ID.note)   // 从另一端保存的关联，这一端也能看到
    })

    it('过期的编辑会得到 ConflictError', async () => {
      const p = await api.getPayload(ID.draft)
      await api.saveEntry({ ...p, title: 'draftword 2' }, { expectedUpdatedAt: p.updated_at })
      await expect(api.saveEntry({ ...p, title: '过期' }, { expectedUpdatedAt: p.updated_at })).rejects.toBeInstanceOf(api.ConflictError)
    })

    it('公开条目引用私密图片 → PrivateAssetError（带图片 id）', async () => {
      const { data, error } = await supabase.from('assets').insert({ bucket: 'private-media', storage_path: 'it/a.png', mime_type: 'image/png', size_bytes: 100, visibility: 'private' }).select('id').single()
      expect(error).toBeNull()
      const p = await api.getPayload(ID.draft)
      const body = doc({ type: 'image', attrs: { assetId: data!.id, alt: '', caption: '', credit: '' } })
      await expect(api.saveEntry({ ...p, status: 'public', content_json: body })).rejects.toMatchObject({ assetIds: [data!.id] })
      // 草稿引用私密图片没问题
      await expect(api.saveEntry({ ...p, status: 'draft', content_json: body })).resolves.toBeTruthy()
    })

    it('版本：列表、读取、恢复', async () => {
      const p = await api.getPayload(ID.khun)
      await api.saveEntry({ ...p, title: 'คุณหนู（改）' }, { makeVersion: true, note: '改标题' })
      const vs = await api.listVersions(ID.khun)
      expect(vs.map((v) => v.version_no)).toEqual([2, 1])
      expect((await api.getVersion(ID.khun, 1)).snapshot_json.title).toBe('คุณหนู')
      const r = await api.restoreVersion(ID.khun, 1)
      expect(r.title).toBe('คุณหนู')
    })

    it('改 slug 后旧链接仍可解析并给出跳转', async () => {
      const p = await api.getPayload(ID.note)
      await api.saveEntry({ ...p, slug: 'round-one-title-new' })
      const hit = await api.fetchEntryBySlug('round-one-title')
      expect(hit.redirectTo).toBe('round-one-title-new')
      expect(hit.entry?.id).toBe(ID.note)
      await expect(api.saveEntry({ ...p, id: ID.draft, slug: 'round-one-title-new' })).rejects.toBeInstanceOf(api.SlugTakenError)
    })

    it('后台列表、统计、软删除与恢复', async () => {
      const list = await api.listAdminEntries({ status: 'draft' })
      expect(list.rows.some((r) => r.id === ID.draft)).toBe(true)
      const s = await api.dashboardStats()
      expect(s.total).toBe(4); expect(s.public).toBe(2); expect(s.private).toBe(1)
      await api.setDeleted(ID.draft, true)
      expect((await api.listAdminEntries({ trash: true })).rows.map((r) => r.id)).toContain(ID.draft)
      await api.setDeleted(ID.draft, false)
    })

    it('合并标签', async () => {
      await api.saveTag({ name: '敬称', slug: 'tag-honorific-2', type: '称谓' })
      const dup = (await api.fetchTags()).find((t) => t.slug === 'tag-honorific-2')!
      const p = await api.getPayload(ID.note)
      await api.saveEntry({ ...p, tag_ids: [dup.id] })
      await api.mergeTags(dup.id, tagId)
      expect((await api.getPayload(ID.note)).tag_ids).toEqual([tagId])
      expect((await api.fetchTags()).some((t) => t.id === dup.id)).toBe(false)
    })

    it('导出 → CSV；导出里包含全部条目', async () => {
      const f = await exportAll()
      expect(f.entries).toHaveLength(4)
      const csv = toCsv(f)
      expect(csv.startsWith('\ufeff')).toBe(true)
      expect(csv).toContain('คุณหนู'); expect(csv).toContain('大小姐')
    })

    it('专题：加入、排序、移除', async () => {
      await api.setCollectionOrder(collId, [ID.note, ID.khun])
      expect((await api.collectionEntries(collId)).map((e) => e.id)).toEqual([ID.note, ID.khun])
      await api.removeEntryFromCollection(collId, ID.khun)
      await api.addEntryToCollection(collId, ID.khun)
      expect((await api.collectionEntries(collId)).map((e) => e.id)).toEqual([ID.note, ID.khun])
    })
  })

  describe('匿名访客', () => {
    beforeAll(async () => { await signOut() })

    it('搜索：原文、转写、译法、中文标题、正文、词语拆解', async () => {
      const hit = async (q: string, slug: string) => expect((await api.searchEntries({ q })).rows.map((r) => r.slug), q).toContain(slug)
      await hit('คุณหนู', 'khun-nu')
      await hit('khun nu', 'khun-nu')
      await hit('大小姐', 'khun-nu')
      await hit('ลูกคุณหนู', 'khun-nu')
      await hit('Round One', 'round-one-title-new')
      await hit('รักวนกับคนเดิม', 'round-one-title-new')
      await hit('爱、循环和你', 'round-one-title-new')
      await hit('คนเดิม', 'round-one-title-new')
      const r = (await api.searchEntries({ q: 'Khun Nu' })).rows.find((x) => x.slug === 'khun-nu')!
      expect(r.match_source).toBe('alias')
    })

    it('搜不到草稿、私密、私人备注', async () => {
      for (const q of ['secretword', 'draftword', '私人备注']) expect((await api.searchEntries({ q })).rows).toHaveLength(0)
    })

    it('筛选与分页', async () => {
      expect((await api.searchEntries({ lang: 'th' })).rows.map((r) => r.slug)).toEqual(['khun-nu'])
      expect((await api.searchEntries({ type: 'translation_note' })).total).toBe(1)
      const topic = (await api.fetchCategories()).find((c) => c.slug === 'local')!
      expect((await api.searchEntries({ category: topic.id })).rows.map((r) => r.slug)).toEqual(['khun-nu'])
      const p1 = await api.searchEntries({ sort: 'updated', pageSize: 1, page: 1 })
      const p2 = await api.searchEntries({ sort: 'updated', pageSize: 1, page: 2 })
      expect(p1.total).toBe(2); expect(p1.rows[0].id).not.toBe(p2.rows[0].id)
      expect((await api.searchEntries({ tag: tagId })).total).toBeGreaterThanOrEqual(1)
    })

    it('详情：嵌套查询带出别名、义项、来源、标签、专题、语言', async () => {
      const { entry } = await api.fetchEntryBySlug('khun-nu')
      expect(entry).toBeTruthy()
      expect(entry!.aliases[0].text).toBe('Khun Nu')
      expect(entry!.senses.map((s) => s.sort_order)).toEqual([0, 1])
      expect(entry!.sources[0].url).toBe('https://example.com/v')
      expect(entry!.tags[0].tag?.name).toBe('称谓')
      expect(entry!.collections[0].collection?.slug).toBe('round-one')
      expect(entry!.entry_languages.map((l) => l.language_code).sort()).toEqual(['th', 'zh'])
      expect((entry as unknown as Record<string, unknown>).remarks).toBeUndefined()   // 备注不在 entries 表里，匿名拿不到
    })

    it('看不到非公开条目（直接按 slug 取也不行）', async () => {
      expect((await api.fetchEntryBySlug('secret')).entry).toBeNull()
      expect((await api.fetchEntryBySlug('draft')).entry).toBeNull()
    })

    it('相关条目、专题、别名表', async () => {
      expect((await api.fetchRelated(ID.khun)).map((r) => r.id)).toEqual([ID.note])
      const cols = await api.fetchCollections()
      expect(cols).toHaveLength(1); expect(cols[0].count).toBe(2)
      const c = await api.fetchCollection('round-one')
      expect(c!.entries.map((e) => e.slug)).toEqual(['round-one-title-new', 'khun-nu'])
      expect((await api.fetchAliasMap([ID.khun]))[ID.khun]).toBe('Khun Nu')
    })

    it('匿名不能写、不能调用管理函数', async () => {
      await expect(api.saveEntry(mk({ title: 'hack' }))).rejects.toBeTruthy()
      await expect(api.getVersion(ID.khun, 1)).rejects.toBeTruthy()
      await expect(exportAll()).rejects.toBeTruthy()
      const { error } = await supabase.from('entries').insert({ slug: 'x', type: 'corpus_card', title: 'x' })
      expect(error).toBeTruthy()
      const { data } = await supabase.from('entry_private_notes').select('*')
      expect(data ?? []).toHaveLength(0)
    })

    it('站点设置、分类可读；标签只露出被公开条目使用的', async () => {
      expect((await api.fetchSettings()).author_name).toBe('Valar Morghulis·F')
      expect((await api.fetchCategories()).length).toBeGreaterThan(20)
      expect((await api.fetchTags()).map((t) => t.slug)).toEqual(['tag-honorific'])
    })
  })

  describe('恢复演练', () => {
    it('导出 → 清空 → 导入后，内容一致', async () => {
      await signIn()
      const { importAll } = await import('@/services/backup')
      const before = await exportAll()
      for (const e of before.entries) await supabase.from('entries').delete().eq('id', e.id!)
      expect((await exportAll()).entries).toHaveLength(0)
      await importAll(before)
      const after = await exportAll()
      expect(after.entries).toHaveLength(before.entries.length)
      const pick = (f: typeof before, id: string) => f.entries.find((e) => e.id === id)!
      for (const id of [ID.khun, ID.note]) {
        const a = pick(before, id), b = pick(after, id)
        expect(b.title).toBe(a.title); expect(b.aliases).toEqual(a.aliases); expect(b.senses).toEqual(a.senses)
        expect(b.content_json).toEqual(a.content_json); expect(b.related).toEqual(a.related)
      }
    })
  })
})
