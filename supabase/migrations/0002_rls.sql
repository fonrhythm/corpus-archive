-- =====================================================================
-- 0002 访问控制（RLS）
-- 原则：所有表默认启用 RLS，逐表显式授权。
--   public  内容：匿名可读
--   draft / private：仅管理员可读
--   写入：仅管理员
-- =====================================================================

-- ---------- 判断函数 ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
$$;

create or replace function public.entry_is_public(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.entries e where e.id = eid and e.status = 'public' and e.deleted_at is null)
$$;

create or replace function public.collection_is_public(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.collections c where c.id = cid and c.status = 'public')
$$;

-- ---------- 先收回默认授权，再显式授予 ----------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

grant usage on schema public to anon, authenticated;
grant usage on schema extensions to anon, authenticated;

grant select on public.site_settings, public.categories, public.tags, public.assets, public.entries,
  public.entry_slug_history, public.entry_languages, public.entry_tags, public.entry_aliases,
  public.entry_segments, public.entry_senses, public.sources, public.entry_assets,
  public.collections, public.collection_entries, public.entry_relations,
  public.entry_search_documents to anon, authenticated;
grant select on public.profiles, public.entry_versions, public.entry_private_notes to authenticated;

grant insert, update, delete on public.site_settings, public.categories, public.tags, public.assets,
  public.entries, public.entry_slug_history, public.entry_languages, public.entry_tags, public.entry_aliases,
  public.entry_segments, public.entry_senses, public.sources, public.entry_assets, public.collections,
  public.collection_entries, public.entry_relations, public.entry_versions, public.entry_private_notes,
  public.entry_search_documents to authenticated;
-- profiles：客户端没有任何写权限

grant execute on function public.is_admin(), public.entry_is_public(uuid), public.collection_is_public(uuid)
  to anon, authenticated;

-- ---------- 启用 RLS ----------
alter table public.profiles               enable row level security;
alter table public.site_settings          enable row level security;
alter table public.categories             enable row level security;
alter table public.tags                   enable row level security;
alter table public.assets                 enable row level security;
alter table public.entries                enable row level security;
alter table public.entry_slug_history     enable row level security;
alter table public.entry_languages        enable row level security;
alter table public.entry_tags             enable row level security;
alter table public.entry_aliases          enable row level security;
alter table public.entry_segments         enable row level security;
alter table public.entry_senses           enable row level security;
alter table public.sources                enable row level security;
alter table public.entry_assets           enable row level security;
alter table public.collections            enable row level security;
alter table public.collection_entries     enable row level security;
alter table public.entry_relations        enable row level security;
alter table public.entry_versions         enable row level security;
alter table public.entry_private_notes    enable row level security;
alter table public.entry_search_documents enable row level security;

-- ---------- profiles：只能看自己的一行；任何人都不能通过客户端写入 ----------
create policy profiles_self_read on public.profiles for select to authenticated using (user_id = auth.uid());

-- ---------- 管理员全权（逐表） ----------
do $$
declare t text;
begin
  foreach t in array array[
    'site_settings','categories','tags','assets','entries','entry_slug_history','entry_languages','entry_tags',
    'entry_aliases','entry_segments','entry_senses','sources','entry_assets','collections','collection_entries',
    'entry_relations','entry_versions','entry_private_notes','entry_search_documents'
  ] loop
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
                   t || '_admin_all', t);
  end loop;
end $$;

-- 管理员读取 profiles 自己即可，无需额外策略。

-- ---------- 匿名 / 普通登录用户：只读公开内容 ----------
create policy site_settings_public_read on public.site_settings for select to anon, authenticated using (true);

create policy categories_public_read on public.categories for select to anon, authenticated using (is_active);

-- 标签：仅当被至少一个公开条目使用时可见，避免泄露私密条目的标签名
create policy tags_public_read on public.tags for select to anon, authenticated using (
  exists (select 1 from public.entry_tags et where et.tag_id = tags.id and public.entry_is_public(et.entry_id))
);

create policy entries_public_read on public.entries for select to anon, authenticated
  using (status = 'public' and deleted_at is null);

create policy entry_slug_history_public_read on public.entry_slug_history for select to anon, authenticated
  using (public.entry_is_public(entry_id));
create policy entry_languages_public_read on public.entry_languages for select to anon, authenticated
  using (public.entry_is_public(entry_id));
create policy entry_tags_public_read on public.entry_tags for select to anon, authenticated
  using (public.entry_is_public(entry_id));
create policy entry_aliases_public_read on public.entry_aliases for select to anon, authenticated
  using (public.entry_is_public(entry_id));
create policy entry_segments_public_read on public.entry_segments for select to anon, authenticated
  using (public.entry_is_public(entry_id));
create policy entry_senses_public_read on public.entry_senses for select to anon, authenticated
  using (public.entry_is_public(entry_id));
create policy sources_public_read on public.sources for select to anon, authenticated
  using (public.entry_is_public(entry_id));
create policy entry_assets_public_read on public.entry_assets for select to anon, authenticated
  using (public.entry_is_public(entry_id));
create policy entry_search_documents_public_read on public.entry_search_documents for select to anon, authenticated
  using (public.entry_is_public(entry_id));

-- 资源记录：公开图片可读；私密图片记录只给管理员
create policy assets_public_read on public.assets for select to anon, authenticated using (visibility = 'public');

create policy collections_public_read on public.collections for select to anon, authenticated using (status = 'public');
create policy collection_entries_public_read on public.collection_entries for select to anon, authenticated
  using (public.collection_is_public(collection_id) and public.entry_is_public(entry_id));

-- 关联：两端都公开才可见
create policy entry_relations_public_read on public.entry_relations for select to anon, authenticated
  using (public.entry_is_public(entry_id) and public.entry_is_public(related_entry_id));
