import type { DocNode } from './types'

/** 富文本 JSON → 纯文本（用于预览摘要、文本导出与版本比较） */
export function docToText(node: DocNode | null | undefined): string {
  if (!node) return ''
  const a = (node.attrs ?? {}) as Record<string, unknown>
  const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : '')
  switch (node.type) {
    case 'text': return node.text ?? ''
    case 'hardBreak': return '\n'
    case 'bilingualPair': return [s('source'), s('target'), s('note')].filter(Boolean).join('\n') + '\n'
    case 'wordBreakdown':
      return ((a.items as Record<string, string>[]) ?? []).map((i) => [i.token, i.meaning, i.note].filter(Boolean).join(' — ')).join('\n') + '\n'
    case 'candidates':
      return ((a.items as Record<string, string>[]) ?? []).map((i) => `${i.chosen ? '★ ' : ''}${[i.text, i.note].filter(Boolean).join(' — ')}`).join('\n') + '\n'
    case 'sourceQuote': return [s('text'), s('from')].filter(Boolean).join(' — ') + '\n'
    case 'image': return [s('caption'), s('alt')].filter(Boolean).join(' ') + '\n'
  }
  const inner = (node.content ?? []).map(docToText).join(node.type === 'doc' || /List|table|noteBlock/.test(node.type) ? '' : '')
  return ['paragraph', 'heading', 'listItem', 'blockquote', 'tableRow'].includes(node.type) ? inner + '\n' : inner
}

/** 富文本 JSON → Markdown（导出用；图片以 asset:// 占位，随图片包另行提供） */
export function docToMarkdown(node: DocNode | null | undefined): string {
  if (!node) return ''
  const a = (node.attrs ?? {}) as Record<string, unknown>
  const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : '')
  const kids = (sep = '') => (node.content ?? []).map(docToMarkdown).join(sep)
  switch (node.type) {
    case 'doc': return kids('\n\n').trim() + '\n'
    case 'paragraph': return kids()
    case 'heading': return '#'.repeat(Number(a.level ?? 2)) + ' ' + kids()
    case 'text': {
      let t = node.text ?? ''
      for (const m of node.marks ?? []) {
        if (m.type === 'bold') t = `**${t}**`
        else if (m.type === 'italic') t = `*${t}*`
        else if (m.type === 'code') t = '`' + t + '`'
        else if (m.type === 'link') t = `[${t}](${String((m.attrs ?? {}).href ?? '')})`
      }
      return t
    }
    case 'hardBreak': return '  \n'
    case 'bulletList': return (node.content ?? []).map((li) => '- ' + docToMarkdown(li).replace(/\n/g, '\n  ')).join('\n')
    case 'orderedList': return (node.content ?? []).map((li, i) => `${i + 1}. ` + docToMarkdown(li).replace(/\n/g, '\n   ')).join('\n')
    case 'listItem': return kids('\n')
    case 'blockquote': return kids('\n\n').split('\n').map((l) => '> ' + l).join('\n')
    case 'horizontalRule': return '---'
    case 'noteBlock': {
      const label = ({ fact: '语言事实', inference: '情境推断', choice: '译者选择' } as Record<string, string>)[s('kind')] ?? '说明'
      return `**【${label}】**\n\n` + kids('\n\n')
    }
    case 'bilingualPair':
      return `| 原文（${s('sourceLang')}） | 译文（${s('targetLang')}） |\n| --- | --- |\n| ${s('source').replace(/\n/g, '<br>')} | ${s('target').replace(/\n/g, '<br>')} |` + (s('note') ? `\n\n> ${s('note')}` : '')
    case 'wordBreakdown':
      return '| 词形 | 词义 | 说明 |\n| --- | --- | --- |\n' +
        ((a.items as Record<string, string>[]) ?? []).map((i) => `| ${i.token ?? ''} | ${i.meaning ?? ''} | ${i.note ?? ''} |`).join('\n')
    case 'candidates':
      return '候选译法：\n' + ((a.items as Record<string, unknown>[]) ?? []).map((i) => `- ${i.chosen ? '**（最终）** ' : ''}${i.text ?? ''}${i.note ? ' — ' + i.note : ''}`).join('\n')
    case 'sourceQuote': return `> ${s('text')}\n> — ${s('from')}`
    case 'image': return `![${s('alt')}](asset://${s('assetId')})` + (s('caption') ? `\n*${s('caption')}*` : '')
    case 'table': return (node.content ?? []).map((r, i) => {
      const cells = (r.content ?? []).map((c) => docToMarkdown(c).replace(/\n+/g, ' ').replace(/\|/g, '\\|'))
      return '| ' + cells.join(' | ') + ' |' + (i === 0 ? '\n| ' + cells.map(() => '---').join(' | ') + ' |' : '')
    }).join('\n')
    case 'tableCell': case 'tableHeader': return kids(' ')
    default: return kids('\n')
  }
}

/** 取出文档里引用到的所有图片 id */
export function collectAssetIds(node: DocNode | null | undefined, out = new Set<string>()): Set<string> {
  if (!node) return out
  if (node.type === 'image' && typeof node.attrs?.assetId === 'string') out.add(node.attrs.assetId)
  node.content?.forEach((c) => collectAssetIds(c, out))
  return out
}
