-- =====================================================================
-- 权限 / 搜索 / 保存行为测试（本地 run_local.sh 使用；也可在测试环境的 SQL Editor 里逐段手动执行）
-- 失败时会抛出异常并中止。
-- =====================================================================

create or replace function public.zz_ok(cond boolean, msg text) returns void language plpgsql as
$$ begin if not coalesce(cond, false) then raise exception 'TEST FAILED: %', msg; end if; end $$;
grant execute on function public.zz_ok(boolean, text) to anon, authenticated;

-- 测试用账号
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test'),
  ('00000000-0000-0000-0000-0000000000b2', 'viewer@test');
insert into public.profiles (user_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin'),
  ('00000000-0000-0000-0000-0000000000b2', 'viewer');

-- ---------------------------------------------------------------------
-- 1. 管理员写入
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);


do $$
declare r jsonb; cat uuid; tag_pub uuid; tag_priv uuid; a_priv uuid; a_pub uuid; n int;
begin
  select id into cat from public.categories where slug = 'local-daily';
  insert into public.tags (name, slug, type) values ('称谓', 'tag-honorific', '称谓') returning id into tag_pub;
  insert into public.tags (name, slug, type) values ('只在私密里用的标签', 'tag-private-only', '其他') returning id into tag_priv;

  -- 公开卡片：คุณหนู
  r := public.save_entry(jsonb_build_object(
    'id', '10000000-0000-0000-0000-000000000001', 'slug', 'khun-nu', 'type', 'corpus_card', 'title', 'คุณหนู',
    'status', 'public', 'primary_category_id', cat, 'personal_translation', '大小姐',
    'languages', '[{"language_code":"th","role":"source"},{"language_code":"zh","role":"target"}]'::jsonb,
    'tag_ids', jsonb_build_array(tag_pub),
    'aliases', '[{"text":"Khun Nu","language_code":"en","alias_type":"romanization"}]'::jsonb,
    'senses', '[{"meaning":"佣人对雇主家年轻成员的称呼","context":"雇佣关系"},{"meaning":"朋友之间的调侃","register":"调侃"}]'::jsonb,
    'content_json', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"关于 ลูกคุณหนู 与 คุณชาย 的差异。"}]}]}'::jsonb,
    'remarks', 'remarkonly-不能公开'
  ), null, true, '首版');
  perform public.zz_ok((r->>'title') = 'คุณหนู', 'save_entry 返回载荷');
  perform public.zz_ok(jsonb_array_length(r->'senses') = 2, '义项已保存');

  -- 公开札记：含原译对照区块
  r := public.save_entry(jsonb_build_object(
    'id', '10000000-0000-0000-0000-000000000002', 'slug', 'round-one', 'type', 'translation_note',
    'title', '爱、循环和你', 'subtitle', 'รักวนกับคนเดิม', 'status', 'public', 'translation_status', 'final',
    'personal_translation', '《爱、循环和你》',
    'aliases', '[{"text":"Round One"},{"text":"รักวนกับคนเดิม","language_code":"th"}]'::jsonb,
    'content_json', '{"type":"doc","content":[
       {"type":"bilingualPair","attrs":{"source":"รักวนกับคนเดิม","target":"爱、循环和你","sourceLang":"th","targetLang":"zh","note":""}},
       {"type":"paragraph","content":[{"type":"text","text":"标题同时指向时间循环与拳击回合。"}]},
       {"type":"wordBreakdown","attrs":{"items":[{"token":"คนเดิม","meaning":"原来的人","note":""}]}}]}'::jsonb
  ), null, true, null);
  select count(*) into n from public.entry_segments where entry_id = '10000000-0000-0000-0000-000000000002';
  perform public.zz_ok(n = 1, '原译对照由 content_json 派生为 1 条 segment');

  -- 公开韩文卡片
  perform public.save_entry(jsonb_build_object(
    'id', '10000000-0000-0000-0000-000000000003', 'slug', 'saranghae', 'type', 'corpus_card', 'title', '사랑해',
    'status', 'public', 'aliases', '[{"text":"saranghae","alias_type":"romanization"}]'::jsonb), null, false, null);

  -- 私密、草稿
  perform public.save_entry(jsonb_build_object(
    'id', '10000000-0000-0000-0000-000000000004', 'slug', 'secret', 'type', 'corpus_card', 'title', 'secretword-私密',
    'status', 'private', 'tag_ids', jsonb_build_array(tag_priv)), null, false, null);
  perform public.save_entry(jsonb_build_object(
    'id', '10000000-0000-0000-0000-000000000005', 'slug', 'draft-one', 'type', 'corpus_card', 'title', 'draftword-草稿',
    'status', 'draft'), null, false, null);

  -- 图片：一张公开、一张私密
  insert into public.assets (id, bucket, storage_path, mime_type, size_bytes, visibility)
    values ('20000000-0000-0000-0000-000000000001', 'public-media', 'p/a.png', 'image/png', 1000, 'public') returning id into a_pub;
  insert into public.assets (id, bucket, storage_path, mime_type, size_bytes, visibility)
    values ('20000000-0000-0000-0000-000000000002', 'private-media', 'p/b.png', 'image/png', 1000, 'private') returning id into a_priv;

  -- 公开条目引用私密图片必须被拒绝
  begin
    perform public.save_entry(jsonb_build_object(
      'id', '10000000-0000-0000-0000-000000000003', 'slug', 'saranghae', 'type', 'corpus_card', 'title', '사랑해', 'status', 'public', 'aliases', '[{"text":"saranghae","alias_type":"romanization"}]'::jsonb,
      'content_json', jsonb_build_object('type','doc','content', jsonb_build_array(
         jsonb_build_object('type','image','attrs', jsonb_build_object('assetId', a_priv::text, 'alt','x'))))), null, false, null);
    raise exception 'TEST FAILED: 公开条目引用了私密图片却保存成功';
  exception when others then
    perform public.zz_ok(sqlerrm = 'private_asset_in_public_entry', '应报 private_asset_in_public_entry，实际：' || sqlerrm);
  end;

  -- 公开条目引用公开图片可以
  perform public.save_entry(jsonb_build_object(
      'id', '10000000-0000-0000-0000-000000000003', 'slug', 'saranghae', 'type', 'corpus_card', 'title', '사랑해', 'status', 'public', 'aliases', '[{"text":"saranghae","alias_type":"romanization"}]'::jsonb,
      'cover_asset_id', a_pub,
      'content_json', jsonb_build_object('type','doc','content', jsonb_build_array(
         jsonb_build_object('type','image','attrs', jsonb_build_object('assetId', a_pub::text, 'alt','x'))))), null, false, null);
  select count(*) into n from public.entry_assets where entry_id = '10000000-0000-0000-0000-000000000003';
  perform public.zz_ok(n = 2, '封面 + 正文图片已登记到 entry_assets');

  -- 双向关联去重
  perform public.save_entry(public.entry_payload('10000000-0000-0000-0000-000000000001') ||
    '{"related":[{"related_entry_id":"10000000-0000-0000-0000-000000000002","relation_type":"related"}]}'::jsonb, null, false, null);
  r := public.entry_payload('10000000-0000-0000-0000-000000000002');
  perform public.zz_ok(jsonb_array_length(r->'related') = 1, '从另一端也能看到关联');
  perform public.save_entry(r, null, false, null);  -- 从另一端再保存，不应出现重复
  select count(*) into n from public.entry_relations;
  perform public.zz_ok(n = 1, '关联双向去重');

  -- 乐观并发
  r := public.entry_payload('10000000-0000-0000-0000-000000000005');
  perform public.save_entry(r || '{"title":"draftword-草稿 改"}'::jsonb, (r->>'updated_at')::timestamptz, false, null);
  begin
    perform public.save_entry(r || '{"title":"过期的编辑"}'::jsonb, (r->>'updated_at')::timestamptz, false, null);
    raise exception 'TEST FAILED: 过期编辑应被拒绝';
  exception when others then
    perform public.zz_ok(sqlerrm = 'conflict', '应报 conflict，实际：' || sqlerrm);
  end;

  -- 版本与恢复
  perform public.save_entry(public.entry_payload('10000000-0000-0000-0000-000000000002') || '{"title":"改过的标题"}'::jsonb, null, true, '改标题');
  select count(*) into n from public.entry_versions where entry_id = '10000000-0000-0000-0000-000000000002';
  perform public.zz_ok(n = 2, '生成了两个版本');
  perform public.restore_version('10000000-0000-0000-0000-000000000002', 1);
  perform public.zz_ok((select title from public.entries where id = '10000000-0000-0000-0000-000000000002') = '爱、循环和你', '版本 1 已恢复');
  select count(*) into n from public.entry_versions where entry_id = '10000000-0000-0000-0000-000000000002';
  perform public.zz_ok(n = 3, '恢复动作本身也记一个版本');

  -- 恢复版本不应改动关联条目（版本 1 时还没有关联）
  perform public.zz_ok((select count(*) from public.entry_relations) = 1, '恢复版本后，关联条目保持不变');

  -- 旧链接兼容
  perform public.save_entry(public.entry_payload('10000000-0000-0000-0000-000000000002') || '{"slug":"round-one-new"}'::jsonb, null, false, null);
  perform public.zz_ok(exists (select 1 from public.entry_slug_history where slug = 'round-one'), '旧 slug 已写入历史');

  -- 软删除：公开卡片之外再放一个待删除的公开条目
  perform public.save_entry(jsonb_build_object('id','10000000-0000-0000-0000-000000000006','slug','to-delete','type','corpus_card','title','将被删除','status','public'), null, false, null);
  update public.entries set deleted_at = now() where id = '10000000-0000-0000-0000-000000000006';

  -- 管理员能看到全部
  select count(*) into n from public.entries;
  perform public.zz_ok(n = 6, '管理员看到全部 6 条，实际 ' || n);
end $$;
commit;

-- ---------------------------------------------------------------------
-- 2. 匿名访客
-- ---------------------------------------------------------------------
begin;
set local role anon;
do $$
declare n int; r record;
begin
  select count(*) into n from public.entries;
  perform public.zz_ok(n = 3, '匿名只能看到 3 条公开条目，实际 ' || n);
  perform public.zz_ok(not exists (select 1 from public.entries where status <> 'public'), '匿名看不到草稿/私密');
  perform public.zz_ok(not exists (select 1 from public.entries where deleted_at is not null), '匿名看不到已删除');

  -- 搜索验收词
  perform public.zz_ok(exists (select 1 from public.search_entries('คุณหนู') where slug = 'khun-nu'), '搜 คุณหนู');
  select * into r from public.search_entries('Khun Nu') where slug = 'khun-nu';
  perform public.zz_ok(r.slug is not null and r.match_source = 'alias', '搜 Khun Nu 通过别名命中，实际 ' || coalesce(r.match_source,'null'));
  perform public.zz_ok(exists (select 1 from public.search_entries('khun nu') where slug = 'khun-nu'), '大小写不敏感');
  perform public.zz_ok(exists (select 1 from public.search_entries('大小姐') where slug = 'khun-nu'), '搜 大小姐（译法）');
  perform public.zz_ok(exists (select 1 from public.search_entries('ลูกคุณหนู') where slug = 'khun-nu'), '搜 ลูกคุณหนู（正文）');
  perform public.zz_ok(exists (select 1 from public.search_entries('รักวนกับคนเดิม') where slug = 'round-one-new'), '搜 รักวนกับคนเดิม');
  perform public.zz_ok(exists (select 1 from public.search_entries('Round One') where slug = 'round-one-new'), '搜 Round One');
  perform public.zz_ok(exists (select 1 from public.search_entries('爱、循环和你') where slug = 'round-one-new'), '搜 爱、循环和你');
  perform public.zz_ok(exists (select 1 from public.search_entries('사랑해') where slug = 'saranghae'), '搜 韩文');
  perform public.zz_ok(exists (select 1 from public.search_entries('saranghae') where slug = 'saranghae'), '搜 韩文罗马转写（别名）');
  perform public.zz_ok(exists (select 1 from public.search_entries('拳击回合') where slug = 'round-one-new'), '搜 正文');
  perform public.zz_ok(exists (select 1 from public.search_entries('คนเดิม') where slug = 'round-one-new'), '搜 词语拆解里的词');

  -- 不泄露私密 / 草稿 / 备注
  perform public.zz_ok(not exists (select 1 from public.search_entries('secretword')), '匿名搜不到私密条目');
  perform public.zz_ok(not exists (select 1 from public.search_entries('draftword')), '匿名搜不到草稿');
  perform public.zz_ok(not exists (select 1 from public.search_entries('remarkonly')), '匿名搜不到私人备注');
  perform public.zz_ok(not exists (select 1 from public.search_entries('将被删除')), '匿名搜不到已删除');
  perform public.zz_ok(not exists (select 1 from public.search_entries('只在私密里用的标签')), '私密条目独有的标签不可被搜索');
  perform public.zz_ok((select count(*) from public.tags) = 1, '匿名只看得到公开条目使用的标签');
  perform public.zz_ok((select count(*) from public.assets) = 1, '匿名只看得到公开图片记录');

  -- 筛选
  perform public.zz_ok((select count(*) from public.search_entries(null, null, 'th')) = 1, '语言筛选 th');
  perform public.zz_ok((select count(*) from public.search_entries(null, null, null, 'translation_note')) = 1, '类型筛选');
  perform public.zz_ok((select count(*) from public.search_entries(null, (select id from public.categories where slug='local'))) = 1, '主题（含二级）筛选');
  perform public.zz_ok((select count(*) from public.search_entries(null, null, null, null, null, null, 'updated', 2, 0)) = 2, '分页大小');
  perform public.zz_ok((select max(total_count) from public.search_entries(null, null, null, null, null, null, 'updated', 2, 0)) = 3, '总数稳定');

  -- 关联：另一端仍可见
  perform public.zz_ok((select count(*) from public.entry_relations) = 1, '两端都公开，关联可见');
  perform public.zz_ok(exists (select 1 from public.entry_slug_history where slug = 'round-one'), '旧链接可解析');
end $$;

-- 直接写入、调用写入函数、读取受保护表：全部必须失败
do $$
begin
  begin insert into public.entries (slug, type, title) values ('hack','corpus_card','x'); raise exception 'TEST FAILED: 匿名插入 entries'; exception when insufficient_privilege then null; end;
  begin perform public.save_entry('{"title":"x"}'::jsonb); raise exception 'TEST FAILED: 匿名调用 save_entry'; exception when insufficient_privilege then null; end;
  begin perform public.export_all(); raise exception 'TEST FAILED: 匿名调用 export_all'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.profiles; raise exception 'TEST FAILED: 匿名读 profiles'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.entry_versions; raise exception 'TEST FAILED: 匿名读 entry_versions'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.entry_private_notes; raise exception 'TEST FAILED: 匿名读 entry_private_notes'; exception when insufficient_privilege then null; end;
  begin insert into storage.objects (bucket_id, name) values ('public-media','x.png'); raise exception 'TEST FAILED: 匿名上传'; exception when insufficient_privilege then null; end;
end $$;
commit;

-- ---------------------------------------------------------------------
-- 3. 已登录但不是管理员：不能写、不能升级自己、看不到私密
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
do $$
declare n int;
begin
  begin perform public.save_entry('{"title":"x"}'::jsonb); raise exception 'TEST FAILED: 非管理员 save_entry'; exception when others then
    perform public.zz_ok(sqlerrm = 'forbidden', '非管理员应 forbidden，实际 ' || sqlerrm); end;
  begin update public.profiles set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000000b2'; get diagnostics n = row_count;
        perform public.zz_ok(n = 0, '不能自行升级为管理员');
  exception when insufficient_privilege then null; end;
  begin insert into public.profiles (user_id, role) values ('00000000-0000-0000-0000-0000000000b2', 'admin'); raise exception 'TEST FAILED: 自行插入 admin';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.entries;
  perform public.zz_ok(n = 3, '非管理员也只能看到公开条目，实际 ' || n);
  begin perform public.restore_version('10000000-0000-0000-0000-000000000002', 1); raise exception 'TEST FAILED: 非管理员 restore'; exception when others then
    perform public.zz_ok(sqlerrm = 'forbidden', '非管理员 restore 应 forbidden'); end;
end $$;
commit;

-- ---------------------------------------------------------------------
-- 4. 管理员：备份导出、搜索可见私密
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$
declare r jsonb;
begin
  r := public.export_all();
  perform public.zz_ok(jsonb_array_length(r->'entries') = 6, '导出包含全部条目（含草稿、私密、已删除）');
  perform public.zz_ok(jsonb_array_length(r->'categories') >= 28, '导出包含分类');
  perform public.zz_ok(exists (select 1 from public.search_entries('secretword')), '管理员能搜到私密条目');
  perform public.zz_ok((select remarks from public.entry_private_notes where entry_id = '10000000-0000-0000-0000-000000000001') like 'remarkonly%', '管理员能读私人备注');
end $$;
commit;

drop function public.zz_ok(boolean, text);
