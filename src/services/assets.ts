import { supabase, BUCKETS, MAX_UPLOAD_BYTES, ALLOWED_MIME } from '@/lib/supabase'
import type { Asset } from '@/lib/types'

const cache = new Map<string, Asset>()
const signed = new Map<string, { url: string; exp: number }>()

export class UploadError extends Error {}

export async function getAsset(id: string): Promise<Asset | null> {
  const hit = cache.get(id)
  if (hit) return hit
  const { data } = await supabase.from('assets').select('*').eq('id', id).maybeSingle()
  if (data) cache.set(id, data as Asset)
  return (data as Asset) ?? null
}
export const forgetAsset = (id: string) => { cache.delete(id); signed.delete(id) }

/** 公开图片用公开 URL；私密图片只用 10 分钟有效的签名 URL。 */
export async function assetUrl(a: Asset): Promise<string | null> {
  if (a.visibility === 'public') return supabase.storage.from(BUCKETS.public).getPublicUrl(a.storage_path).data.publicUrl
  const hit = signed.get(a.id)
  if (hit && hit.exp > Date.now() + 30_000) return hit.url
  const { data, error } = await supabase.storage.from(BUCKETS.private).createSignedUrl(a.storage_path, 600)
  if (error || !data) return null
  signed.set(a.id, { url: data.signedUrl, exp: Date.now() + 600_000 })
  return data.signedUrl
}

function imageSize(file: File): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const u = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(u) }
    img.onerror = () => { resolve(null); URL.revokeObjectURL(u) }
    img.src = u
  })
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export async function uploadImage(file: File, visibility: 'public' | 'private', meta: Partial<Pick<Asset, 'alt_text' | 'caption' | 'credit'>> = {}): Promise<Asset> {
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) throw new UploadError('只支持 JPG、PNG、WebP 图片。')
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError(`图片不能超过 ${MAX_UPLOAD_BYTES / 1024 / 1024} MB。`)
  const bucket = visibility === 'public' ? BUCKETS.public : BUCKETS.private
  const d = new Date()
  // 随机文件名：不使用原始文件名，避免泄露信息，也避免被猜到。
  const path = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${EXT[file.type]}`
  const up = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false })
  if (up.error) throw new UploadError('上传失败：' + up.error.message)
  const size = await imageSize(file)
  const { data: u } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('assets').insert({
    bucket, storage_path: path, mime_type: file.type, size_bytes: file.size, visibility,
    width: size?.w ?? null, height: size?.h ?? null, created_by: u.user?.id ?? null, ...meta
  }).select('*').single()
  if (error || !data) {
    await supabase.storage.from(bucket).remove([path])
    throw new UploadError('记录图片信息失败：' + (error?.message ?? ''))
  }
  cache.set(data.id, data as Asset)
  return data as Asset
}

/** 在公开桶与私有桶之间移动图片：先复制 → 更新记录 → 再删旧文件，任何一步失败都不丢图。 */
export async function setAssetVisibility(a: Asset, vis: 'public' | 'private'): Promise<Asset> {
  if (a.visibility === vis) return a
  const from = a.bucket, to = vis === 'public' ? BUCKETS.public : BUCKETS.private
  const dl = await supabase.storage.from(from).download(a.storage_path)
  if (dl.error || !dl.data) throw new UploadError('读取原图失败：' + (dl.error?.message ?? ''))
  const up = await supabase.storage.from(to).upload(a.storage_path, dl.data, { contentType: a.mime_type, upsert: true })
  if (up.error) throw new UploadError('复制图片失败：' + up.error.message)
  const { data, error } = await supabase.from('assets').update({ bucket: to, visibility: vis }).eq('id', a.id).select('*').single()
  if (error || !data) {
    await supabase.storage.from(to).remove([a.storage_path])
    throw new UploadError('更新图片状态失败：' + (error?.message ?? ''))
  }
  await supabase.storage.from(from).remove([a.storage_path])
  forgetAsset(a.id)
  cache.set(a.id, data as Asset)
  return data as Asset
}

export async function convertAssetsPublic(ids: string[]): Promise<void> {
  for (const id of ids) {
    const a = await getAsset(id)
    if (a) await setAssetVisibility(a, 'public')
  }
}

/** 条目改为非公开后：把只被它使用的公开图片收回私有桶，避免私密内容的图片还能通过公开链接访问。 */
export async function demoteUnusedAssets(entryId: string): Promise<number> {
  const { data: links } = await supabase.from('entry_assets').select('asset_id').eq('entry_id', entryId)
  let moved = 0
  for (const l of links ?? []) {
    const a = await getAsset(l.asset_id as string)
    if (!a || a.visibility !== 'public') continue
    const { data: other } = await supabase.from('entry_assets')
      .select('entry_id, entries!inner(status, deleted_at)').eq('asset_id', a.id).neq('entry_id', entryId)
      .eq('entries.status', 'public').is('entries.deleted_at', null).limit(1)
    const { data: cov } = await supabase.from('collections').select('id').eq('cover_asset_id', a.id).eq('status', 'public').limit(1)
    if ((other?.length ?? 0) === 0 && (cov?.length ?? 0) === 0) { await setAssetVisibility(a, 'private'); moved++ }
  }
  return moved
}

export interface AssetRow extends Asset { usage_count: number }
export async function listAssets(): Promise<AssetRow[]> {
  const { data, error } = await supabase.from('assets').select('*, entry_assets(count)').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...(r as unknown as Asset),
    usage_count: ((r.entry_assets as { count: number }[] | undefined)?.[0]?.count) ?? 0
  }))
}

export async function updateAssetMeta(id: string, patch: Partial<Pick<Asset, 'alt_text' | 'caption' | 'credit'>>) {
  const { error } = await supabase.from('assets').update(patch).eq('id', id)
  if (error) throw error
  cache.delete(id)
}

/** 只删除没有被任何条目引用的图片（清理孤儿文件）。 */
export async function deleteAsset(a: Asset): Promise<void> {
  const { count } = await supabase.from('entry_assets').select('*', { count: 'exact', head: true }).eq('asset_id', a.id)
  if ((count ?? 0) > 0) throw new UploadError('这张图片还被条目使用，不能删除。')
  await supabase.storage.from(a.bucket).remove([a.storage_path])
  const { error } = await supabase.from('assets').delete().eq('id', a.id)
  if (error) throw error
  forgetAsset(a.id)
}
