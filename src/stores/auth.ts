import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase, isConfigured } from '@/lib/supabase'

export const useAuth = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const isAdmin = ref(false)
  const ready = ref(false)
  let started: Promise<void> | null = null

  async function refreshRole() {
    if (!session.value) { isAdmin.value = false; return }
    // 只读自己的 profile；角色只能由数据库管理员写入，客户端无法自行升级。
    const { data } = await supabase.from('profiles').select('role').eq('user_id', session.value.user.id).maybeSingle()
    isAdmin.value = data?.role === 'admin'
  }

  function init(): Promise<void> {
    if (started) return started
    started = (async () => {
      if (isConfigured) {
        const { data } = await supabase.auth.getSession()
        session.value = data.session
        await refreshRole()
        supabase.auth.onAuthStateChange((_e, s) => {
          session.value = s
          // 不在回调里直接 await 其他 supabase 调用，避免死锁
          setTimeout(() => { void refreshRole() }, 0)
        })
      }
      ready.value = true
    })()
    return started
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new Error(error.message === 'Invalid login credentials' ? '邮箱或密码不正确。' : error.message)
    const { data } = await supabase.auth.getSession()
    session.value = data.session
    await refreshRole()
    if (!isAdmin.value) {
      await supabase.auth.signOut()
      throw new Error('这个账号没有管理权限。')
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    session.value = null
    isAdmin.value = false
  }

  return { session, isAdmin, ready, init, signIn, signOut, email: computed(() => session.value?.user.email ?? '') }
})
