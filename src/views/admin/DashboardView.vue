<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { dashboardStats } from '@/services/api'
import { TYPE_LABEL, STATUS_LABEL } from '@/lib/taxonomy'
import { fmtDate } from '@/lib/text'

const s = ref<Awaited<ReturnType<typeof dashboardStats>> | null>(null)
const error = ref('')
onMounted(async () => { try { s.value = await dashboardStats() } catch (e) { error.value = e instanceof Error ? e.message : '加载失败' } })
</script>

<template>
  <h1 style="font-size: 44px; line-height: 1.3">概览</h1>
  <p v-if="error" class="err" role="alert">{{ error }}</p>
  <template v-if="s">
    <div class="stat-row" style="margin-top: 28px">
      <RouterLink class="stat" :to="{ path: '/admin/entries' }"><div class="n">{{ s.total }}</div><div class="lab">全部内容</div></RouterLink>
      <RouterLink class="stat" :to="{ path: '/admin/entries', query: { status: 'public' } }"><div class="n">{{ s.public }}</div><div class="lab">已公开</div></RouterLink>
      <RouterLink class="stat" :to="{ path: '/admin/entries', query: { status: 'draft' } }"><div class="n">{{ s.draft }}</div><div class="lab">草稿</div></RouterLink>
      <RouterLink class="stat" :to="{ path: '/admin/entries', query: { status: 'private' } }"><div class="n">{{ s.private }}</div><div class="lab">私密</div></RouterLink>
      <RouterLink class="stat" :to="{ path: '/admin/entries', query: { trash: '1' } }"><div class="n">{{ s.trash }}</div><div class="lab">回收站</div></RouterLink>
    </div>
    <p v-if="s.uncategorized || s.verify" class="sans" style="margin-top: 20px; font-size: 14px">
      待整理：<span v-if="s.uncategorized">{{ s.uncategorized }} 条还没有分类</span><span v-if="s.uncategorized && s.verify">；</span><span v-if="s.verify">{{ s.verify }} 条标了待核实</span>
    </p>

    <div class="sec-head rule-top" style="margin-top: 48px"><h2 style="font-size: 24px">最近编辑</h2><RouterLink to="/admin/entries/new" class="btn btn-ink">新建条目</RouterLink></div>
    <table v-if="s.recent.length" class="tbl" style="margin-top: 8px">
      <thead><tr><th>标题</th><th>类型</th><th>状态</th><th>更新</th></tr></thead>
      <tbody>
        <tr v-for="r in s.recent" :key="r.id">
          <td><RouterLink :to="`/admin/entries/${r.id}`" style="font-size: 16px; font-weight: 500">{{ r.title || '（无标题）' }}</RouterLink></td>
          <td>{{ TYPE_LABEL[r.type] }}</td><td>{{ STATUS_LABEL[r.status] }}</td><td>{{ fmtDate(r.updated_at) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty">还没有内容。点右上角「新建条目」，写下第一条。</p>
  </template>
</template>
