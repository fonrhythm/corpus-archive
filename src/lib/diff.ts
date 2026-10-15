/** 行级 LCS 差异，用来比较两个版本的正文。 */
export interface DiffLine { kind: 'same' | 'add' | 'del'; text: string }

export function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split('\n'), B = b.split('\n')
  const n = A.length, m = B.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: DiffLine[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ kind: 'same', text: A[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: 'del', text: A[i++] })
    else out.push({ kind: 'add', text: B[j++] })
  }
  while (i < n) out.push({ kind: 'del', text: A[i++] })
  while (j < m) out.push({ kind: 'add', text: B[j++] })
  return out
}
