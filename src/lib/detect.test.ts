import { describe, it, expect } from 'vitest'
import { classify } from './detect'
import { highlightParts, safeUrl, nfcDeep, slugify } from './text'

describe('classify', () => {
  it('泰语称谓 → 语料卡片 / 在地 › 日常用语 › 称谓与敬语', () => {
    const r = classify('คุณหนู')
    expect(r.sourceLang).toBe('th')
    expect(r.type).toBe('corpus_card')
    expect(r.topic).toBe('在地'); expect(r.sub).toBe('日常用语'); expect(r.dailyDetail).toBe('称谓与敬语')
    expect(r.confidence).toBe('高')
  })
  it('来源里的关键词能带出主题', () => {
    expect(classify('รักวนกับคนเดิม', '电视剧')).toMatchObject({ topic: '影视', sub: '剧名/片名翻译' })
    expect(classify('사랑해', '歌词')).toMatchObject({ topic: '音乐', sub: '歌词' })
  })
  it('长文本 → 翻译札记；中泰混合识别原文/译文语言', () => {
    const r = classify('รักวนกับคนเดิม\n爱、循环和你')
    expect(r.type).toBe('translation_note')
    expect(r.sourceLang).toBe('th'); expect(r.targetLang).toBe('zh')
  })
  it('没有关键词时给低置信度并说明依据', () => {
    const r = classify('hello world')
    expect(r.confidence).toBe('低'); expect(r.basis).toContain('没有关键词')
  })
  it('手动改主题后二级分类跟着重算', () => {
    expect(classify('คุณหนู', '', { topic: '影视' }).topic).toBe('影视')
  })
})

describe('text utils', () => {
  it('高亮只切片段，不产生 HTML', () => {
    const p = highlightParts('关于 <b>Khun Nu</b> 的说明', 'khun nu')
    expect(p.filter((x) => x.hit).map((x) => x.text)).toEqual(['Khun Nu'])
    expect(p.map((x) => x.text).join('')).toBe('关于 <b>Khun Nu</b> 的说明')
  })
  it('链接只放行安全协议', () => {
    expect(safeUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('data:text/html,x')).toBeNull()
    expect(safeUrl('/relative')).toBeNull()
  })
  it('NFC 规范化不破坏泰文与韩文', () => {
    expect(nfcDeep('คุณหนู')).toBe('คุณหนู')
    expect(nfcDeep('\u1112\u1161\u11AB')).toBe('한')
  })
  it('slug 保留中日韩泰字符', () => {
    expect(slugify(' 爱、循环和你 ')).toBe('爱循环和你')
    expect(slugify('Round One!')).toBe('round-one')
  })
})
