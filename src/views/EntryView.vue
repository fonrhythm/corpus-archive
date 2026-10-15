<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import SiteHeader from '@/components/layout/SiteHeader.vue'
import SiteFooter from '@/components/layout/SiteFooter.vue'
import AssetImage from '@/components/ui/AssetImage.vue'
import ContentRenderer from '@/components/content/ContentRenderer'
import { fetchEntryBySlug, fetchRelated, type EntryDetail, type MiniEntry } from '@/services/api'
import { useSite } from '@/stores/site'
import { useAuth } from '@/stores/auth'
import { TYPE_LABEL, TSTATUS_LABEL, STATUS_LABEL, ALIAS_LABEL, SOURCE_LABEL, langName } from '@/lib/taxonomy'
import { copyText, fmtDate, safeUrl, scriptLang } from '@/lib/text'

const route = useRoute()
const router = useRouter()
const site = useSite()
const auth = useAuth()
const entry = ref<EntryDetail | null>(null)
const related = ref<MiniEntry[]>([])
const loading = ref(true)
const error = ref('')
const copied = ref(false)

async function load() {
  loading.value = true; error.value = ''; entry.value = null; related.value = []
  try {
    await site.load()
    const { entry: e, redirectTo } = await fetchEntryBySlug(String(route.params.slug))
    if (redirectTo) { void router.replace(`/entries/${redirectTo}`); return }
    entry.value = e
    if (e) {
      document.title = `${e.title} · ${site.get('site_name')}`
      related.value = await fetchRelated(e.id)
    }
  } catch (err) { error.value = err instanceof Error ? err.message : '加载失败' } finally { loading.value = false }
}
watch(() => route.params.slug, load, { immediate: true })

const isCard = computed(() => entry.value?.type === 'corpus_card')
const path = computed(() => site.pathOf(entry.value?.primary_category_id))
const srcLangs = computed(() => entry.value?.entry_languages.filter((l) => l.role === 'source').map((l) => langName(l.language_code)).join('、') ?? '')
const tgtLangs = computed(() => entry.value?.entry_languages.filter((l) => l.role === 'target').map((l) => langName(l.language_code)).join('、') ?? '')
const senses = computed(() => [...(entry.value?.senses ?? [])].sort((a, b) => a.sort_order - b.sort_order))
const sources = computed(() => [...(entry.value?.sources ?? [])].sort((a, b) => a.sort_order - b.sort_order))
const tags = computed(() => (entry.value?.tags ?? []).map((t) => t.tag).filter((t): t is NonNullable<typeof t> => !!t))
const collections = computed(() => (entry.value?.collections ?? []).map((c) => c.collection).filter((c): c is NonNullable<typeof c> => !!c))
const roman = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']
const hasBody = computed(() => !!entry.value?.content_json?.content?.some((n) => n.type !== 'paragraph' || n.content?.length))

async function copyLink() { if (await copyText(location.href)) { copied.value = true; setTimeout(() => (copied.value = false), 1800) } }
</script>

<template>
  <SiteHeader />
  <main id="main">
    <p v-if="error" class="wrap err" role="alert" style="padding-top: 40px">{{ error }}</p>

    <template v-if="entry">
      <div v-if="entry.status !== 'public' && auth.isAdmin" class="wrap" style="padding-top: 24px">
        <p class="banner">这条内容目前是「{{ STATUS_LABEL[entry.status] }}」，只有你能看到。 <RouterLink :to="`/admin/entries/${entry.id}`" class="bold">去编辑</RouterLink></p>
      </div>

      <!-- 头部 -->
      <section class="wrap" style="padding-top: 44px">
        <nav class="crumbs" aria-label="面包屑">
          <RouterLink :to="isCard ? '/corpus' : '/notes'">{{ TYPE_LABEL[entry.type] }}</RouterLink>
          <template v-for="c in path" :key="c.id"> / <RouterLink :to="`/topics/${(site.byId(c.parent_id) ?? c).slug}${c.parent_id ? '?sub=' + c.id : ''}`">{{ c.name }}</RouterLink></template>
        </nav>

        <div v-if="isCard" style="margin-top: 30px; display: flex; flex-wrap: wrap; gap: 40px 56px; align-items: stretch">
          <div style="flex: 7 1 480px; min-width: 0">
            <div class="lab accent bold">语料卡片<template v-if="srcLangs"> · {{ srcLangs }}</template></div>
            <h1 class="d-title" :lang="scriptLang(entry.title)" style="margin-top: 8px; font-size: clamp(56px, 11vw, 150px); line-height: 1.35; font-weight: 400">{{ entry.title }}</h1>
            <p v-if="entry.aliases[0]" class="lat" style="font-size: 34px; color: var(--ink-soft)">{{ entry.aliases.find((a) => a.alias_type === 'romanization')?.text ?? entry.aliases[0].text }}</p>
            <p v-if="entry.subtitle" class="muted" style="margin-top: 6px; font-size: 20px" :lang="scriptLang(entry.subtitle)">{{ entry.subtitle }}</p>
            <div v-if="tags.length" class="tag-line" style="margin-top: 26px">
              <RouterLink v-for="t in tags" :key="t.id" :to="{ path: '/search', query: { tag: t.id } }" class="chip">{{ t.name }}</RouterLink>
            </div>
          </div>
          <div style="flex: 5 1 340px; min-width: 0; background: var(--panel); border: 1px solid #A9A8A2; padding: 32px 32px 28px; display: flex; flex-direction: column">
            <div class="lab" style="display: flex; align-items: center; gap: 10px"><span class="mark mark-choice" style="margin-top: 0" aria-hidden="true"></span>个人译法</div>
            <div v-if="entry.personal_translation" style="margin-top: 10px; font-size: clamp(44px, 7vw, 88px); line-height: 1.2; font-weight: 700; color: var(--accent); overflow-wrap: anywhere">{{ entry.personal_translation }}</div>
            <div v-else class="muted" style="margin-top: 10px; font-size: 24px">尚未填写</div>
            <p class="sans" style="margin-top: auto; padding-top: 22px; font-size: 13px; line-height: 1.9; color: var(--ink-soft); border-top: 1px solid #A9A8A2">个人译法不替代词典释义，也不覆盖下方的语境说明。</p>
          </div>
        </div>

        <template v-else>
          <div class="lab accent bold" style="margin-top: 26px">翻译札记</div>
          <h1 class="d-title" :lang="scriptLang(entry.title)" style="margin-top: 10px">{{ entry.title }}</h1>
          <p v-if="entry.subtitle" style="margin-top: 18px; font-size: clamp(24px, 3.5vw, 38px); line-height: 1.6" :lang="scriptLang(entry.subtitle)">{{ entry.subtitle }}</p>
          <div v-if="entry.cover_asset_id" class="cover" style="margin-top: 28px; height: clamp(220px, 36vw, 420px)"><AssetImage :asset-id="entry.cover_asset_id" bare /></div>

          <div class="metastrip" style="margin-top: 32px">
            <div v-if="srcLangs"><div class="lab">原文语言</div><div class="v">{{ srcLangs }}</div></div>
            <div v-if="tgtLangs"><div class="lab">译文语言</div><div class="v">{{ tgtLangs }}</div></div>
            <div><div class="lab">译文状态</div><div class="v">{{ TSTATUS_LABEL[entry.translation_status] }}</div></div>
            <div><div class="lab">更新</div><div class="v">{{ fmtDate(entry.updated_at) }}</div></div>
            <div><div class="lab">译者署名</div><div class="v">{{ entry.translator_credit || site.get('author_name') }}</div></div>
          </div>
          <div class="sans" style="margin-top: 22px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 26px; font-size: 13px; letter-spacing: .08em; color: var(--ink-soft)">
            <span class="lab" style="margin-right: 4px">阅读提示</span>
            <span style="display: inline-flex; align-items: center; gap: 8px"><span class="mark mark-fact" style="margin-top: 0" aria-hidden="true"></span>语言事实</span>
            <span style="display: inline-flex; align-items: center; gap: 8px"><span class="mark mark-inference" style="margin-top: 0" aria-hidden="true"></span>情境推断</span>
            <span style="display: inline-flex; align-items: center; gap: 8px"><span class="mark mark-choice" style="margin-top: 0" aria-hidden="true"></span>译者选择</span>
          </div>
        </template>
      </section>

      <!-- 正文 + 边栏 -->
      <section class="wrap" style="padding-top: 56px">
        <div class="sections">
          <article class="article">
            <div v-if="!isCard && entry.personal_translation" class="sec">
              <div class="sec-label"><h2>最终译法</h2><span class="mark mark-choice" aria-hidden="true"></span></div>
              <div class="sec-body"><p style="font-size: clamp(30px, 5vw, 44px); font-weight: 700; color: var(--accent); line-height: 1.4; overflow-wrap: anywhere">{{ entry.personal_translation }}</p></div>
            </div>

            <div v-if="senses.length" class="sec">
              <div class="sec-label"><h2>常见释义与语境</h2><span class="mark mark-inference" aria-hidden="true"></span></div>
              <ol class="sec-body row-list" style="list-style: none">
                <li v-for="(s, i) in senses" :key="i">
                  <div class="lat muted" style="font-size: 18px">{{ roman[i] ?? i + 1 }}.</div>
                  <p style="font-size: 19px; line-height: 2">{{ s.meaning }}</p>
                  <p v-if="s.context || s.register" class="sans muted" style="margin-top: 4px; font-size: 13px; letter-spacing: .04em">
                    <template v-if="s.context">语境：{{ s.context }}</template><template v-if="s.context && s.register"> · </template><template v-if="s.register">语气 / 语域：{{ s.register }}</template>
                  </p>
                  <p v-if="s.personal_translation" style="margin-top: 4px; font-size: 16px">个人译法：<b class="accent">{{ s.personal_translation }}</b></p>
                </li>
              </ol>
            </div>

            <div v-if="hasBody" class="sec">
              <div class="sec-label"><h2>{{ isCard ? '译者说明' : '札记' }}</h2></div>
              <div class="sec-body"><ContentRenderer :doc="entry.content_json" /></div>
            </div>
            <p v-if="!hasBody && !senses.length && !(entry.personal_translation && !isCard)" class="empty">这条内容还没有正文。</p>
          </article>

          <aside class="aside">
            <template v-if="entry.aliases.length">
              <h3>别名与转写</h3>
              <ul style="list-style: none; margin-top: 10px">
                <li v-for="a in entry.aliases" :key="a.text" style="font-size: 20px; line-height: 1.9"><span :class="scriptLang(a.text) ? '' : 'lat'" :lang="scriptLang(a.text)">{{ a.text }}</span> <span class="sans muted" style="font-size: 12px">{{ ALIAS_LABEL[a.alias_type] }}</span></li>
              </ul>
            </template>

            <template v-if="sources.length">
              <h3>来源</h3>
              <dl>
                <template v-for="(s, i) in sources" :key="i">
                  <dt class="lab" style="margin-top: 8px">{{ SOURCE_LABEL[s.source_type] }}<template v-if="s.platform"> · {{ s.platform }}</template></dt>
                  <dd>
                    <span v-if="s.work_title" :lang="scriptLang(s.work_title)">{{ s.work_title }}</span><span v-if="s.work_title && s.title"> / </span><span v-if="s.title">{{ s.title }}</span>
                    <span v-if="s.creator" class="muted"> · {{ s.creator }}</span>
                    <a v-if="safeUrl(s.url)" :href="safeUrl(s.url)!" target="_blank" rel="noopener noreferrer nofollow" class="accent" style="display: block; overflow-wrap: anywhere; text-decoration: underline">{{ s.source_type === 'video' ? '观看（外部链接）' : '打开来源' }}</a>
                    <span v-if="s.note" class="hint" style="display: block">{{ s.note }}</span>
                  </dd>
                </template>
              </dl>
            </template>

            <template v-if="collections.length">
              <h3>所属专题</h3>
              <RouterLink v-for="c in collections.filter((c) => c.status === 'public' || auth.isAdmin)" :key="c.id" :to="`/collections/${c.slug}`" style="display: block; margin-top: 8px; font-size: 24px; line-height: 1.4" :lang="scriptLang(c.title)">{{ c.title }}</RouterLink>
            </template>

            <template v-if="!isCard && tags.length">
              <h3>标签</h3>
              <div class="tag-line" style="margin-top: 12px"><RouterLink v-for="t in tags" :key="t.id" :to="{ path: '/search', query: { tag: t.id } }" class="chip" style="font-size: 13px">{{ t.name }}</RouterLink></div>
            </template>

            <template v-if="related.length">
              <h3>相关条目</h3>
              <ul style="list-style: none; margin-top: 8px">
                <li v-for="r in related" :key="r.id" style="padding: 8px 0; border-bottom: 1px solid var(--rule)">
                  <RouterLink :to="`/entries/${r.slug}`" :lang="scriptLang(r.title)" style="font-size: 20px; overflow-wrap: anywhere">{{ r.title }}</RouterLink>
                  <span v-if="r.personal_translation" class="sans muted" style="display: block; font-size: 13px">{{ r.personal_translation }}</span>
                </li>
              </ul>
            </template>

            <template v-if="entry.copyright_note">
              <h3>版权说明</h3>
              <p class="sans" style="margin-top: 10px; font-size: 13px; line-height: 1.9; color: var(--ink-soft)">{{ entry.copyright_note }}</p>
            </template>

            <h3>分享</h3>
            <button type="button" class="btn" style="margin-top: 10px" @click="copyLink">{{ copied ? '已复制' : '复制页面链接' }}</button>
          </aside>
        </div>
      </section>
    </template>

    <div v-else-if="!loading && !error" class="wrap" style="padding-top: 80px; min-height: 40vh">
      <p class="lab accent bold">404</p>
      <h1 style="font-size: 48px; line-height: 1.3; margin-top: 8px">找不到这条内容，<br>或者它尚未公开。</h1>
      <p style="margin-top: 24px"><RouterLink to="/search" class="btn">去搜索</RouterLink></p>
    </div>
    <p v-else-if="loading" class="wrap empty" role="status">加载中…</p>
  </main>
  <SiteFooter />
</template>
