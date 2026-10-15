import type { EntryStatus, EntryType, TranslationStatus, SourceRef, Alias } from './types'

export const LANGS = [
  { code: 'zh', name: '中文', native: '中文' },
  { code: 'en', name: '英语', native: 'English' },
  { code: 'th', name: '泰语', native: 'ไทย' },
  { code: 'ko', name: '韩语', native: '한국어' },
  { code: 'ja', name: '日语', native: '日本語' }
] as const

export const langName = (code: string) => LANGS.find((l) => l.code === code)?.name ?? code
export const langNative = (code: string) => LANGS.find((l) => l.code === code)?.native ?? code

export const TYPE_LABEL: Record<EntryType, string> = { corpus_card: '语料卡片', translation_note: '翻译札记' }
export const STATUS_LABEL: Record<EntryStatus, string> = { draft: '草稿', private: '私密', public: '公开' }
export const TSTATUS_LABEL: Record<TranslationStatus, string> = { provisional: '暂译', final: '定稿', verify: '待考证' }
export const ALIAS_LABEL: Record<Alias['alias_type'], string> = {
  romanization: '罗马转写', translation: '译名', spelling: '常见拼写', other: '别名'
}
export const SOURCE_LABEL: Record<SourceRef['source_type'], string> = {
  work: '作品', article: '文章', book: '书籍', video: '视频（外链）', web: '网页', other: '其他'
}
export const TAG_TYPES = ['作品', '人物', '称谓', '语法', '文化语境', '语气', '翻译方法', '日常用语细分', '其他']
export const STATUSES: EntryStatus[] = ['draft', 'private', 'public']
