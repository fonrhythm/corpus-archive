<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useSite } from '@/stores/site'
import { useAuth } from '@/stores/auth'
import { isConfigured } from '@/lib/supabase'

const site = useSite()
const auth = useAuth()
onMounted(() => { void site.load(); void auth.init() })
</script>

<template>
  <a href="#main" class="skip">跳到正文</a>
  <div v-if="!isConfigured" class="wrap" style="padding-top: 20px">
    <p class="banner">还没有配置 Supabase。复制 <code>.env.example</code> 为 <code>.env</code>，填入项目地址与 anon key 后重启。</p>
  </div>
  <RouterView />
</template>
