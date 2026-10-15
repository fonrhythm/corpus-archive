import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** 环境变量没填时，页面会显示配置提示而不是白屏。 */
export const isConfigured = Boolean(url && key && !url.includes('YOUR-PROJECT'))

// 这里只能出现 URL 与 anon / publishable key。service_role 密钥绝不能出现在前端。
export const supabase = createClient(url || 'http://localhost:54321', key || 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
})

export const BUCKETS = { public: 'public-media', private: 'private-media' } as const
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const
