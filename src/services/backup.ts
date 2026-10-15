import JSZip from 'jszip'
import { supabase } from '@/lib/supabase'
import { docToMarkdown, docToText } from '@/lib/doc'
import { saveEntry } from './api'
import type { EntryPayload, Asset, Category, Tag, CollectionRow } from '@/lib/types'

export interface ExportFile {
  format: 'corpus-archive-export'; version: 1; exported_at: string
  site_settings: { key: string; value: string }[]
  categories: Category[]; tags: Tag[]; collections: CollectionRow[]; assets: Asset[]; entries: EntryPayload[]
}

export async function exportAll(): Promise<ExportFile> {
  const { data, error } = await supabase.rpc('export_all')
  if (error) throw new Error(error.message)
  return data as ExportFile
}

export function download(name: string, data: Blob | string, mime = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

const stamp = () => new Date().toISOString().slice(0, 10)
const csvCell = (v: unknown) => {
  let s = v == null ? '' : String(v)
  // 防止表格软件把以 = + - @ 开头的内容当公式执行
  if (/^[=+\-@]/.test(s)) s = "'" + s
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function toCsv(f: ExportFile): string {
  const cat = new Map(f.categories.map((c) => [c.id, c.name]))
  const head = ['id', 'slug', '类型', '状态', '标题', '副标题', '个人译法', '主题', '语言', '别名/转写', '义项', '来源', '更新时间']
  const rows = f.entries.filter((e) => !e.deleted_at).map((e) => [
    e.id, e.slug, e.type === 'corpus_card' ? '语料卡片' : '翻译札记', e.status, e.title, e.subtitle, e.personal_translation,
    e.primary_category_id ? cat.get(e.primary_category_id) : '',
    e.languages.map((l) => `${l.language_code}:${l.role}`).join(' '),
    e.aliases.map((a) => a.text).join(' | '),
    e.senses.map((s) => s.meaning).join(' | '),
    e.sources.map((s) => [s.work_title, s.title, s.url].filter(Boolean).join(' ')).join(' | '),
    e.updated_at
  ])
  // 开头加 BOM，Excel 才能正确显示泰文 / 韩文 / 中文
  return '\ufeff' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

export async function toMarkdownZip(f: ExportFile): Promise<Blob> {
  const zip = new JSZip()
  for (const e of f.entries.filter((x) => !x.deleted_at)) {
    const fm = [
      '---', `id: ${e.id}`, `slug: ${e.slug}`, `type: ${e.type}`, `status: ${e.status}`,
      `title: ${JSON.stringify(e.title)}`, e.subtitle ? `subtitle: ${JSON.stringify(e.subtitle)}` : '',
      e.personal_translation ? `personal_translation: ${JSON.stringify(e.personal_translation)}` : '',
      `languages: ${JSON.stringify(e.languages)}`, `aliases: ${JSON.stringify(e.aliases.map((a) => a.text))}`, '---', ''
    ].filter((l) => l !== '' || true).join('\n')
    const senses = e.senses.length ? '\n\n## 义项\n' + e.senses.map((s, i) => `${i + 1}. ${s.meaning}${s.context ? `（${s.context}）` : ''}`).join('\n') : ''
    zip.file(`entries/${e.slug.replace(/[\\/:*?"<>|]/g, '_')}.md`, fm + '\n' + docToMarkdown(e.content_json) + senses + '\n')
  }
  return zip.generateAsync({ type: 'blob' })
}

/** 图片包：逐张下载 + 资源清单（manifest.json 记录每张图的 alt / 来源 / 可见性）。 */
export async function toImagesZip(f: ExportFile, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify(f.assets, null, 2))
  let done = 0
  for (const a of f.assets) {
    const { data } = await supabase.storage.from(a.bucket).download(a.storage_path)
    if (data) zip.file(`images/${a.id}.${a.mime_type.split('/')[1].replace('jpeg', 'jpg')}`, data)
    onProgress?.(++done, f.assets.length)
  }
  return zip.generateAsync({ type: 'blob' })
}

export const exportFileName = (kind: string, ext: string) => `corpus-archive-${kind}-${stamp()}.${ext}`

/** 从 JSON 导出恢复内容。建议只在测试环境先演练。图片文件需另行放回 Storage。 */
export async function importAll(f: ExportFile, onProgress?: (msg: string) => void): Promise<{ entries: number }> {
  if (f.format !== 'corpus-archive-export') throw new Error('这不是本站导出的文件。')
  const up = async (table: string, rows: unknown[], conflict = 'id') => {
    if (!rows.length) return
    const { error } = await supabase.from(table).upsert(rows as never[], { onConflict: conflict })
    if (error) throw new Error(`${table}：${error.message}`)
  }
  onProgress?.('恢复分类与标签…')
  const cats = [...f.categories].sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0))
  await up('categories', cats.filter((c) => !c.parent_id)); await up('categories', cats.filter((c) => c.parent_id))
  await up('tags', f.tags)
  await up('site_settings', f.site_settings, 'key')
  await up('collections', f.collections)
  onProgress?.('恢复图片记录…')
  await up('assets', f.assets)
  // 两遍：第一遍写入条目，第二遍补上互相引用的关联
  for (let pass = 1; pass <= 2; pass++) {
    let i = 0
    for (const e of f.entries) {
      onProgress?.(`恢复条目（第 ${pass}/2 遍）${++i}/${f.entries.length}`)
      await saveEntry(e)
    }
  }
  return { entries: f.entries.length }
}

export { docToText }
