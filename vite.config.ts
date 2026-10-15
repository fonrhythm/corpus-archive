import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
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
})
