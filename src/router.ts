import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/stores/auth'
import { useSite } from '@/stores/site'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('@/views/HomeView.vue'), meta: { title: '' } },
    { path: '/topics/:slug', component: () => import('@/views/TopicView.vue') },
    { path: '/search', component: () => import('@/views/SearchView.vue'), meta: { title: '搜索' } },
    { path: '/corpus', component: () => import('@/views/ListView.vue'), props: { kind: 'corpus_card' }, meta: { title: '语料卡片' } },
    { path: '/notes', component: () => import('@/views/ListView.vue'), props: { kind: 'translation_note' }, meta: { title: '翻译札记' } },
    { path: '/collections', component: () => import('@/views/CollectionsView.vue'), meta: { title: '专题合集' } },
    { path: '/collections/:slug', component: () => import('@/views/CollectionView.vue') },
    { path: '/entries/:slug', component: () => import('@/views/EntryView.vue') },
    { path: '/admin/login', component: () => import('@/views/admin/LoginView.vue'), meta: { title: '管理登录' } },
    {
      path: '/admin', component: () => import('@/views/admin/AdminLayout.vue'), meta: { admin: true },
      children: [
        { path: '', component: () => import('@/views/admin/DashboardView.vue'), meta: { title: '仪表盘' } },
        { path: 'entries', component: () => import('@/views/admin/EntriesView.vue'), meta: { title: '内容管理' } },
        { path: 'entries/new', component: () => import('@/views/admin/EntryEditView.vue'), meta: { title: '新建条目' } },
        { path: 'entries/:id', component: () => import('@/views/admin/EntryEditView.vue'), meta: { title: '编辑条目' } },
        { path: 'taxonomy', component: () => import('@/views/admin/TaxonomyView.vue'), meta: { title: '分类与标签' } },
        { path: 'collections', component: () => import('@/views/admin/CollectionsAdminView.vue'), meta: { title: '专题管理' } },
        { path: 'media', component: () => import('@/views/admin/MediaView.vue'), meta: { title: '媒体' } },
        { path: 'backup', component: () => import('@/views/admin/BackupView.vue'), meta: { title: '备份与恢复' } },
        { path: 'settings', component: () => import('@/views/admin/SettingsView.vue'), meta: { title: '站点设置' } }
      ]
    },
    { path: '/:pathMatch(.*)*', component: () => import('@/views/NotFoundView.vue'), meta: { title: '找不到页面' } }
  ],
  scrollBehavior: (to, from, saved) => saved ?? (to.path === from.path ? undefined : { top: 0 })
})

router.beforeEach(async (to) => {
  if (to.matched.some((r) => r.meta.admin)) {
    const auth = useAuth()
    await auth.init()
    if (!auth.isAdmin) return { path: '/admin/login', query: { redirect: to.fullPath } }
  }
})

router.afterEach((to) => {
  const site = useSite()
  const t = to.meta.title as string | undefined
  const name = site.get('site_name')
  if (t === undefined && !to.meta.dynamicTitle) return
  document.title = t ? `${t} · ${name}` : name
})

export default router
