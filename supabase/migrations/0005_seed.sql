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
