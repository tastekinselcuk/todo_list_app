import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { i18n } from './i18n'
import './index.css'
import { supabase, typedSupabase } from './lib/supabase'
import { createErrorReporter } from './lib/errorReporting'

const app = createApp(App)
app.use(createPinia())
app.use(i18n)
const reportError=createErrorReporter({
  release:import.meta.env.VITE_APP_RELEASE||'development',
  screen:()=> {
    const screen=document.querySelector('[data-app-screen]')?.getAttribute('data-app-screen')
    return screen&&['workspace','settings','analytics'].includes(screen)?screen:'unknown'
  },
  async send(code,screen,release){
    const {data}=await supabase.auth.getSession()
    if(data.session)await typedSupabase.rpc('report_client_error',{code,screen,release})
  },
})
app.config.errorHandler=(error)=>{if(import.meta.env.DEV)console.error(error);void reportError('UI_RENDER_ERROR')}
window.addEventListener('error',()=>{void reportError('SCRIPT_ERROR')})
window.addEventListener('unhandledrejection',()=>{void reportError('UNHANDLED_PROMISE')})
app.mount('#app')
