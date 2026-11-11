<template>
  <slot v-if="ready" />
  <section v-else class="mx-auto max-w-2xl rounded-2xl border border-border/60 bg-card/70 p-5 sm:p-7 space-y-4" aria-live="polite">
    <div class="flex items-center gap-3"><ShieldCheck class="h-5 w-5 text-muted-foreground"/><h2 class="text-sm font-medium">{{ $t('vault.noticeTitle') }}</h2></div>
    <template v-if="!loading">
      <p class="text-xs text-muted-foreground">{{ $t('vault.noticeIntro') }}</p>
      <div class="space-y-3 text-xs leading-relaxed text-muted-foreground"><p v-for="key in ['noticeEncryption','noticeRecovery','noticeDevice','noticeLimits','noticeRights']" :key="key">{{ $t('vault.'+key) }}</p></div>
      <label class="flex items-start gap-3 rounded-xl border border-border/60 p-3 text-xs leading-5"><input v-model="checked" type="checkbox" class="mt-1 accent-primary"/>{{ $t('vault.acknowledge') }}</label>
      <p v-if="error" role="alert" class="text-xs text-destructive">{{ error }}</p>
      <button class="workspace-add-button" :disabled="!checked||busy" @click="accept">{{ $t('vault.continue') }}</button>
    </template>
    <Loader2 v-else class="h-4 w-4 animate-spin"/>
  </section>
</template>
<script setup lang="ts">
import {ref,watch,onBeforeUnmount} from 'vue'
import {ShieldCheck,Loader2} from 'lucide-vue-next'
import {supabase} from '@/lib/supabase'
import {useAuthStore} from '@/stores/auth'
import {useI18n} from 'vue-i18n'
const auth=useAuthStore(),{t}=useI18n(),ready=ref(false),checked=ref(false),loading=ref(true),busy=ref(false),error=ref('')
let generation=0
watch(()=>auth.user?.id,async owner=>{
  const epoch=++generation;ready.value=false;checked.value=false;loading.value=true;error.value=''
  if(!owner){loading.value=false;return}
  try{const result=await supabase.rpc('vault_acknowledged',{uid:owner});if(result.error)throw result.error;if(epoch===generation&&auth.user?.id===owner)ready.value=result.data===true}
  catch{if(epoch===generation)error.value=t('vault.errors.UNAVAILABLE')}finally{if(epoch===generation)loading.value=false}
},{immediate:true})
async function accept(){
  const owner=auth.user?.id,epoch=generation
  if(!checked.value||busy.value||!owner)return
  busy.value=true;error.value=''
  try{const result=await supabase.rpc('vault_acknowledge');if(result.error)throw result.error;if(epoch===generation&&auth.user?.id===owner)ready.value=true}
  catch{if(epoch===generation)error.value=t('vault.errors.UNAVAILABLE')}finally{busy.value=false}
}
onBeforeUnmount(()=>generation++)
</script>
