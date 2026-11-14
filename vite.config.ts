import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_RELEASE': JSON.stringify((process.env.COMMIT_REF || process.env.GITHUB_SHA || 'development').slice(0,40)),
  },
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
