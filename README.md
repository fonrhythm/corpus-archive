# 语料档案馆

多语言语料库与翻译档案馆。中文读者为主，收录中文、英语、泰语、韩语资料。
前台是杂志风的公开站点，后台是只有你能进的编辑区。

**技术栈**：Vue 3 + TypeScript + Vite · Supabase（Postgres / Auth / Storage）· TipTap 编辑器 · Cloudflare Pages
**独立项目**：使用你自己的 Supabase 项目，不与 Language.exe 共享数据库、认证或 Storage。

---

## 一、第一次部署（约 20 分钟）

### 1. 新建 Supabase 项目
在 supabase.com 新建一个项目（新项目，不要复用别的）。记下 **Project URL** 与 **anon / publishable key**（Project Settings → API）。

> 只会用到这两个值。**service_role 密钥不要放进前端、不要提交到代码库。**

### 2. 初始化数据库
打开 SQL Editor，把 `supabase/all-in-one.sql` 整个粘贴进去，点 Run。
它依次建表、开启行级安全（RLS）、写入保存/搜索函数、建两个图片桶、写入六个主题和二级分类。
可以重复执行，不会重复写入分类。

### 3. 关闭公开注册，创建你的管理员账号
1. Authentication → Sign In / Providers → Email：**关闭 “Allow new users to sign up”**。
2. Authentication → Users → Add user：填你的邮箱和一个强密码（建议 16 位以上，用密码管理器）。
3. 回到 SQL Editor，把管理员身份写进去（把邮箱换成你的）：

```sql
insert into public.profiles (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com';
```

> 只有这一行会被当作管理员。前端没有任何办法修改它，所以知道网站地址的人也无法给自己提权。

4. 建议：Authentication → Multi-Factor 里为你的账号开启 TOTP 二步验证。

### 4. 本地运行
```bash
cp .env.example .env      # 填入 Project URL 与 anon key
npm install
npm run dev               # http://localhost:5173
```
前台是 `/`，后台是 `/admin`，用上一步的邮箱和密码登录。

### 5. 部署到 Cloudflare Pages
- 连接代码仓库，**Build command**：`npm run build`，**Output directory**：`dist`
- Environment variables：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`
- `public/_redirects`（单页应用回退）与 `public/_headers`（安全响应头、CSP）会随构建一起发布
- 部署后在 Supabase → Authentication → URL Configuration 把 **Site URL** 设为你的正式域名

### 6. 在后台做第一次检查
- 设置 → 确认站名与署名（默认署名：Valar Morghulis·F）
- 新建一条语料卡片（比如 คุณหนู），输入时右侧会即时识别类型与分类
- 点「发布」，用无痕窗口打开前台确认能看到；把它改回「草稿」，再确认前台看不到、搜不到

---

## 二、日常使用

| 想做什么 | 在哪里 |
|---|---|
| 写一条语料卡片 / 翻译札记 | 后台 → 新建。输入标题或正文时自动识别语言、类型、主题；你手动改过的项目不会再被覆盖 |
| 区分「事实 / 推断 / 译者选择」 | 编辑器工具栏的三个说明块；前台用实心方块 / 空心方块 / 红点标出来 |
| 草稿、私密、公开 | 右侧「发布」面板。草稿和私密：不出现在前台、搜索、专题 |
| 版本与回退 | 「保存为版本」或「发布」才会存快照。自动保存不产生版本。可比较、可恢复 |
| 改了链接名 | 旧链接自动跳转到新链接 |
| 图片 | 编辑器里点「图片」，或在「媒体」页上传。JPG / PNG / WebP，≤ 5 MB |
| 误删 | 删除先进回收站，可恢复；永久删除才会连版本一起清掉 |

**两个自动化的边界**
- 自动识别是**规则判断，不是 AI**：看文字类型（泰/韩/中/英）、长度、关键词。没有关键词时只能粗略猜测并标「低置信度」。关键词表在 `src/lib/detect.ts`，想补词直接加。
- **罗马转写不会自动生成**。请在「别名与转写」里自己填；搜索会命中这里的内容。

---

## 三、备份与恢复（请认真读）

完整备份 = **数据库 + Storage 图片 + 迁移 SQL**，三样缺一不可。

1. **数据库**：Supabase 控制台 → Database → Backups（自动备份的保留期取决于你的套餐）。想要自己握着一份，定期执行：
   `pg_dump "postgresql://postgres:[密码]@db.[项目].supabase.co:5432/postgres" --schema=public -Fc -f backup.dump`
2. **图片**：后台 → 备份 → 导出图片包（含清单）。
3. **迁移 SQL**：就在 `supabase/migrations/`，和代码放在一起。
4. **随手带走的内容备份**：后台 → 备份 → 导出 JSON / CSV / Markdown。

**恢复前请先演练**：新建一个测试用的 Supabase 项目 → 跑 `all-in-one.sql` → 在后台「从 JSON 恢复」→ 核对条目数量、别名、义项、正文、图片。确认没问题，才算你真的有备份。
JSON 恢复只恢复内容与图片记录；图片文件要另外放回 Storage（路径见图片清单）。

---

## 四、安全设计

- **所有表启用 RLS**，逐表显式授权：匿名只能读「公开且未删除」的内容；草稿、私密、回收站、版本历史、私人备注只有管理员可读。
- **写入只有管理员**。保存走 `save_entry` 函数，函数内再次校验管理员身份。
- **私人备注**存在单独的表里，不会出现在任何公开查询或搜索文本中。
- **搜索**用 `security invoker`，沿用调用者的权限，匿名永远搜不到非公开内容；标签只对「被公开条目使用」的可见。
- **正文不使用 `v-html`**：富文本以 JSON 保存，前台逐节点渲染成 Vue 文本节点，不存在 HTML 注入。链接只放行 `http` / `https` / `mailto`，外链加 `noopener noreferrer nofollow`。
- **图片**：公开桶 / 私有桶分开；私有图片只用 10 分钟有效的签名 URL。公开条目引用私密图片时，数据库会拒绝保存，前端提示后可一键转为公开；条目改为非公开时，只被它使用的公开图片会自动收回私有桶。上传限制类型与大小，文件名替换为随机名，不保留原始文件名。
- **视频不托管**，只记录外部链接。
- `public/_headers` 带 CSP、`X-Frame-Options` 等响应头。`connect-src` / `img-src` 写的是 `https://*.supabase.co`；如果你用自定义域名，需要改成自己的域名。
- 登录失败限流、密码强度、二步验证在 Supabase 的 Authentication 设置里开启。

---

## 五、已验证 / 没验证的

**已验证（在本地真实环境里跑过）**
- 数据库：迁移可从零执行；`supabase/tests/rls.test.sql` 覆盖匿名 / 普通登录 / 管理员三种身份的读写边界、搜索验收词（คุณหนู、Khun Nu、Round One、รักวนกับคนเดิม、爱、循环和你、大小姐、韩文及转写）、版本恢复、并发冲突、私密图片拦截、双向关联去重、导出。运行：`supabase/tests/run_local.sh`
- 接口层：`src/integration/api.integration.test.ts`，前端数据层 × 真实 PostgREST × 真实 PostgreSQL（18 项，含「导出 → 清空 → 导入」恢复演练）
- 界面层：`src/integration/ui.integration.test.ts`，整个应用挂进 jsdom 连真实后端，逐页检查内容、404、登录跳转、自动识别分类、自动保存、恶意内容（HTML 标签、`javascript:` 链接）只当文字显示（12 项）
- 以上两层一键运行：`supabase/tests/integration/run.sh`（需要本机有 Postgres 16 与 PostgREST，见脚本注释）
- `npm run build`（含 `vue-tsc` 类型检查）、`npm test`（9 个单元测试）

**没有验证，上线前请你自己过一遍**
- **没有连接真实的 Supabase 云项目**。Auth 登录用的是模拟接口；Storage 的上传 / 公开私有切换 / 签名 URL 没有真实跑过，只验证了数据库侧的规则。
- **没有在真实浏览器里测试**，尤其是泰文、韩文在 TipTap 编辑区里的输入法组词，以及触屏体验。节点内的输入框用 `v-model`（组词期间不触发更新），理论上安全，但需要你实际输入几段确认。
- 视觉上按你确认的设计稿实现，但没有逐像素比对；窄屏下的排版请用手机看一眼。

---

## 六、设计取舍与已知限制

- **正文单一事实来源**：`entries.content_json`。原译对照 `entry_segments`、检索文本 `entry_search_documents`、图片引用 `entry_assets` 都由 `save_entry` 在同一事务里派生，不手工维护，避免两份数据不一致。
- **搜索**用子串匹配（ILIKE）+ 标题近似度，对中英泰韩混合输入都有效，但**不是语言学分词**：泰文、中文按连续字符匹配；很短的查询词会命中较多。量大以后可再接入专门的分词方案。
- **SEO**：目前是单页应用，没有服务端渲染。搜索引擎收录依赖其执行 JavaScript；需要更强的收录再考虑预渲染。
- **版本回退**不会改动「可见状态、相关条目、专题归属」，因为它们牵涉其他条目 / 专题。
- **并发**：两个窗口同时编辑同一条，后保存的会收到冲突提示，不会静默覆盖。
- 不含：批量导入旧资料、AI 生成释义 / 自动翻译（需求文档里也明确暂不做）。

---

## 七、目录

```
supabase/
  all-in-one.sql        一次性初始化（= migrations 全部合并）
  migrations/           0001 表 · 0002 权限 · 0003 函数 · 0004 存储 · 0005 初始数据
  tests/                SQL 权限与行为测试、本地运行脚本、接口层集成测试脚本
src/
  lib/                  类型、分类识别（detect.ts）、文本工具、文档转换
  services/             数据访问（api / assets / backup）
  stores/               登录与站点状态
  components/           布局、列表、内容渲染、富文本编辑器及结构化区块
  views/                前台页面；views/admin 后台页面
  integration/          接口层与界面层集成测试
public/                 底纹图、_redirects、_headers
```
