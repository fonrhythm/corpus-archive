export type EntryType = 'corpus_card' | 'translation_note'
export type EntryStatus = 'draft' | 'private' | 'public'
export type TranslationStatus = 'provisional' | 'final' | 'verify'
export type LangRole = 'source' | 'target' | 'related'

export interface Category {
  id: string; parent_id: string | null; name: string; slug: string
  description: string | null; sort_order: number; is_active: boolean
}
export interface Tag { id: string; name: string; slug: string; type: string }

export interface Asset {
  id: string; bucket: 'public-media' | 'private-media'; storage_path: string
  mime_type: string; size_bytes: number; width: number | null; height: number | null
  alt_text: string | null; caption: string | null; credit: string | null
  visibility: 'public' | 'private'; created_at: string
}

export type MatchSource = 'title' | 'alias' | 'translation' | 'subtitle' | 'summary' | 'tag' | 'source' | 'body' | 'fuzzy'

/** search_entries 返回的一行 */
export interface EntryRow {
  id: string; slug: string; type: EntryType; title: string; subtitle: string | null
  summary: string | null; status: EntryStatus; translation_status: TranslationStatus
  primary_category_id: string | null; cover_asset_id: string | null
  personal_translation: string | null; updated_at: string; published_at: string | null
  rank: number; match_source: MatchSource | null; snippet: string | null; total_count: number
}

export interface Alias { text: string; language_code: string | null; alias_type: 'romanization' | 'translation' | 'spelling' | 'other' }
export interface Sense { meaning: string; context: string | null; register: string | null; personal_translation: string | null }
export interface SourceRef {
  title: string | null; creator: string | null; work_title: string | null; url: string | null
  source_type: 'work' | 'article' | 'book' | 'video' | 'web' | 'other'; platform: string | null; note: string | null
}
export interface LangRef { language_code: string; role: LangRole }
export interface RelatedRef { related_entry_id: string; relation_type: string }

export interface DocNode {
  type: string
  attrs?: Record<string, unknown>
  content?: DocNode[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  text?: string
}

/** 与数据库 entry_payload() / save_entry() 使用同一结构 */
export interface EntryPayload {
  id?: string
  slug: string
  type: EntryType
  title: string
  subtitle: string | null
  summary: string | null
  status: EntryStatus
  translation_status: TranslationStatus
  primary_category_id: string | null
  cover_asset_id: string | null
  personal_translation: string | null
  translator_credit: string | null
  copyright_note: string | null
  material_date: string | null
  needs_verify: boolean
  remarks: string | null
  content_json: DocNode
  languages: LangRef[]
  tag_ids: string[]
  aliases: Alias[]
  senses: Sense[]
  sources: SourceRef[]
  collection_ids: string[]
  related: RelatedRef[]
  created_at?: string
  updated_at?: string
  published_at?: string | null
  deleted_at?: string | null
}

export interface CollectionRow {
  id: string; slug: string; title: string; description: string | null
  status: EntryStatus; cover_asset_id: string | null; sort_order: number
}

export interface VersionRow { id: string; version_no: number; created_at: string; change_note: string | null; snapshot_json: EntryPayload }

export const emptyDoc = (): DocNode => ({ type: 'doc', content: [{ type: 'paragraph' }] })
