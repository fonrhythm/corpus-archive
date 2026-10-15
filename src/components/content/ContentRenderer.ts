import { defineComponent, h, type PropType, type VNode } from 'vue'
import type { DocNode } from '@/lib/types'
import { safeUrl, scriptLang } from '@/lib/text'
import AssetImage from '@/components/ui/AssetImage.vue'
import PairBlock from './PairBlock.vue'
import BreakdownBlock from './BreakdownBlock.vue'
import CandidatesBlock from './CandidatesBlock.vue'
import QuoteBlock from './QuoteBlock.vue'
import NoteBlock from './NoteBlock.vue'

type Attrs = Record<string, unknown>
const str = (a: Attrs | undefined, k: string) => (typeof a?.[k] === 'string' ? (a![k] as string) : undefined)

function renderText(n: DocNode): VNode | string {
  let out: VNode | string = n.text ?? ''
  const lang = scriptLang(n.text)
  for (const m of n.marks ?? []) {
    if (m.type === 'bold') out = h('strong', {}, [out])
    else if (m.type === 'italic') out = h('em', {}, [out])
    else if (m.type === 'code') out = h('code', {}, [out])
    else if (m.type === 'link') {
      const href = safeUrl(str(m.attrs, 'href'))
      out = href ? h('a', { href, target: '_blank', rel: 'noopener noreferrer nofollow' }, [out]) : out
    }
  }
  return lang && typeof out === 'string' ? h('span', { lang }, [out]) : out
}

function kids(n: DocNode): (VNode | string)[] { return (n.content ?? []).map(renderNode) }

/** 递归渲染 TipTap JSON。所有文字都作为 Vue 文本节点输出，不使用 v-html，因此不存在 HTML 注入。 */
export function renderNode(n: DocNode): VNode | string {
  const a = n.attrs as Attrs | undefined
  switch (n.type) {
    case 'text': return renderText(n)
    case 'paragraph': return h('p', {}, kids(n))
    case 'heading': { const l = Math.min(Math.max(Number(a?.level ?? 2), 2), 4); return h('h' + l, {}, kids(n)) }
    case 'bulletList': return h('ul', {}, kids(n))
    case 'orderedList': return h('ol', {}, kids(n))
    case 'listItem': return h('li', {}, kids(n))
    case 'blockquote': return h('blockquote', {}, kids(n))
    case 'horizontalRule': return h('hr')
    case 'hardBreak': return h('br')
    case 'table': return h('table', {}, [h('tbody', {}, kids(n))])
    case 'tableRow': return h('tr', {}, kids(n))
    case 'tableHeader': return h('th', {}, kids(n))
    case 'tableCell': return h('td', {}, kids(n))
    case 'image': return h(AssetImage, { assetId: str(a, 'assetId'), alt: str(a, 'alt'), caption: str(a, 'caption'), credit: str(a, 'credit') })
    case 'bilingualPair': return h(PairBlock, { source: str(a, 'source'), target: str(a, 'target'), sourceLang: str(a, 'sourceLang'), targetLang: str(a, 'targetLang'), note: str(a, 'note') })
    case 'wordBreakdown': return h(BreakdownBlock, { items: (a?.items as never) ?? [] })
    case 'candidates': return h(CandidatesBlock, { items: (a?.items as never) ?? [] })
    case 'sourceQuote': return h(QuoteBlock, { text: str(a, 'text'), from: str(a, 'from') })
    case 'noteBlock': return h(NoteBlock, { kind: str(a, 'kind') }, { default: () => kids(n) })
    default: return h('div', {}, kids(n))
  }
}

export default defineComponent({
  name: 'ContentRenderer',
  props: { doc: { type: Object as PropType<DocNode | null>, default: null } },
  setup(props) {
    return () => (props.doc?.content?.length ? h('div', { class: 'prose' }, (props.doc.content ?? []).map(renderNode)) : null)
  }
})
