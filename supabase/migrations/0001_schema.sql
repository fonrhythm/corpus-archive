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
