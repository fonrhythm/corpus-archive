import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { safeUrl } from '@/lib/text'
import BilingualPairView from './BilingualPairView.vue'
import WordBreakdownView from './WordBreakdownView.vue'
import CandidatesView from './CandidatesView.vue'
import SourceQuoteView from './SourceQuoteView.vue'
import NoteBlockView from './NoteBlockView.vue'
import ImageView from './ImageView.vue'

/** 结构化区块的 JSON 形状同时被数据库函数（派生 segments、检索文本）与前台渲染器使用，改名需三处同步。 */
const block = (name: string, tag: string, attrs: Record<string, { default: unknown }>, view: unknown, extra: Record<string, unknown> = {}) =>
  Node.create({
    name, group: 'block', atom: true, draggable: true, selectable: true, ...extra,
    addAttributes() { return attrs },
    parseHTML() { return [{ tag: `div[data-type="${tag}"]` }] },
    renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': tag })] },
    addNodeView() { return VueNodeViewRenderer(view as never) }
  })

export const BilingualPair = block('bilingualPair', 'bilingual-pair',
  { source: { default: '' }, target: { default: '' }, sourceLang: { default: '' }, targetLang: { default: '' }, note: { default: '' } }, BilingualPairView)
export const WordBreakdown = block('wordBreakdown', 'word-breakdown',
  { items: { default: [{ token: '', meaning: '', note: '' }] } }, WordBreakdownView)
export const Candidates = block('candidates', 'candidates',
  { items: { default: [{ text: '', note: '', chosen: false }] } }, CandidatesView)
export const SourceQuote = block('sourceQuote', 'source-quote', { text: { default: '' }, from: { default: '' } }, SourceQuoteView)
export const ImageBlock = block('image', 'image',
  { assetId: { default: '' }, alt: { default: '' }, caption: { default: '' }, credit: { default: '' } }, ImageView)

export const NoteBlock = Node.create({
  name: 'noteBlock', group: 'block', content: 'block+', defining: true, draggable: true,
  addAttributes() { return { kind: { default: 'fact' } } },
  parseHTML() { return [{ tag: 'div[data-type="note-block"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'note-block' }), 0] },
  addNodeView() { return VueNodeViewRenderer(NoteBlockView as never) }
})

export const editorExtensions = () => [
  StarterKit.configure({ codeBlock: false, strike: false, heading: { levels: [2, 3] } }),
  Link.configure({
    openOnClick: false, autolink: false, protocols: ['http', 'https', 'mailto'],
    validate: (href: string) => !!safeUrl(href),
    HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' }
  }),
  Placeholder.configure({ placeholder: '在这里写下正文，或从上方插入「原译对照」「词语拆解」等区块……' }),
  Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
  BilingualPair, WordBreakdown, Candidates, SourceQuote, NoteBlock, ImageBlock
]
