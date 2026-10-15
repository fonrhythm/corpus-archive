-- 语料档案馆：一次性初始化脚本（等于按顺序执行 migrations/0001 ~ 0005）
-- 在 Supabase 控制台 → SQL Editor 中整段粘贴执行一次即可。

-- >>>>>>>>>> 0001_schema.sql
-- =====================================================================
-- 0001 数据表结构
-- 语料档案馆 · 独立 Supabase 项目。不与 Language.exe 共享任何数据库或认证。
-- =====================================================================
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------- 管理员身份 ----------
-- 只有管理员行才有 role='admin'。客户端没有任何写入权限（见 0002），不能自行升级。
create table public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'viewer' check (role in ('admin','viewer')),
  created_at timestamptz not null default now()
);

-- ---------- 站点设置（署名、站名等，可在后台修改） ----------
create table public.site_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------- 分类 / 标签 ----------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories(id) on delete restrict,
  name        text not null,
  slug        text not null unique,
  description text,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index categories_parent_idx on public.categories(parent_id);

create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  type       text not null default '其他',
  created_at timestamptz not null default now()
);
create index tags_name_trgm on public.tags using gin (name extensions.gin_trgm_ops);

-- ---------- 媒体 ----------
create table public.assets (
  id           uuid primary key default gen_random_uuid(),
  bucket       text not null check (bucket in ('public-media','private-media')),
  storage_path text not null unique,
  mime_type    text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes   bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  width        int,
  height       int,
  alt_text     text,
  caption      text,
  credit       text,
  visibility   text not null default 'private' check (visibility in ('public','private')),
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  check ((visibility = 'public'  and bucket = 'public-media')
      or (visibility = 'private' and bucket = 'private-media'))
);

-- ---------- 条目 ----------
create table public.entries (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique check (slug ~ '^[^\s/?#%]+$' and length(slug) <= 120),
  type                text not null check (type in ('corpus_card','translation_note')),
  title               text not null default '',
  subtitle            text,
  summary             text,
  status              text not null default 'draft' check (status in ('draft','private','public')),
  translation_status  text not null default 'provisional' check (translation_status in ('provisional','final','verify')),
  primary_category_id uuid references public.categories(id) on delete set null,
  cover_asset_id      uuid references public.assets(id) on delete set null,
  -- 卡片：我的译法；札记：最终译法。个人译法不覆盖释义与语境说明。
  personal_translation text,
  translator_credit   text,
  copyright_note      text,
  material_date       date,
  needs_verify        boolean not null default false,
  -- 唯一事实来源：富文本与结构化区块都在这里；segments / 搜索文档由 save_entry 在同一事务内派生。
  content_json        jsonb not null default '{"type":"doc","content":[]}'::jsonb
                        check (jsonb_typeof(content_json) = 'object'),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  published_at        timestamptz,
  deleted_at          timestamptz,
  check (status <> 'public' or length(btrim(title)) > 0)
);
create index entries_list_idx   on public.entries(status, deleted_at, updated_at desc);
create index entries_cat_idx    on public.entries(primary_category_id);
create index entries_type_idx   on public.entries(type);
create index entries_title_trgm on public.entries using gin (lower(title) extensions.gin_trgm_ops);

-- 私人备注：只有管理员可读写，永不进入公开查询与搜索。
create table public.entry_private_notes (
  entry_id uuid primary key references public.entries(id) on delete cascade,
  remarks  text
);

create table public.entry_slug_history (
  slug     text primary key,
  entry_id uuid not null references public.entries(id) on delete cascade
);

create table public.entry_languages (
  entry_id      uuid not null references public.entries(id) on delete cascade,
  language_code text not null check (length(language_code) between 2 and 35),
  role          text not null check (role in ('source','target','related')),
  primary key (entry_id, language_code, role)
);
create index entry_languages_code_idx on public.entry_languages(language_code);

create table public.entry_tags (
  entry_id uuid not null references public.entries(id) on delete cascade,
  tag_id   uuid not null references public.tags(id) on delete cascade,
  primary key (entry_id, tag_id)
);
create index entry_tags_tag_idx on public.entry_tags(tag_id);

create table public.entry_aliases (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references public.entries(id) on delete cascade,
  text          text not null check (length(btrim(text)) > 0),
  language_code text,
  alias_type    text not null default 'other' check (alias_type in ('romanization','translation','spelling','other')),
  unique (entry_id, text)
);
create index entry_aliases_trgm on public.entry_aliases using gin (text extensions.gin_trgm_ops);

-- 由 content_json 中的「原译对照」区块派生，仅用于可检索/可独立管理，不手工写入。
create table public.entry_segments (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.entries(id) on delete cascade,
  sort_order  int  not null default 0,
  source_text text not null default '',
  target_text text not null default '',
  source_lang text,
  target_lang text,
  note        text
);
create index entry_segments_entry_idx on public.entry_segments(entry_id, sort_order);

create table public.entry_senses (
  id                   uuid primary key default gen_random_uuid(),
  entry_id             uuid not null references public.entries(id) on delete cascade,
  sort_order           int  not null default 0,
  meaning              text not null default '',
  context              text,
  register             text,
  personal_translation text
);
create index entry_senses_entry_idx on public.entry_senses(entry_id, sort_order);

create table public.sources (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references public.entries(id) on delete cascade,
  sort_order int  not null default 0,
  title      text,
  creator    text,
  work_title text,
  url        text check (url is null or url ~* '^https?://'),
  source_type text not null default 'other' check (source_type in ('work','article','book','video','web','other')),
  platform   text,
  note       text
);
create index sources_entry_idx on public.sources(entry_id, sort_order);
create index sources_work_trgm on public.sources using gin ((coalesce(work_title,'')) extensions.gin_trgm_ops);

create table public.entry_assets (
  entry_id   uuid not null references public.entries(id) on delete cascade,
  asset_id   uuid not null references public.assets(id) on delete restrict,
  usage      text not null check (usage in ('cover','body')),
  sort_order int  not null default 0,
  primary key (entry_id, asset_id, usage)
);
create index entry_assets_asset_idx on public.entry_assets(asset_id);

create table public.collections (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[^\s/?#%]+$' and length(slug) <= 120),
  title         text not null,
  description   text,
  status        text not null default 'draft' check (status in ('draft','private','public')),
  cover_asset_id uuid references public.assets(id) on delete set null,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.collection_entries (
  collection_id uuid not null references public.collections(id) on delete cascade,
  entry_id      uuid not null references public.entries(id) on delete cascade,
  sort_order    int  not null default 0,
  primary key (collection_id, entry_id)
);
create index collection_entries_entry_idx on public.collection_entries(entry_id);

create table public.entry_relations (
  entry_id         uuid not null references public.entries(id) on delete cascade,
  related_entry_id uuid not null references public.entries(id) on delete cascade,
  relation_type    text not null default 'related',
  primary key (entry_id, related_entry_id, relation_type),
  check (entry_id <> related_entry_id)
);
-- 双向去重：A→B 与 B→A 只保留一条
create unique index entry_relations_pair_uq
  on public.entry_relations (least(entry_id, related_entry_id), greatest(entry_id, related_entry_id), relation_type);
create index entry_relations_related_idx on public.entry_relations(related_entry_id);

create table public.entry_versions (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references public.entries(id) on delete cascade,
  version_no    int  not null,
  snapshot_json jsonb not null,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  change_note   text,
  unique (entry_id, version_no)
);

-- 受控维护的纯文本搜索材料（只由 save_entry 写入）
create table public.entry_search_documents (
  entry_id    uuid primary key references public.entries(id) on delete cascade,
  search_text text not null default ''
);
create index entry_search_trgm on public.entry_search_documents using gin (search_text extensions.gin_trgm_ops);

-- 每次更新自动刷新 updated_at（并发控制依赖它）
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := clock_timestamp(); return new; end $$;

create trigger entries_touch     before update on public.entries     for each row execute function public.touch_updated_at();
create trigger collections_touch before update on public.collections for each row execute function public.touch_updated_at();

-- >>>>>>>>>> 0002_rls.sql
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

-- >>>>>>>>>> 0003_functions.sql
-- =====================================================================
-- 0003 函数：保存（单一事实来源）、版本、搜索、导出
-- =====================================================================

create or replace function public.nfc(t text) returns text
language sql immutable as $$ select case when t is null then null else normalize(t, NFC) end $$;

-- 递归取出 content_json 中指定类型的所有节点
create or replace function public.jsonb_nodes_of_type(j jsonb, node_type text)
returns setof jsonb language plpgsql immutable as $$
declare c jsonb;
begin
  if j is null or jsonb_typeof(j) <> 'object' then return; end if;
  if j->>'type' = node_type then return next j; end if;
  if jsonb_typeof(j->'content') = 'array' then
    for c in select * from jsonb_array_elements(j->'content') loop
      return query select * from public.jsonb_nodes_of_type(c, node_type);
    end loop;
  end if;
end $$;

-- 提取富文本中的纯文本（用于检索，不含任何 HTML）
create or replace function public.jsonb_plain_text(j jsonb)
returns text language plpgsql immutable as $$
declare r text := ''; c jsonb; it jsonb;
begin
  if j is null or jsonb_typeof(j) <> 'object' then return ''; end if;
  case j->>'type'
    when 'text' then r := coalesce(j->>'text','');
    when 'bilingualPair' then
      r := concat_ws(' ', j#>>'{attrs,source}', j#>>'{attrs,target}', j#>>'{attrs,note}');
    when 'wordBreakdown' then
      for it in select * from jsonb_array_elements(coalesce(j#>'{attrs,items}','[]'::jsonb)) loop
        r := r || ' ' || concat_ws(' ', it->>'token', it->>'meaning', it->>'note');
      end loop;
    when 'candidates' then
      for it in select * from jsonb_array_elements(coalesce(j#>'{attrs,items}','[]'::jsonb)) loop
        r := r || ' ' || concat_ws(' ', it->>'text', it->>'note');
      end loop;
    when 'sourceQuote' then
      r := concat_ws(' ', j#>>'{attrs,text}', j#>>'{attrs,from}');
    when 'image' then
      r := concat_ws(' ', j#>>'{attrs,alt}', j#>>'{attrs,caption}');
    else null;
  end case;
  if jsonb_typeof(j->'content') = 'array' then
    for c in select * from jsonb_array_elements(j->'content') loop
      r := r || ' ' || public.jsonb_plain_text(c);
    end loop;
  end if;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- 把一个条目拼成完整载荷（保存、版本快照、导出共用同一种结构）
-- ---------------------------------------------------------------------
create or replace function public.entry_payload(p_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'slug', e.slug, 'type', e.type, 'title', e.title, 'subtitle', e.subtitle, 'summary', e.summary,
    'status', e.status, 'translation_status', e.translation_status,
    'primary_category_id', e.primary_category_id, 'cover_asset_id', e.cover_asset_id,
    'personal_translation', e.personal_translation, 'translator_credit', e.translator_credit,
    'copyright_note', e.copyright_note, 'material_date', e.material_date,
    'needs_verify', e.needs_verify, 'content_json', e.content_json,
    'remarks', (select n.remarks from public.entry_private_notes n where n.entry_id = e.id),
    'created_at', e.created_at, 'updated_at', e.updated_at, 'published_at', e.published_at, 'deleted_at', e.deleted_at,
    'languages', coalesce((select jsonb_agg(jsonb_build_object('language_code', l.language_code, 'role', l.role)
                                            order by l.role, l.language_code)
                           from public.entry_languages l where l.entry_id = e.id), '[]'::jsonb),
    'tag_ids', coalesce((select jsonb_agg(t.tag_id order by t.tag_id) from public.entry_tags t where t.entry_id = e.id), '[]'::jsonb),
    'aliases', coalesce((select jsonb_agg(jsonb_build_object('text', a.text, 'language_code', a.language_code, 'alias_type', a.alias_type)
                                          order by a.text)
                         from public.entry_aliases a where a.entry_id = e.id), '[]'::jsonb),
    'senses', coalesce((select jsonb_agg(jsonb_build_object('meaning', s.meaning, 'context', s.context, 'register', s.register,
                                                            'personal_translation', s.personal_translation)
                                         order by s.sort_order)
                        from public.entry_senses s where s.entry_id = e.id), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('title', r.title, 'creator', r.creator, 'work_title', r.work_title,
                                                             'url', r.url, 'source_type', r.source_type, 'platform', r.platform, 'note', r.note)
                                          order by r.sort_order)
                         from public.sources r where r.entry_id = e.id), '[]'::jsonb),
    'collection_ids', coalesce((select jsonb_agg(ce.collection_id order by ce.sort_order)
                                from public.collection_entries ce where ce.entry_id = e.id), '[]'::jsonb),
    'related', coalesce((select jsonb_agg(jsonb_build_object(
                           'related_entry_id', case when x.entry_id = e.id then x.related_entry_id else x.entry_id end,
                           'relation_type', x.relation_type))
                         from public.entry_relations x where x.entry_id = e.id or x.related_entry_id = e.id), '[]'::jsonb)
  )
  from public.entries e where e.id = p_id
$$;

-- ---------------------------------------------------------------------
-- 保存条目：同一事务内更新条目、子表、派生 segments、搜索文档与版本
--   p_expected_updated_at：乐观并发；与库中不一致则报 conflict
--   公开条目引用私密图片：报 private_asset_in_public_entry（detail 为图片 id 列表）
-- ---------------------------------------------------------------------
create or replace function public.save_entry(
  p_payload jsonb,
  p_expected_updated_at timestamptz default null,
  p_make_version boolean default false,
  p_change_note text default null
) returns jsonb
language plpgsql security invoker set search_path = public, extensions as $$
declare
  v_id uuid;
  v_old public.entries%rowtype;
  v_slug text;
  v_status text;
  v_content jsonb;
  v_text text;
  v_private text;
  v_ver int;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  v_id := nullif(p_payload->>'id','')::uuid;
  if v_id is not null then
    select * into v_old from public.entries where id = v_id for update;
  end if;

  if v_old.id is not null then
    if p_expected_updated_at is not null and v_old.updated_at <> p_expected_updated_at then
      -- PT409：PostgREST 会把它映射为 HTTP 409，并且不会像 40001 那样被自动重试。
      raise exception 'conflict' using errcode = 'PT409';
    end if;
  else
    v_id := coalesce(v_id, gen_random_uuid());
  end if;

  v_slug := nullif(btrim(p_payload->>'slug'), '');
  if v_slug is null then
    v_slug := 'e-' || substr(replace(v_id::text, '-', ''), 1, 8);
  end if;
  v_status  := coalesce(nullif(p_payload->>'status',''), 'draft');
  v_content := coalesce(p_payload->'content_json', '{"type":"doc","content":[]}'::jsonb);

  if v_old.id is null then
    insert into public.entries (
      id, slug, type, title, subtitle, summary, status, translation_status, primary_category_id, cover_asset_id,
      personal_translation, translator_credit, copyright_note, material_date, needs_verify, content_json,
      published_at, deleted_at
    ) values (
      v_id, v_slug, coalesce(p_payload->>'type','corpus_card'),
      public.nfc(coalesce(p_payload->>'title','')),
      public.nfc(nullif(p_payload->>'subtitle','')), public.nfc(nullif(p_payload->>'summary','')),
      v_status, coalesce(nullif(p_payload->>'translation_status',''),'provisional'),
      nullif(p_payload->>'primary_category_id','')::uuid, nullif(p_payload->>'cover_asset_id','')::uuid,
      public.nfc(nullif(p_payload->>'personal_translation','')), public.nfc(nullif(p_payload->>'translator_credit','')),
      public.nfc(nullif(p_payload->>'copyright_note','')), nullif(p_payload->>'material_date','')::date,
      coalesce((p_payload->>'needs_verify')::boolean, false), v_content,
      case when v_status = 'public' then now() end,
      case when p_payload ? 'deleted_at' then nullif(p_payload->>'deleted_at','')::timestamptz end
    );
  else
    if v_old.slug <> v_slug then
      insert into public.entry_slug_history(slug, entry_id) values (v_old.slug, v_id) on conflict (slug) do nothing;
    end if;
    delete from public.entry_slug_history where slug = v_slug and entry_id = v_id;
    update public.entries set
      slug = v_slug,
      type = coalesce(p_payload->>'type', type),
      title = public.nfc(coalesce(p_payload->>'title','')),
      subtitle = public.nfc(nullif(p_payload->>'subtitle','')),
      summary = public.nfc(nullif(p_payload->>'summary','')),
      status = v_status,
      translation_status = coalesce(nullif(p_payload->>'translation_status',''), 'provisional'),
      primary_category_id = nullif(p_payload->>'primary_category_id','')::uuid,
      cover_asset_id = nullif(p_payload->>'cover_asset_id','')::uuid,
      personal_translation = public.nfc(nullif(p_payload->>'personal_translation','')),
      translator_credit = public.nfc(nullif(p_payload->>'translator_credit','')),
      copyright_note = public.nfc(nullif(p_payload->>'copyright_note','')),
      material_date = nullif(p_payload->>'material_date','')::date,
      needs_verify = coalesce((p_payload->>'needs_verify')::boolean, false),
      content_json = v_content,
      published_at = case when v_status = 'public' and published_at is null then now() else published_at end,
      deleted_at = case when p_payload ? 'deleted_at' then nullif(p_payload->>'deleted_at','')::timestamptz else deleted_at end
    where id = v_id;
  end if;

  -- 私人备注
  insert into public.entry_private_notes (entry_id, remarks) values (v_id, public.nfc(nullif(p_payload->>'remarks','')))
  on conflict (entry_id) do update set remarks = excluded.remarks;

  -- 语言
  delete from public.entry_languages where entry_id = v_id;
  insert into public.entry_languages (entry_id, language_code, role)
  select distinct v_id, btrim(x->>'language_code'), x->>'role'
  from jsonb_array_elements(coalesce(p_payload->'languages','[]'::jsonb)) x
  where coalesce(btrim(x->>'language_code'),'') <> '';

  -- 标签
  delete from public.entry_tags where entry_id = v_id;
  insert into public.entry_tags (entry_id, tag_id)
  select distinct v_id, t.id from public.tags t
  where t.id in (select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p_payload->'tag_ids','[]'::jsonb)) x);

  -- 别名 / 转写（只存用户维护的内容，不自动推导）
  delete from public.entry_aliases where entry_id = v_id;
  insert into public.entry_aliases (entry_id, text, language_code, alias_type)
  select v_id, public.nfc(btrim(x->>'text')), nullif(x->>'language_code',''), coalesce(nullif(x->>'alias_type',''),'other')
  from jsonb_array_elements(coalesce(p_payload->'aliases','[]'::jsonb)) x
  where coalesce(btrim(x->>'text'),'') <> ''
  on conflict (entry_id, text) do nothing;

  -- 义项
  delete from public.entry_senses where entry_id = v_id;
  insert into public.entry_senses (entry_id, sort_order, meaning, context, register, personal_translation)
  select v_id, (ord - 1)::int, public.nfc(coalesce(x->>'meaning','')), public.nfc(nullif(x->>'context','')),
         public.nfc(nullif(x->>'register','')), public.nfc(nullif(x->>'personal_translation',''))
  from jsonb_array_elements(coalesce(p_payload->'senses','[]'::jsonb)) with ordinality as t(x, ord);

  -- 来源（视频只记录外部链接，不托管）
  delete from public.sources where entry_id = v_id;
  insert into public.sources (entry_id, sort_order, title, creator, work_title, url, source_type, platform, note)
  select v_id, (ord - 1)::int, public.nfc(nullif(x->>'title','')), public.nfc(nullif(x->>'creator','')),
         public.nfc(nullif(x->>'work_title','')), nullif(btrim(x->>'url'),''),
         coalesce(nullif(x->>'source_type',''),'other'), nullif(x->>'platform',''), public.nfc(nullif(x->>'note',''))
  from jsonb_array_elements(coalesce(p_payload->'sources','[]'::jsonb)) with ordinality as t(x, ord);

  -- 专题：保留已有顺序，新加入的排到末尾
  delete from public.collection_entries ce
  where ce.entry_id = v_id
    and ce.collection_id not in (select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p_payload->'collection_ids','[]'::jsonb)) x);
  insert into public.collection_entries (collection_id, entry_id, sort_order)
  select c.id, v_id, coalesce((select max(sort_order) + 1 from public.collection_entries where collection_id = c.id), 0)
  from public.collections c
  where c.id in (select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p_payload->'collection_ids','[]'::jsonb)) x)
  on conflict do nothing;

  -- 关联：编辑器看到的是双向合集，所以先清掉涉及本条目的全部关联再重建
  delete from public.entry_relations where entry_id = v_id or related_entry_id = v_id;
  insert into public.entry_relations (entry_id, related_entry_id, relation_type)
  select v_id, (x->>'related_entry_id')::uuid, coalesce(nullif(x->>'relation_type',''),'related')
  from jsonb_array_elements(coalesce(p_payload->'related','[]'::jsonb)) x
  where (x->>'related_entry_id')::uuid <> v_id
    and exists (select 1 from public.entries r where r.id = (x->>'related_entry_id')::uuid)
  on conflict do nothing;

  -- 派生：原译对照 segments（由 content_json 唯一派生）
  delete from public.entry_segments where entry_id = v_id;
  insert into public.entry_segments (entry_id, sort_order, source_text, target_text, source_lang, target_lang, note)
  select v_id, (ord - 1)::int, public.nfc(coalesce(n #>> '{attrs,source}','')), public.nfc(coalesce(n #>> '{attrs,target}','')),
         nullif(n #>> '{attrs,sourceLang}',''), nullif(n #>> '{attrs,targetLang}',''), public.nfc(nullif(n #>> '{attrs,note}',''))
  from public.jsonb_nodes_of_type(v_content, 'bilingualPair') with ordinality as t(n, ord);

  -- 派生：正文引用的图片与封面
  delete from public.entry_assets where entry_id = v_id;
  insert into public.entry_assets (entry_id, asset_id, usage, sort_order)
  select v_id, a.id, 'body', min(ord)::int
  from public.jsonb_nodes_of_type(v_content, 'image') with ordinality as t(n, ord)
  join public.assets a on a.id::text = t.n #>> '{attrs,assetId}'
  group by a.id;
  insert into public.entry_assets (entry_id, asset_id, usage, sort_order)
  select v_id, a.id, 'cover', 0 from public.assets a
  where a.id = nullif(p_payload->>'cover_asset_id','')::uuid
  on conflict do nothing;

  -- 公开条目不得引用私密图片
  if v_status = 'public' then
    select string_agg(a.id::text, ',') into v_private
    from public.entry_assets ea join public.assets a on a.id = ea.asset_id
    where ea.entry_id = v_id and a.visibility = 'private';
    if v_private is not null then
      raise exception 'private_asset_in_public_entry' using detail = v_private, errcode = 'P0001';
    end if;
  end if;

  -- 派生：检索纯文本
  select public.nfc(concat_ws(E'\n',
      e.title, e.subtitle, e.summary, e.personal_translation,
      public.jsonb_plain_text(e.content_json),
      (select string_agg(concat_ws(' ', s.meaning, s.context, s.register, s.personal_translation), E'\n')
         from public.entry_senses s where s.entry_id = e.id)))
    into v_text from public.entries e where e.id = v_id;
  insert into public.entry_search_documents (entry_id, search_text) values (v_id, coalesce(v_text,''))
  on conflict (entry_id) do update set search_text = excluded.search_text;

  -- 版本：只在明确保存 / 发布时生成，避免自动保存产生大量历史
  if p_make_version then
    select coalesce(max(version_no), 0) + 1 into v_ver from public.entry_versions where entry_id = v_id;
    insert into public.entry_versions (entry_id, version_no, snapshot_json, created_by, change_note)
    values (v_id, v_ver, public.entry_payload(v_id), auth.uid(), p_change_note);
  end if;

  return public.entry_payload(v_id);
end $$;

-- 恢复某个版本（保留当前可见状态与删除状态，恢复动作本身也记一个新版本）
create or replace function public.restore_version(p_entry_id uuid, p_version_no int)
returns jsonb language plpgsql security invoker set search_path = public, extensions as $$
declare v_snap jsonb; v_status text; v_cur jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select snapshot_json into v_snap from public.entry_versions where entry_id = p_entry_id and version_no = p_version_no;
  if v_snap is null then raise exception 'version_not_found' using errcode = 'P0002'; end if;
  select status into v_status from public.entries where id = p_entry_id;
  v_cur := public.entry_payload(p_entry_id);
  -- 可见状态、关联条目、专题归属不随版本回退：它们牵涉其他条目 / 专题，回退会悄悄改掉别处的内容。
  v_snap := (v_snap - 'deleted_at' - 'updated_at' - 'created_at' - 'published_at')
            || jsonb_build_object('id', p_entry_id, 'status', coalesce(v_status, v_snap->>'status'),
                                  'related', coalesce(v_cur->'related', '[]'::jsonb),
                                  'collection_ids', coalesce(v_cur->'collection_ids', '[]'::jsonb));
  return public.save_entry(v_snap, null, true, '恢复到版本 ' || p_version_no);
end $$;

-- ---------------------------------------------------------------------
-- 搜索：标题、别名、译法、摘要、标签、来源、正文；中英泰韩混合。
-- security invoker → RLS 照常生效：匿名永远看不到草稿/私密。
-- 注意：pg_trgm 对短查询与无空格文字有局限，这里用 ILIKE 子串匹配兜底，并不等同于语言学分词。
-- ---------------------------------------------------------------------
create or replace function public.search_entries(
  p_q text default null,
  p_category uuid default null,
  p_lang text default null,
  p_type text default null,
  p_tag uuid default null,
  p_collection uuid default null,
  p_sort text default 'relevance',
  p_limit int default 20,
  p_offset int default 0
) returns table (
  id uuid, slug text, type text, title text, subtitle text, summary text, status text,
  translation_status text, primary_category_id uuid, cover_asset_id uuid, personal_translation text,
  updated_at timestamptz, published_at timestamptz, rank int, match_source text, snippet text, total_count bigint
)
language plpgsql stable security invoker set search_path = public, extensions as $$
#variable_conflict use_column
declare
  q text; pat text; lim int; off int;
begin
  q := nullif(btrim(left(coalesce(normalize(p_q, NFC), ''), 100)), '');
  lim := least(greatest(coalesce(p_limit, 20), 1), 50);
  off := greatest(coalesce(p_offset, 0), 0);
  pat := case when q is null then null
              else '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;

  return query
  with base as (
    select e.* from public.entries e
    where e.deleted_at is null
      and (p_type is null or e.type = p_type)
      and (p_category is null or e.primary_category_id = p_category
           or e.primary_category_id in (select c.id from public.categories c where c.parent_id = p_category))
      and (p_lang is null or exists (select 1 from public.entry_languages l where l.entry_id = e.id and l.language_code = p_lang))
      and (p_tag is null or exists (select 1 from public.entry_tags t where t.entry_id = e.id and t.tag_id = p_tag))
      and (p_collection is null or exists (select 1 from public.collection_entries ce where ce.entry_id = e.id and ce.collection_id = p_collection))
  ), parts as (
    select b.*,
      case when q is null then 0 when lower(b.title) = lower(q) then 100 when b.title ilike pat then 70 else 0 end as s_title,
      case when q is null then 0 else coalesce((select max(case when lower(a.text) = lower(q) then 95 else 80 end)
                                                from public.entry_aliases a where a.entry_id = b.id and a.text ilike pat), 0) end as s_alias,
      case when q is null then 0 when coalesce(b.personal_translation,'') ilike pat then 75 else 0 end as s_trans,
      case when q is null then 0 when coalesce(b.subtitle,'') ilike pat then 60 else 0 end as s_sub,
      case when q is null then 0 when coalesce(b.summary,'') ilike pat then 40 else 0 end as s_sum,
      case when q is null then 0 else coalesce((select 35 from public.entry_tags et join public.tags tg on tg.id = et.tag_id
                                                where et.entry_id = b.id and tg.name ilike pat limit 1), 0) end as s_tag,
      case when q is null then 0 else coalesce((select 30 from public.sources s where s.entry_id = b.id
                                                and (coalesce(s.title,'') ilike pat or coalesce(s.creator,'') ilike pat or coalesce(s.work_title,'') ilike pat) limit 1), 0) end as s_src,
      case when q is null then 0 else coalesce((select 20 from public.entry_search_documents d
                                                where d.entry_id = b.id and d.search_text ilike pat), 0) end as s_body,
      case when q is null then 0 else (similarity(lower(b.title), lower(q)) * 30)::int end as s_fuzzy
    from base b
  ), scored as (
    select p.*, greatest(p.s_title, p.s_alias, p.s_trans, p.s_sub, p.s_sum, p.s_tag, p.s_src, p.s_body, p.s_fuzzy) as score
    from parts p
  )
  , labeled as (
    select s.*,
           case when q is null then null
                when s.s_title  = s.score then 'title'
                when s.s_alias  = s.score then 'alias'
                when s.s_trans  = s.score then 'translation'
                when s.s_sub    = s.score then 'subtitle'
                when s.s_sum    = s.score then 'summary'
                when s.s_tag    = s.score then 'tag'
                when s.s_src    = s.score then 'source'
                when s.s_body   = s.score then 'body'
                else 'fuzzy' end::text as src
    from scored s
    where q is null or s.score > 0
  )
  select l.id, l.slug, l.type, l.title, l.subtitle, l.summary, l.status, l.translation_status,
         l.primary_category_id, l.cover_asset_id, l.personal_translation, l.updated_at, l.published_at,
         l.score::int, l.src,
         -- 命中的是别名 / 标签 / 来源 / 正文时，把命中的那段文字带回去，前台据此高亮
         case l.src
           when 'alias' then (select a.text from public.entry_aliases a where a.entry_id = l.id and a.text ilike pat
                              order by (lower(a.text) = lower(q)) desc, length(a.text) limit 1)
           when 'tag' then (select tg.name from public.entry_tags et join public.tags tg on tg.id = et.tag_id
                            where et.entry_id = l.id and tg.name ilike pat limit 1)
           when 'source' then (select coalesce(nullif(s2.work_title,''), nullif(s2.title,''), s2.creator) from public.sources s2
                               where s2.entry_id = l.id and (coalesce(s2.title,'') ilike pat or coalesce(s2.creator,'') ilike pat or coalesce(s2.work_title,'') ilike pat) limit 1)
           when 'body' then (select substr(d.search_text, greatest(position(lower(q) in lower(d.search_text)) - 40, 1), 140)
                             from public.entry_search_documents d where d.entry_id = l.id)
           else l.summary end,
         count(*) over ()
  from labeled l
  order by (case when p_sort = 'relevance' and q is not null then l.score end) desc nulls last,
           l.updated_at desc, l.id
  limit lim offset off;
end $$;

-- ---------------------------------------------------------------------
-- 整站导出（管理员）：内容级备份。完整备份还需数据库备份 + Storage 图片，见 README。
-- ---------------------------------------------------------------------
create or replace function public.export_all()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'format', 'corpus-archive-export', 'version', 1, 'exported_at', now(),
    'site_settings', coalesce((select jsonb_agg(to_jsonb(s)) from public.site_settings s), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.parent_id nulls first, c.sort_order) from public.categories c), '[]'::jsonb),
    'tags', coalesce((select jsonb_agg(to_jsonb(t)) from public.tags t), '[]'::jsonb),
    'collections', coalesce((select jsonb_agg(to_jsonb(c)) from public.collections c), '[]'::jsonb),
    'assets', coalesce((select jsonb_agg(to_jsonb(a)) from public.assets a), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(public.entry_payload(e.id) order by e.created_at) from public.entries e), '[]'::jsonb)
  );
end $$;

-- ---------- 函数权限：匿名只能搜索；写入类函数只给登录用户（函数内再校验管理员） ----------
revoke all on function public.nfc(text), public.jsonb_nodes_of_type(jsonb, text), public.jsonb_plain_text(jsonb),
  public.entry_payload(uuid), public.save_entry(jsonb, timestamptz, boolean, text),
  public.restore_version(uuid, int), public.export_all(),
  public.search_entries(text, uuid, text, text, uuid, uuid, text, int, int),
  public.touch_updated_at() from public, anon, authenticated;

grant execute on function public.nfc(text), public.jsonb_nodes_of_type(jsonb, text), public.jsonb_plain_text(jsonb),
  public.entry_payload(uuid), public.search_entries(text, uuid, text, text, uuid, uuid, text, int, int)
  to anon, authenticated;
grant execute on function public.save_entry(jsonb, timestamptz, boolean, text), public.restore_version(uuid, int),
  public.export_all() to authenticated;

-- >>>>>>>>>> 0004_storage.sql
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

-- >>>>>>>>>> 0005_seed.sql
-- =====================================================================
-- 0005 初始数据：六个主题与二级分类、日常用语细分标签、站点设置
-- 可重复执行；之后全部可在后台维护。
-- =====================================================================
insert into public.site_settings (key, value) values
  ('site_name',     '语料档案馆'),
  ('site_subtitle', 'Corpus & Translation Archive'),
  ('author_name',   'Valar Morghulis·F'),
  ('about',         '这是一个长期保存、检索与展示翻译内容、语言表达、文化语境，以及译者个人思考的地方。以中文读者为主，收录中文、英语、泰语、韩语及其他语言的资料。'),
  ('about_2',       '语言事实、语境判断与个人译法，会分开呈现。'),
  ('motto',         '忠实保存原文，清楚标注个人诠释。')
on conflict (key) do nothing;

insert into public.categories (name, slug, sort_order) values
  ('影视','film',1), ('音乐','music',2), ('文学','literature',3),
  ('人文','humanities',4), ('在地','local',5), ('其他','misc',6)
on conflict (slug) do nothing;

with subs(parent, name, slug, ord) as (values
  ('film','台词原文','film-dialogue',1), ('film','小说原文','film-novel',2), ('film','剧名/片名翻译','film-title',3),
  ('film','字幕翻译','film-subtitle',4), ('film','其他','film-other',5),
  ('music','歌词','music-lyrics',1), ('music','歌名','music-title',2), ('music','音乐术语','music-terms',3),
  ('music','创作背景','music-background',4), ('music','其他','music-other',5),
  ('literature','小说','lit-novel',1), ('literature','散文','lit-essay',2), ('literature','诗歌','lit-poetry',3),
  ('literature','文学表达','lit-expression',4), ('literature','其他','lit-other',5),
  ('humanities','历史','hum-history',1), ('humanities','社会文化','hum-society',2), ('humanities','政治','hum-politics',3),
  ('humanities','语言文化','hum-language',4), ('humanities','其他','hum-other',5),
  ('local','旅游观光','local-travel',1), ('local','物品','local-things',2), ('local','日常用语','local-daily',3),
  ('local','风俗习惯','local-customs',4), ('local','其他','local-other',5),
  ('misc','未分类语料','misc-unsorted',1), ('misc','翻译随笔','misc-essays',2), ('misc','其他','misc-other',3)
)
insert into public.categories (parent_id, name, slug, sort_order)
select p.id, s.name, s.slug, s.ord from subs s join public.categories p on p.slug = s.parent
on conflict (slug) do nothing;

-- 日常用语的细分：作为可管理标签，不做无限级树
insert into public.tags (name, slug, type) values
  ('日常口语','daily-colloquial','日常用语细分'), ('习惯用语','daily-idiom','日常用语细分'),
  ('Gen Z 用语','daily-genz','日常用语细分'), ('俚语','daily-slang','日常用语细分'),
  ('称谓与敬语','daily-honorific','日常用语细分'), ('网络流行语','daily-netspeak','日常用语细分'),
  ('语气词与感叹词','daily-particles','日常用语细分'), ('地区性表达','daily-regional','日常用语细分')
on conflict (slug) do nothing;
