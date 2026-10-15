-- =====================================================================
-- 0004 Storage：公开图片 / 私密图片分桶
--   public-media  公开桶：随机文件名，可直接访问
--   private-media 私有桶：只有管理员能读，前端使用短时效签名 URL
-- 上传限制：JPG / PNG / WebP，单文件 ≤ 5 MB
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-media',  'public-media',  true,  5242880, array['image/jpeg','image/png','image/webp']),
  ('private-media', 'private-media', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 只有管理员能读写 Storage 对象（公开桶的文件通过公开 URL 访问，不依赖这里的读策略）
create policy "media_admin_select" on storage.objects for select to authenticated
  using (bucket_id in ('public-media','private-media') and public.is_admin());
create policy "media_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('public-media','private-media') and public.is_admin());
create policy "media_admin_update" on storage.objects for update to authenticated
  using (bucket_id in ('public-media','private-media') and public.is_admin())
  with check (bucket_id in ('public-media','private-media') and public.is_admin());
create policy "media_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id in ('public-media','private-media') and public.is_admin());
