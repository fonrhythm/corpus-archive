import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => ({
  base: loadEnv(mode, process.cwd(), 'VITE_').VITE_BASE_PATH || '/',
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          tiptap: ['@tiptap/core', '@tiptap/vue-3', '@tiptap/starter-kit'],
          supabase: ['@supabase/supabase-js']
        }
      }
    }
  },
  test: { environment: 'node' }
}))
