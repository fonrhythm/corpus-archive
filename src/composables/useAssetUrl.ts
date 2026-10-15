import { ref, watch, onBeforeUnmount, type Ref } from 'vue'
import { getAsset, assetUrl } from '@/services/assets'
import type { Asset } from '@/lib/types'

/** 根据图片 id 解析出可显示的 URL；私密图片会在签名过期前自动刷新。 */
export function useAssetUrl(id: Ref<string | null | undefined>) {
  const url = ref<string | null>(null)
  const asset = ref<Asset | null>(null)
  const failed = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function load() {
    url.value = null; asset.value = null; failed.value = false
    if (timer) clearTimeout(timer)
    if (!id.value) return
    const a = await getAsset(id.value)
    if (!a) { failed.value = true; return }
    asset.value = a
    url.value = await assetUrl(a)
    if (!url.value) failed.value = true
    if (a.visibility === 'private') timer = setTimeout(load, 8 * 60_000)
  }
  watch(id, load, { immediate: true })
  onBeforeUnmount(() => { if (timer) clearTimeout(timer) })
  return { url, asset, failed, reload: load }
}
