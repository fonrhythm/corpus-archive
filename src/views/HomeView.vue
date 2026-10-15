<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import SiteHeader from '@/components/layout/SiteHeader.vue'
import SiteFooter from '@/components/layout/SiteFooter.vue'
import AssetImage from '@/components/ui/AssetImage.vue'
import { searchEntries, fetchCollections, fetchAliasMap } from '@/services/api'
import { useSite } from '@/stores/site'
import { LANGS, TYPE_LABEL, TSTATUS_LABEL } from '@/lib/taxonomy'
import { fmtDate, scriptLang } from '@/lib/text'
import type { EntryRow } from '@/lib/types'

const site = useSite()
const latest = ref<EntryRow[]>([])
const cards = ref<EntryRow[]>([])
const aliases = ref<Record<string, string>>({})
const collections = ref<Awaited<ReturnType<typeof fetchCollections>>>([])
const loading = ref(true)
const failed = ref(false)

const feature = computed(() => latest.value.find((r) => r.type === 'translation_note' && r.cover_asset_id)
  ?? latest.value.find((r) => r.type === 'translation_note') ?? latest.value[0])
const recent = computed(() => latest.value.filter((r) => r.id !== feature.value?.id).slice(0, 3))
const pathOf = (r: EntryRow) => site.pathOf(r.primary_category_id).map((c) => c.name).join(' · ')

onMounted(async () => {
  try {
    await site.load()
    const [a, c, col] = await Promise.all([
      searchEntries({ sort: 'updated', pageSize: 8 }),
      searchEntries({ type: 'corpus_card', sort: 'updated', pageSize: 3 }),
      fetchCollections()
    ])
    latest.value = a.rows; cards.value = c.rows; collections.value = col
    aliases.value = await fetchAliasMap(c.rows.map((r) => r.id))
  } catch { failed.value = true } finally { loading.value = false }
  document.title = site.get('site_name')
})
</script>

<template>
  <SiteHeader home />
  <main id="main">
    <!-- 封面故事 + 最新收录 -->
    <section class="wrap" style="padding-top: 56px">
      <p v-if="failed" class="err" role="alert">内容加载失败，请稍后刷新重试。</p>
      <div v-else-if="!loading && !feature" class="empty" style="padding-top: 24px">还没有公开的内容。登录后台写下第一条吧。</div>
      <div v-else-if="feature" class="hero">
        <article class="hero-main">
          <div class="lab" style="display: flex; gap: 14px; align-items: center">
            <span class="accent bold">本期精选</span><span aria-hidden="true" style="flex: 0 0 32px; border-top: 1px solid var(--ink)"></span>
            <span>{{ TYPE_LABEL[feature.type] }}<template v-if="pathOf(feature)"> · {{ pathOf(feature) }}</template></span>
          </div>
          <div v-if="feature.cover_asset_id" class="cover" style="margin-top: 22px; height: clamp(240px, 38vw, 430px)">
            <AssetImage :asset-id="feature.cover_asset_id" bare />
          </div>
          <h2 style="margin-top: 34px; font-size: clamp(36px, 6vw, 60px); line-height: 1.2; font-weight: 700; overflow-wrap: anywhere">
            <RouterLink :to="`/entries/${feature.slug}`" :lang="scriptLang(feature.title)">{{ feature.type === 'translation_note' && feature.personal_translation ? feature.personal_translation : feature.title }}</RouterLink>
          </h2>
          <p v-if="feature.subtitle || (feature.personal_translation && feature.type === 'translation_note')" class="muted" style="margin-top: 14px; font-size: 22px" :lang="scriptLang(feature.subtitle)">
            {{ feature.subtitle }}
          </p>
          <p v-if="feature.summary" style="margin-top: 22px; font-size: 18px; line-height: 2; max-width: 640px">{{ feature.summary }}</p>
          <div class="sans" style="margin-top: 22px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 22px; font-size: 13px; letter-spacing: .08em; color: var(--ink-soft)">
            <span class="chip">{{ TSTATUS_LABEL[feature.translation_status] }}</span>
            <span>更新于 {{ fmtDate(feature.updated_at) }}</span>
            <RouterLink :to="`/entries/${feature.slug}`" class="accent bold" style="margin-left: auto; letter-spacing: .1em; padding: 10px 0">阅读全文 →</RouterLink>
          </div>
        </article>

        <aside class="hero-side">
          <div class="rule-top sec-head"><h2 style="font-size: 24px; letter-spacing: .1em">最新收录</h2><span class="lat muted" style="font-size: 15px">Recent</span></div>
          <RouterLink v-for="r in recent" :key="r.id" :to="`/entries/${r.slug}`" style="display: block; padding: 22px 0; border-bottom: 1px solid var(--rule)">
            <div class="lab">{{ TYPE_LABEL[r.type] }}<template v-if="pathOf(r)"> · {{ pathOf(r) }}</template></div>
            <div :lang="scriptLang(r.title)" style="margin-top: 8px; font-size: 28px; line-height: 1.5; font-weight: 600; overflow-wrap: anywhere">{{ r.title }}</div>
            <p v-if="r.personal_translation" style="margin-top: 2px; font-size: 16px">{{ r.type === 'corpus_card' ? '个人译法：' : '最终译法：' }}<b class="accent">{{ r.personal_translation }}</b></p>
          </RouterLink>
          <p v-if="!recent.length" class="empty" style="padding: 22px 0">暂时只有一条内容。</p>
          <RouterLink to="/search" class="sans bold" style="display: inline-block; margin-top: 18px; padding: 10px 0; font-size: 13px; letter-spacing: .12em">浏览全部 →</RouterLink>
        </aside>
      </div>
    </section>

    <!-- 按主题浏览 -->
    <section class="wrap" style="padding-top: 96px">
      <div class="rule-top sec-head"><h2>按主题浏览</h2><span class="lat muted" style="font-size: 17px">Subjects</span></div>
      <div class="topic-grid">
        <RouterLink v-for="(t, i) in site.topics" :key="t.id" :to="`/topics/${t.slug}`" class="topic">
          <div class="lat accent" style="font-size: 15px">{{ String(i + 1).padStart(2, '0') }}</div>
          <div class="name">{{ t.name }}</div>
          <p class="subs">{{ site.childrenOf(t.id).filter((c) => c.name !== '其他').map((c) => c.name).join(' · ') }}</p>
        </RouterLink>
      </div>
      <div class="sans" style="margin-top: 26px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; font-size: 13px; letter-spacing: .08em">
        <span class="lab" style="margin-right: 6px">按语言</span>
        <RouterLink v-for="l in LANGS" :key="l.code" :to="{ path: '/search', query: { lang: l.code } }" class="chip" style="padding: 6px 16px">{{ l.native }}</RouterLink>
      </div>
    </section>

    <!-- 语料卡片 -->
    <section v-if="cards.length" class="wrap" style="padding-top: 96px">
      <div class="rule-top sec-head"><h2>语料卡片</h2><RouterLink to="/corpus" class="more">查看全部 →</RouterLink></div>
      <p class="muted" style="margin-top: 10px; max-width: 560px">词、短语、称谓与固定表达。原文、常见释义与个人译法分开记录。</p>
      <div class="card-grid">
        <RouterLink v-for="c in cards" :key="c.id" :to="`/entries/${c.slug}`" class="card">
          <div class="lab" style="display: flex; justify-content: space-between; gap: 12px"><span>卡片</span><span>{{ pathOf(c) }}</span></div>
          <div class="orig" :lang="scriptLang(c.title)">{{ c.title }}</div>
          <div v-if="aliases[c.id]" class="lat" style="font-size: 20px; color: var(--ink-soft)">{{ aliases[c.id] }}</div>
          <div class="mine">
            <div class="lab">个人译法</div>
            <div v-if="c.personal_translation" class="v">{{ c.personal_translation }}</div>
            <div v-else class="muted" style="font-size: 20px">尚未填写</div>
          </div>
        </RouterLink>
      </div>
    </section>

    <!-- 专题 + 关于 -->
    <section class="wrap" style="padding-top: 96px">
      <div style="display: flex; flex-wrap: wrap; gap: 56px">
        <div style="flex: 6 1 480px; min-width: 0">
          <div class="rule-top sec-head"><h2>专题合集</h2><RouterLink to="/collections" class="more">全部专题 →</RouterLink></div>
          <ul v-if="collections.length" class="row-list" style="margin-top: 24px">
            <li v-for="c in collections.slice(0, 5)" :key="c.id">
              <RouterLink :to="`/collections/${c.slug}`" style="display: flex; justify-content: space-between; gap: 16px; align-items: baseline">
                <span :lang="scriptLang(c.title)" style="font-size: 28px; font-weight: 600; overflow-wrap: anywhere">{{ c.title }}</span>
                <span class="sans muted" style="font-size: 13px; white-space: nowrap">{{ c.count }} 条</span>
              </RouterLink>
              <p v-if="c.description" class="muted" style="margin-top: 4px; font-size: 16px">{{ c.description }}</p>
            </li>
          </ul>
          <p v-else class="empty">还没有公开的专题。</p>
        </div>
        <div style="flex: 5 1 380px; min-width: 0">
          <div class="rule-top"><h2 style="font-size: 30px; font-weight: 700; letter-spacing: .12em">关于这里</h2></div>
          <p class="dropcap" style="margin-top: 24px; font-size: 17px; line-height: 2.05">{{ site.get('about') }}</p>
          <p style="margin-top: 14px; font-size: 17px; line-height: 2.05">{{ site.get('about_2') }}</p>
        </div>
      </div>
    </section>

    <section class="wrap" style="padding-top: 104px">
      <div class="double-rule-rev"></div>
      <blockquote class="quote-band" style="margin: 0"><p>{{ site.get('motto') }}</p></blockquote>
      <div class="double-rule"></div>
    </section>
  </main>
  <SiteFooter />
</template>
