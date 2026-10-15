<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AssetImage from '@/components/ui/AssetImage.vue'
import { listAssets, uploadImage, setAssetVisibility, updateAssetMeta, deleteAsset, type AssetRow } from '@/services/assets'

const items = ref<AssetRow[]>([])
const vis = ref<'public' | 'private'>('private')
const msg = ref(''); const busy = ref(false)
const onlyOrphans = ref(false)
const file = ref<HTMLInputElement | null>(null)

async function reload() { try { items.value = await listAssets() } catch (e) { msg.value = e instanceof Error ? e.message : '加载失败' } }
onMounted(reload)

async function onFiles(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? []); (e.target as HTMLInputElement).value = ''
  busy.value = true; msg.value = ''
  for (const f of files) { try { await uploadImage(f, vis.value) } catch (x) { msg.value = `${f.name}：${x instanceof Error ? x.message : '上传失败'}` } }
  busy.value = false; await reload()
}
async function toggle(a: AssetRow) {
  const to = a.visibility === 'public' ? 'private' : 'public'
  if (to === 'public' && !confirm('转为公开后，任何人拿到图片链接都能看到它。继续吗？')) return
  if (to === 'private' && a.usage_count > 0 && !confirm('这张图正被条目使用。转为私密后，公开页面里这张图将无法显示。继续吗？')) return
  busy.value = true
  try { await setAssetVisibility(a, to); await reload() } catch (e) { msg.value = e instanceof Error ? e.message : '操作失败' } finally { busy.value = false }
}
async function saveMeta(a: AssetRow) { try { await updateAssetMeta(a.id, { alt_text: a.alt_text, caption: a.caption, credit: a.credit }); msg.value = '已保存。' } catch (e) { msg.value = e instanceof Error ? e.message : '保存失败' } }
async function del(a: AssetRow) { if (!confirm('删除这张图片？')) return; try { await deleteAsset(a); await reload() } catch (e) { msg.value = e instanceof Error ? e.message : '删除失败' } }
const size = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB')
</script>

<template>
  <h1 style="font-size: 44px; line-height: 1.3">媒体</h1>
  <p class="hint" style="margin-top: 6px">只支持 JPG、PNG、WebP，单张不超过 5 MB。文件名会被替换为随机名。</p>
  <div style="margin-top: 22px; display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end">
    <div class="field" style="flex: 0 1 200px"><label for="uv">上传后的可见性</label><select id="uv" v-model="vis" class="select"><option value="private">私密</option><option value="public">公开</option></select></div>
    <button type="button" class="btn btn-ink" :disabled="busy" @click="file?.click()">{{ busy ? '处理中…' : '上传图片' }}</button>
    <input ref="file" type="file" multiple accept="image/jpeg,image/png,image/webp" class="sr" tabindex="-1" @change="onFiles">
    <label class="chk" style="min-height: 44px; margin-left: auto"><input v-model="onlyOrphans" type="checkbox">只看未被使用的</label>
  </div>
  <p v-if="msg" class="save-state" role="status" style="margin-top: 10px">{{ msg }}</p>

  <div class="thumb-grid" style="margin-top: 24px">
    <article v-for="a in items.filter((x) => !onlyOrphans || x.usage_count === 0)" :key="a.id" class="thumb">
      <div class="img"><AssetImage :asset-id="a.id" bare :zoom="false" /></div>
      <div style="padding: 12px">
        <p class="sans" style="font-size: 12px"><span class="badge" :class="{ 'badge-ink': a.visibility === 'private' }">{{ a.visibility === 'public' ? '公开' : '私密' }}</span> {{ size(a.size_bytes) }}<template v-if="a.width"> · {{ a.width }}×{{ a.height }}</template> · 使用 {{ a.usage_count }}</p>
        <input v-model="a.alt_text" class="input" style="margin-top: 8px; min-height: 36px" aria-label="替代文字" placeholder="替代文字">
        <input v-model="a.caption" class="input" style="margin-top: 6px; min-height: 36px" aria-label="图注" placeholder="图注">
        <input v-model="a.credit" class="input" style="margin-top: 6px; min-height: 36px" aria-label="来源署名" placeholder="来源 / 署名">
        <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px">
          <button type="button" class="btn btn-sm" @click="saveMeta(a)">保存</button>
          <button type="button" class="btn btn-sm" :disabled="busy" @click="toggle(a)">{{ a.visibility === 'public' ? '改为私密' : '改为公开' }}</button>
          <button type="button" class="btn btn-sm btn-danger" :disabled="a.usage_count > 0" :title="a.usage_count > 0 ? '正在被条目使用' : ''" @click="del(a)">删除</button>
        </div>
      </div>
    </article>
  </div>
  <p v-if="!items.length" class="empty">还没有图片。</p>
</template>
