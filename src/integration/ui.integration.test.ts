// @vitest-environment jsdom
/**
 * 界面层冒烟测试：整个应用挂在 jsdom 里，连真实 PostgREST + PostgreSQL，逐页点开并检查内容、
 * 权限跳转、自动识别分类、自动保存，以及恶意内容不会被当成 HTML / 链接执行。
 * 只在 VITE_INTEGRATION=1 时运行。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import router from '@/router'
import App from '@/App.vue'
import { supabase } from '@/lib/supabase'
import * as api from '@/services/api'
import { emptyDoc, type EntryPayload } from '@/lib/types'

const suite = import.meta.env.VITE_INTEGRATION ? describe : describe.skip
const mk = (o: Partial<EntryPayload>): EntryPayload => ({
  slug: '', type: 'corpus_card', title: '', subtitle: null, summary: null, status: 'public', translation_status: 'provisional',
  primary_category_id: null, cover_asset_id: null, personal_translation: null, translator_credit: null, copyright_note: null,
  material_date: null, needs_verify: false, remarks: null, content_json: emptyDoc(), languages: [], tag_ids: [], aliases: [],
  senses: [], sources: [], collection_ids: [], related: [], ...o
})
const doc = (...n: unknown[]) => ({ type: 'doc', content: n }) as EntryPayload['content_json']
const ID = { khun: '20000000-0000-0000-0000-0000000000a1', note: '20000000-0000-0000-0000-0000000000a2', evil: '20000000-0000-0000-0000-0000000000a3' }

let wrapper: VueWrapper | null = null
async function visit(path: string) {
  wrapper?.unmount()
  const pinia = createPinia(); setActivePinia(pinia)   // 与 main.ts 一致：先装 pinia，路由守卫里才能用 store
  await router.push(path); await router.isReady()
  wrapper = mount(App, { global: { plugins: [pinia, router] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}
const until = async (fn: () => void, ms = 4000) => { const t0 = Date.now(); for (;;) { try { fn(); return } catch (e) { if (Date.now() - t0 > ms) throw e; await new Promise((r) => setTimeout(r, 40)); await flushPromises() } } }

suite('界面 × 真实后端', () => {
  beforeAll(async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: 'admin@test', password: 'correct-horse' }); expect(error).toBeNull()
    const cats = await api.fetchCategories()
    await api.saveTag({ name: '称谓与敬语', slug: 'ui-honorific', type: '日常用语细分' })
    const col = await api.saveCollection({ title: 'Round One', slug: 'round-one', status: 'public' })
    await api.saveEntry(mk({
      id: ID.khun, slug: 'khun-nu', title: 'คุณหนู', primary_category_id: cats.find((c) => c.slug === 'local-daily')!.id, personal_translation: '大小姐',
      languages: [{ language_code: 'th', role: 'source' }], aliases: [{ text: 'Khun Nu', language_code: 'en', alias_type: 'romanization' }],
      senses: [{ meaning: '佣人对雇主家年轻成员的称呼', context: '雇佣关系', register: null, personal_translation: null }],
      sources: [{ title: null, creator: null, work_title: 'Round One', url: 'https://example.com/v', source_type: 'video', platform: 'YouTube', note: null },
                { title: 'bad', creator: null, work_title: null, url: null, source_type: 'web', platform: null, note: null }],
      collection_ids: [col], remarks: '私人备注-千万别公开',
      content_json: doc({ type: 'paragraph', content: [{ type: 'text', text: '译者说明正文' }] })
    }))
    await api.saveEntry(mk({
      id: ID.note, slug: 'round-one', type: 'translation_note', title: '爱、循环和你', subtitle: 'รักวนกับคนเดิม', translation_status: 'final',
      personal_translation: '《爱、循环和你》', collection_ids: [col], related: [{ related_entry_id: ID.khun, relation_type: 'related' }],
      content_json: doc(
        { type: 'bilingualPair', attrs: { source: 'รักวนกับคนเดิม', target: '爱、循环和你', sourceLang: 'th', targetLang: 'zh', note: '' } },
        { type: 'wordBreakdown', attrs: { items: [{ token: 'คนเดิม', meaning: '原来的人', note: '' }] } },
        { type: 'candidates', attrs: { items: [{ text: '候选甲', note: '', chosen: false }, { text: '《爱、循环和你》', note: '', chosen: true }] } },
        { type: 'noteBlock', attrs: { kind: 'choice' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '这是译者的取舍' }] }] })
    }))
    // 恶意内容：标题里带 HTML、正文里带 javascript: 链接与脚本标签
    await api.saveEntry(mk({
      id: ID.evil, slug: 'evil', title: '<img src=x onerror="window.__pwned=1">', personal_translation: '<script>window.__pwned=1</script>',
      content_json: doc({ type: 'paragraph', content: [
        { type: 'text', text: '点我', marks: [{ type: 'link', attrs: { href: 'javascript:window.__pwned=1' } }] },
        { type: 'text', text: ' <b onmouseover=alert(1)>x</b>' }] })
    }))
    await supabase.auth.signOut()
  })

  it('首页：站名、主题、精选、卡片、署名', async () => {
    const w = await visit('/')
    await until(() => expect(w.text()).toContain('Khun Nu'))
    const t = w.text()
    expect(t).toContain('语料档案馆'); expect(t).toContain('影视'); expect(t).toContain('在地')
    expect(t).toContain('《爱、循环和你》'); expect(t).toContain('Khun Nu'); expect(t).toContain('大小姐')
    expect(t).toContain('Valar Morghulis·F'); expect(t).toContain('忠实保存原文')
    expect(w.find('main#main').exists()).toBe(true)
    expect(w.find('input[type=search]').attributes('placeholder')).toContain('搜索')
  })

  it('札记详情：原译对照、词语拆解、候选译法、说明块标记、译者署名', async () => {
    const w = await visit('/entries/round-one')
    await until(() => expect(w.text()).toContain('阅读提示'))
    const t = w.text()
    expect(t).toContain('รักวนกับคนเดิม'); expect(t).toContain('คนเดิม'); expect(t).toContain('原来的人')
    expect(t).toContain('候选甲'); expect(t).toContain('最终'); expect(t).toContain('译者选择'); expect(t).toContain('这是译者的取舍')
    expect(t).toContain('Valar Morghulis·F')
    expect(w.find('.pair').exists()).toBe(true)
    expect(w.findAll('.mark-choice').length).toBeGreaterThan(0)
  })

  it('卡片详情：个人译法、义项、别名、外链安全属性；不泄露私人备注', async () => {
    const w = await visit('/entries/khun-nu')
    await until(() => expect(w.text()).toContain('相关条目'))
    const t = w.text()
    expect(t).toContain('个人译法'); expect(t).toContain('佣人对雇主家年轻成员的称呼'); expect(t).toContain('Khun Nu'); expect(t).toContain('相关条目')
    expect(t).not.toContain('千万别公开')
    const a = w.find('a[href="https://example.com/v"]')
    expect(a.exists()).toBe(true)
    expect(a.attributes('rel')).toContain('noopener'); expect(a.attributes('target')).toBe('_blank')
    expect(a.text()).toContain('外部链接')
  })

  it('搜索：转写命中并高亮，显示命中来源', async () => {
    const w = await visit('/search?q=khun%20nu')
    await until(() => expect(w.text()).toContain('命中：别名'))
    expect(w.find('mark').text().toLowerCase()).toBe('khun nu')
    expect(w.text()).toContain('คุณหนู')
  })

  it('搜索：没有结果时给出可操作的提示', async () => {
    const w = await visit('/search?q=zzzzqqq')
    await until(() => expect(w.text()).toContain('没有找到匹配的内容'))
  })

  it('主题页、专题页、列表页', async () => {
    let w = await visit('/topics/local')
    await until(() => expect(w.text()).toContain('คุณหนู'))
    w = await visit('/collections/round-one')
    await until(() => expect(w.text()).toContain('爱、循环和你'))
    w = await visit('/corpus')
    await until(() => expect(w.text()).toContain('คุณหนู')); expect(w.text()).not.toContain('候选甲')
    w = await visit('/notes')
    await until(() => expect(w.text()).toContain('爱、循环和你'))
  })

  it('不存在 / 未公开的条目显示 404 而不是报错', async () => {
    const w = await visit('/entries/does-not-exist')
    await until(() => expect(w.text()).toContain('找不到这条内容'))
  })

  it('恶意内容只会被当作文字显示：没有注入元素，没有 javascript: 链接', async () => {
    const w = await visit('/entries/evil')
    await until(() => expect(w.text()).toContain('onerror'))
    expect(w.find('img[src="x"]').exists()).toBe(false)
    expect(w.find('script').exists()).toBe(false)
    expect(w.find('b[onmouseover]').exists()).toBe(false)
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull()
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined()
    expect(w.text()).toContain('点我')
  })

  it('后台：未登录会被送到登录页', async () => {
    const w = await visit('/admin')
    await until(() => expect(router.currentRoute.value.path).toBe('/admin/login'))
    expect(w.text()).toContain('登录')
  })

  it('后台：密码错误给出提示，正确登录进入概览', async () => {
    let w = await visit('/admin/login')
    await w.find('#em').setValue('admin@test'); await w.find('#pw').setValue('wrong')
    await w.find('form').trigger('submit'); await flushPromises()
    await until(() => expect(w.text()).toContain('邮箱或密码不正确'))
    await w.find('#pw').setValue('correct-horse'); await w.find('form').trigger('submit')
    await until(() => expect(router.currentRoute.value.path).toBe('/admin'))
    w = wrapper!
    await until(() => expect(w.text()).toContain('全部内容'))
    expect(w.text()).toContain('已公开')
  })

  it('后台：编辑已有卡片，载入字段与编辑器', async () => {
    const w = await visit(`/admin/entries/${ID.khun}`)
    await until(() => expect((w.find('#title').element as HTMLInputElement).value).toBe('คุณหนู'))
    expect(w.find('.tiptap').exists()).toBe(true)
    expect(w.text()).toContain('版本历史')
    expect((w.find('#rm').element as HTMLTextAreaElement).value).toContain('私人备注')
  })

  it('后台：新建条目 —— 输入泰语称谓即识别为「语料卡片 · 在地 › 日常用语」，并自动保存、跳到编辑页', async () => {
    const w = await visit('/admin/entries/new')
    await until(() => expect(w.find('#title').exists()).toBe(true))
    await w.find('#title').setValue('คุณชาย')
    await until(() => expect(w.text()).toContain('语料卡片 · 在地 › 日常用语'), 3000)
    expect(w.text()).toContain('称谓与敬语')
    expect((w.find('#cat').element as HTMLSelectElement).selectedOptions[0].text).toContain('日常用语')
    expect(w.findAll('input[type=checkbox]').some((c) => (c.element as HTMLInputElement).checked)).toBe(true)
    // 自动保存（1.5 秒防抖）
    await until(() => expect(router.currentRoute.value.path).toMatch(/^\/admin\/entries\/[0-9a-f-]{36}$/), 8000)
    const id = router.currentRoute.value.params.id as string
    const p = await api.getPayload(id)
    expect(p.title).toBe('คุณชาย'); expect(p.type).toBe('corpus_card'); expect(p.status).toBe('draft')
    expect(p.languages).toContainEqual({ language_code: 'th', role: 'source' })
    expect(p.primary_category_id).toBeTruthy()
  }, 20000)
})
