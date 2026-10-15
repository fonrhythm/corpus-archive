/** 统一 Unicode 规范化为 NFC；递归处理对象与数组里的所有字符串。 */
export function nfcDeep<T>(v: T): T {
  if (typeof v === 'string') return v.normalize('NFC') as unknown as T
  if (Array.isArray(v)) return v.map(nfcDeep) as unknown as T
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = nfcDeep(val)
    return out as T
  }
  return v
}

/** 只放行 http / https / mailto，其余（javascript: 等）一律丢弃。 */
export function safeUrl(u: string | null | undefined): string | null {
  if (!u) return null
  const s = u.trim()
  if (!/^(https?:|mailto:)/i.test(s)) return null
  try { new URL(s); return s } catch { return null }
}

/** slug：保留字母、数字（含中日韩泰），空白换成连字符，去掉 URL 里有歧义的符号。 */
export function slugify(input: string): string {
  const s = input.normalize('NFC').trim().toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[/?#%\\"'`<>|*:;,.!！？，。、：；（）()[\]{}《》「」『』“”‘’]+/g, '')
    .replace(/-+/g, '-').replace(/^-|-$/g, '')
  return s.slice(0, 80)
}

export const randomSlug = () => 'e-' + Math.random().toString(36).slice(2, 10)

/** 把文本按检索词切成「命中 / 未命中」片段。输出由 Vue 当文本渲染，不经过 HTML，因此无 XSS 风险。 */
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const q = query.normalize('NFC').trim()
  if (!q || !text) return [{ text, hit: false }]
  const lower = text.toLowerCase(), lq = q.toLowerCase()
  const parts: { text: string; hit: boolean }[] = []
  let i = 0
  while (i < text.length) {
    const j = lower.indexOf(lq, i)
    if (j < 0) { parts.push({ text: text.slice(i), hit: false }); break }
    if (j > i) parts.push({ text: text.slice(i, j), hit: false })
    parts.push({ text: text.slice(j, j + q.length), hit: true })
    i = j + q.length
  }
  return parts
}

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined
  const d = (...a: A) => { if (t) clearTimeout(t); t = setTimeout(() => fn(...a), ms) }
  d.cancel = () => { if (t) clearTimeout(t) }
  d.flush = (...a: A) => { if (t) clearTimeout(t); fn(...a) }
  return d
}

/** 根据文字自动给出 lang 属性（让浏览器选对字体与断词） */
export function scriptLang(s: string | null | undefined): 'th' | 'ko' | 'ja' | undefined {
  if (!s) return undefined
  if (/[\u0E00-\u0E7F]/.test(s)) return 'th'
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(s)) return 'ko'
  if (/[\u3040-\u30FF]/.test(s)) return 'ja'
  return undefined
}

export async function copyText(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true } catch {
    const ta = document.createElement('textarea')
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy'); ta.remove(); return ok
  }
}
