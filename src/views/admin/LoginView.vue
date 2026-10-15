<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useAuth } from '@/stores/auth'
import { useSite } from '@/stores/site'
import { isConfigured } from '@/lib/supabase'

const auth = useAuth(); const site = useSite(); const route = useRoute(); const router = useRouter()
const email = ref(''); const password = ref(''); const busy = ref(false); const error = ref('')

async function submit() {
  error.value = ''; busy.value = true
  try {
    await auth.signIn(email.value, password.value)
    const r = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/admin') ? route.query.redirect : '/admin'
    await router.replace(r)
  } catch (e) { error.value = e instanceof Error ? e.message : '登录失败' } finally { busy.value = false }
}
</script>

<template>
  <main id="main" class="wrap" style="max-width: 520px; padding-top: 12vh; min-height: 90vh">
    <div class="double-rule"></div>
    <h1 style="margin-top: 28px; font-size: 40px; letter-spacing: .12em">{{ site.get('site_name') }}</h1>
    <p class="lab" style="margin-top: 4px">管理后台</p>
    <p v-if="!isConfigured" class="banner" style="margin-top: 24px">还没有配置 Supabase（见 README 的第 2 步）。</p>
    <form style="margin-top: 36px; display: flex; flex-direction: column; gap: 20px" @submit.prevent="submit">
      <div class="field"><label for="em">邮箱</label><input id="em" v-model="email" class="input" type="email" autocomplete="username" required></div>
      <div class="field"><label for="pw">密码</label><input id="pw" v-model="password" class="input" type="password" autocomplete="current-password" required></div>
      <p v-if="error" class="err" role="alert">{{ error }}</p>
      <button class="btn btn-ink" type="submit" :disabled="busy || !isConfigured">{{ busy ? '登录中…' : '登录' }}</button>
    </form>
    <p style="margin-top: 28px"><RouterLink to="/" class="sans muted" style="font-size: 13px">← 返回前台</RouterLink></p>
  </main>
</template>
