/**
 * 输入即识别：按文字类型、长度与关键词给出分类建议。
 * 这是规则判断，不是 AI；每一项都能被手动覆盖。关键词表可以自行补充。
 */
import type { EntryType } from './types'

export type LangCode = 'th' | 'ko' | 'zh' | 'ja' | 'en'
export interface Detection {
  langs: { code: LangCode; pct: number }[]
  sourceLang: LangCode | null
  targetLang: LangCode | null
  langNote: string
  type: EntryType
  typeNote: string
  topic: string
  sub: string
  confidence: '高' | '中' | '低'
  basis: string
  dailyDetail: string | null
}

type SubRule = [string, string[]]
interface TopicRule { name: string; subs: SubRule[] }

export const TOPIC_RULES: TopicRule[] = [
  { name: '影视', subs: [
    ['台词原文', ['台词', '对白', '台本', '剧中', 'dialogue', 'screenplay']],
    ['小说原文', ['原著', '小说原文']],
    ['剧名/片名翻译', ['剧名', '片名', '电影', '电视剧', '剧集', '连续剧', '综艺', 'drama', 'movie', 'film', 'series']],
    ['字幕翻译', ['字幕', 'subtitle', 'srt']],
    ['其他', []]] },
  { name: '音乐', subs: [
    ['歌词', ['歌词', 'lyrics', '副歌', '主歌', 'chorus', 'verse']],
    ['歌名', ['歌名', '单曲', '专辑', 'single', 'album', 'song']],
    ['音乐术语', ['和弦', '音阶', '节奏', '编曲', '旋律']],
    ['创作背景', ['创作', '作词', '作曲']],
    ['其他', []]] },
  { name: '文学', subs: [
    ['小说', ['小说', '章节', '第一章', 'novel']],
    ['散文', ['散文', 'essay']],
    ['诗歌', ['诗歌', '诗', 'poem', 'poetry']],
    ['文学表达', ['修辞', '比喻', '文学']],
    ['其他', []]] },
  { name: '人文', subs: [
    ['历史', ['历史', '朝代', '战争', 'history']],
    ['社会文化', ['社会', '文化', 'culture']],
    ['政治', ['政治', '政府', '选举']],
    ['语言文化', ['语法', '词源', '方言', '语言学']],
    ['其他', []]] },
  { name: '在地', subs: [
    ['旅游观光', ['旅游', '景点', '观光', '夜市', '机场', 'tour']],
    ['物品', ['物品', '食物', '零食', '特产', '菜名']],
    ['日常用语', ['口语', '日常', '问候', '你好', '谢谢', '称谓', '敬语', 'honorific', 'khun', 'slang', '俚语', 'สวัสดี', 'ขอบคุณ', '안녕', '감사']],
    ['风俗习惯', ['风俗', '习俗', '节日', '礼仪']],
    ['其他', []]] },
  { name: '其他', subs: [
    ['未分类语料', []],
    ['翻译随笔', ['随笔', '翻译笔记', '译后记']],
    ['其他', []]] }
]

export const LANG_NAMES: Record<LangCode, string> = { th: '泰语', ko: '韩语', zh: '中文', ja: '日语', en: '英语' }

export function countScripts(text: string): Record<LangCode, number> {
  const c = (re: RegExp) => (text.match(re) || []).length
  return {
    th: c(/[\u0E00-\u0E7F]/g),
    ko: c(/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/g),
    zh: c(/[\u4E00-\u9FFF]/g),
    ja: c(/[\u3040-\u30FF]/g),
    en: c(/[A-Za-z]/g)
  }
}

const hits = (hay: string, kws: string[]) => kws.filter((k) => hay.includes(k.toLowerCase()))

export function classify(text: string, source = '', override?: { topic?: string | null }): Detection {
  const trimmed = text.trim()
  const hay = (text + ' ' + source).toLowerCase()
  const cnt = countScripts(text)
  const total = Object.values(cnt).reduce((a, b) => a + b, 0)
  const langList = (Object.keys(cnt) as LangCode[]).filter((k) => cnt[k] > 0).sort((a, b) => cnt[b] - cnt[a])
  const langs = langList.map((code) => ({ code, pct: Math.round((cnt[code] / total) * 100) }))
  const foreign = langList.filter((k) => k !== 'zh')

  let langNote = ''
  let sourceLang: LangCode | null = null
  let targetLang: LangCode | null = null
  if (total === 0) langNote = '未检测到文字。'
  else if (foreign.length === 0) { langNote = '以中文为主：可能是译文、随笔或中文材料。'; sourceLang = 'zh' }
  else if (langList.includes('zh')) { sourceLang = foreign[0]; targetLang = 'zh'; langNote = `原文语言：${LANG_NAMES[foreign[0]]}；译文语言：中文。` }
  else { sourceLang = foreign[0]; langNote = `原文语言：${LANG_NAMES[foreign[0]]}；译文语言未标注。` }

  const len = trimmed.replace(/\s+/g, '').length
  const compact = !trimmed.includes('\n') && len <= 24
  const type: EntryType = compact ? 'corpus_card' : 'translation_note'
  const typeNote = compact
    ? '内容很短，适合记成语料卡片（词、短语、称谓、固定表达）。'
    : '内容较长或分段，适合记成翻译札记（歌词、台词、段落、译法讨论）。'

  const honor = /^(คุณ|ท่าน|พี่|น้อง)/.test(trimmed) || /(님|씨)$/.test(trimmed)

  const scoreSub = (topic: string, sub: SubRule) => {
    const h = hits(hay, sub[1])
    let score = h.length
    const words = [...h]
    if (topic === '在地' && sub[0] === '日常用语' && honor) { score += 2; words.push('称谓形式') }
    return { score, words }
  }

  let auto: { topic: string; sub: string; sum: number; words: string[] } | null = null
  for (const tp of TOPIC_RULES) {
    let sum = 0
    let best = { name: tp.subs[tp.subs.length - 1][0], score: 0, words: [] as string[] }
    for (const sb of tp.subs) {
      const r = scoreSub(tp.name, sb)
      sum += r.score
      if (r.score > best.score) best = { name: sb[0], score: r.score, words: r.words }
    }
    if (sum > 0 && (!auto || sum > auto.sum)) auto = { topic: tp.name, sub: best.name, sum, words: best.words }
  }

  let confidence: Detection['confidence'] = '低'
  let basis = ''
  if (auto) {
    confidence = auto.sum >= 2 ? '高' : '中'
    basis = '命中：' + auto.words.join('、')
  } else if (total === 0) {
    auto = { topic: '其他', sub: '未分类语料', sum: 0, words: [] }
    basis = '没有可识别的文字。'
  } else if (foreign.length > 0 && compact) {
    auto = { topic: '在地', sub: '日常用语', sum: 0, words: [] }
    basis = '没有关键词，按「外语短词」推测为日常用语。'
  } else if (len > 120) {
    auto = { topic: '其他', sub: '翻译随笔', sum: 0, words: [] }
    basis = '没有关键词，按「篇幅较长」推测为随笔。'
  } else {
    auto = { topic: '其他', sub: '未分类语料', sum: 0, words: [] }
    basis = '没有关键词，先放进未分类，之后可再调整。'
  }

  const topic = override?.topic ?? auto.topic
  let sub = auto.sub
  if (override?.topic && override.topic !== auto.topic) {
    const tp = TOPIC_RULES.find((t) => t.name === override.topic)!
    let best = { name: tp.subs[tp.subs.length - 1][0], score: 0 }
    for (const sb of tp.subs) { const r = scoreSub(tp.name, sb); if (r.score > best.score) best = { name: sb[0], score: r.score } }
    sub = best.name
  }

  let dailyDetail: string | null = null
  if (topic === '在地' && sub === '日常用语') {
    dailyDetail = '日常口语'
    if (honor || hits(hay, ['称谓', '敬语', 'honorific', 'khun']).length) dailyDetail = '称谓与敬语'
    else if (hits(hay, ['gen z', 'genz', 'gen-z']).length) dailyDetail = 'Gen Z 用语'
    else if (hits(hay, ['俚语', 'slang']).length) dailyDetail = '俚语'
    else if (hits(hay, ['网络', '流行语', '梗']).length) dailyDetail = '网络流行语'
    else if (hits(hay, ['语气词', '感叹']).length) dailyDetail = '语气词与感叹词'
    else if (hits(hay, ['方言', '地区', '口音']).length) dailyDetail = '地区性表达'
    else if (hits(hay, ['习语', '惯用', 'idiom']).length) dailyDetail = '习惯用语'
  }

  return { langs, sourceLang, targetLang, langNote, type, typeNote, topic, sub, confidence, basis, dailyDetail }
}
