import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { execFileSync } from 'node:child_process'

let revision=process.env.COMMIT_REF||process.env.GITHUB_SHA||''
if(!revision)try{revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()}catch{revision='development'}
revision=/^[a-zA-Z0-9._-]{1,64}$/.test(revision)?revision:'development'

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_RELEASE': JSON.stringify(revision.slice(0,40)),
  },
  plugins: [vue(),{
    name:'application-release-metadata',
    generateBundle(){this.emitFile({type:'asset',fileName:'release.json',source:JSON.stringify({revision,builtAt:new Date().toISOString()})})},
  }],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
