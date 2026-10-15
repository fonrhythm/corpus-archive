<script setup lang="ts">
import { ref } from 'vue'
import { exportAll, importAll, download, toCsv, toMarkdownZip, toImagesZip, exportFileName, type ExportFile } from '@/services/backup'

const msg = ref(''); const busy = ref(false); const progress = ref('')
const last = ref(localStorage.getItem('last-backup') ?? '')
const stamp = () => { last.value = new Date().toLocaleString('zh-CN'); localStorage.setItem('last-backup', last.value) }

async function run(kind: 'json' | 'csv' | 'md' | 'img') {
  busy.value = true; msg.value = ''; progress.value = ''
  try {
    const f = await exportAll()
    if (kind === 'json') download(exportFileName('content', 'json'), JSON.stringify(f, null, 2), 'application/json')
    if (kind === 'csv') download(exportFileName('corpus', 'csv'), toCsv(f), 'text/csv;charset=utf-8')
    if (kind === 'md') download(exportFileName('markdown', 'zip'), await toMarkdownZip(f))
    if (kind === 'img') download(exportFileName('images', 'zip'), await toImagesZip(f, (d, t) => (progress.value = `下载图片 ${d}/${t}`)))
    stamp(); msg.value = '已导出。'
  } catch (e) { msg.value = e instanceof Error ? e.message : '导出失败' } finally { busy.value = false; progress.value = '' }
}

async function onImport(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ''
  if (!f) return
  if (!confirm('从备份文件恢复内容？同 id 的条目会被覆盖。建议先在测试项目里演练一次。')) return
  busy.value = true; msg.value = ''
  try {
    const data = JSON.parse(await f.text()) as ExportFile
    const r = await importAll(data, (m) => (progress.value = m))
    msg.value = `已恢复 ${r.entries} 条内容。图片文件需要另外放回 Storage（见 README）。`
  } catch (x) { msg.value = x instanceof Error ? x.message : '恢复失败' } finally { busy.value = false; progress.value = '' }
}
</script>

<template>
  <h1 style="font-size: 44px; line-height: 1.3">备份与恢复</h1>
  <p class="sans" style="margin-top: 10px; font-size: 14px; line-height: 1.9; max-width: 680px">
    这里导出的是<b>内容级备份</b>，方便你随时带走自己的资料。完整备份还需要备份数据库与 Storage 里的图片，做法见 README 的「备份与恢复」。
  </p>
  <p class="save-state" style="margin-top: 8px">上次在这台设备上导出：{{ last || '从未' }}</p>

  <div class="stat-row" style="margin-top: 28px; border-top: 4px solid var(--ink)">
    <div class="stat" style="flex: 1 1 260px"><h2 style="font-size: 20px">完整内容（JSON）</h2><p class="hint" style="margin: 6px 0 12px">所有条目、分类、标签、专题、图片清单。可用来恢复。</p><button type="button" class="btn btn-ink" :disabled="busy" @click="run('json')">导出 JSON</button></div>
    <div class="stat" style="flex: 1 1 260px"><h2 style="font-size: 20px">语料表（CSV）</h2><p class="hint" style="margin: 6px 0 12px">原词、译法、别名、义项、来源。用 Excel 或表格软件打开。</p><button type="button" class="btn" :disabled="busy" @click="run('csv')">导出 CSV</button></div>
    <div class="stat" style="flex: 1 1 260px"><h2 style="font-size: 20px">文章（Markdown）</h2><p class="hint" style="margin: 6px 0 12px">每条一个 .md 文件，打包成 zip。</p><button type="button" class="btn" :disabled="busy" @click="run('md')">导出 Markdown</button></div>
    <div class="stat" style="flex: 1 1 260px"><h2 style="font-size: 20px">图片包</h2><p class="hint" style="margin: 6px 0 12px">下载全部图片，附带清单。图片多时会比较慢。</p><button type="button" class="btn" :disabled="busy" @click="run('img')">导出图片</button></div>
  </div>

  <section style="margin-top: 40px; max-width: 680px">
    <div class="rule-top"><h2 style="font-size: 22px">从 JSON 恢复</h2></div>
    <p class="hint" style="margin: 8px 0 12px">会覆盖相同 id 的条目，并补回分类、标签和专题。建议先在测试项目里演练，确认没问题再用到正式项目。</p>
    <label class="btn btn-danger" :style="{ opacity: busy ? .5 : 1 }">选择备份文件<input type="file" accept="application/json,.json" class="sr" :disabled="busy" @change="onImport"></label>
  </section>
  <p v-if="progress" class="save-state" role="status" style="margin-top: 16px">{{ progress }}</p>
  <p v-if="msg" class="save-state" role="status" style="margin-top: 16px">{{ msg }}</p>
</template>
