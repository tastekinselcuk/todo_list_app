<template>
  <slot v-if="state==='ready'" />
  <div v-else class="flex min-h-screen items-center justify-center bg-background p-5">
    <section class="w-full max-w-sm space-y-5 rounded-3xl border border-border/50 bg-card/80 p-6 shadow-sm" aria-live="polite">
      <ShieldCheck class="h-6 w-6 text-primary" />
      <div><h1 class="text-base font-medium">{{ t('mfaSecurity.required') }}</h1><p class="mt-2 text-xs leading-5 text-muted-foreground">{{ t(state==='error'?'mfaSecurity.loadFailed':'mfaSecurity.requiredHint') }}</p></div>
      <Loader2 v-if="state==='checking'" class="h-5 w-5 animate-spin text-muted-foreground" />
      <form v-else-if="state==='required'&&factors.length" class="space-y-3" @submit.prevent="verify">
        <CustomSelect v-if="factors.length>1" v-model="factorId" :options="factorOptions" :aria-label="t('mfaSecurity.choose')" />
        <label class="block text-xs text-muted-foreground" for="mfa-signin-code">{{ t('mfaSecurity.code') }}</label>
        <input id="mfa-signin-code" v-model="code" class="h-11 w-full rounded-xl border border-border bg-background px-3 text-center text-lg tracking-[.25em] outline-none focus:border-primary/50" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required :disabled="busy" autofocus />
        <p v-if="error" class="text-xs text-destructive" role="alert">{{ t('mfaSecurity.failed') }}</p>
        <button class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-xs font-medium text-primary-foreground disabled:opacity-40" :disabled="busy||!/^\d{6}$/.test(code)"><Loader2 v-if="busy" class="h-3.5 w-3.5 animate-spin" />{{ t('mfaSecurity.verify') }}</button>
      </form>
      <p v-else-if="state==='required'" class="text-xs text-muted-foreground">{{ t('mfaSecurity.unsupported') }}</p>
      <button v-if="state==='error'" type="button" class="text-xs font-medium text-primary" @click="refresh(true)">{{ t('mfaSecurity.retry') }}</button>
      <button type="button" class="block text-xs text-muted-foreground hover:text-foreground" :disabled="busy" @click="auth.logout('local')">{{ t('mfaSecurity.signOut') }}</button>
    </section>
  </div>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue'
import {Loader2,ShieldCheck} from 'lucide-vue-next'
import {useI18n} from 'vue-i18n'
import {useAuthStore} from '@/stores/auth'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import {mfaState,verifyMfaCode} from '@/lib/mfaClient'
const auth=useAuthStore(),{t}=useI18n(),emit=defineEmits<{verified:[]}>()
const state=ref<'checking'|'ready'|'required'|'error'>('checking'),factors=ref<{id:string;friendly_name?:string}[]>([]),factorId=ref(''),code=ref(''),busy=ref(false),error=ref(false)
const factorOptions=computed(()=>factors.value.map((factor,index)=>({value:factor.id,label:factor.friendly_name||t('mfaSecurity.app')+' '+(index+1)})))
let generation=0,disposed=false,request:Promise<void>|null=null,requestOwner=''
function refresh(remote=false){
 const owner=auth.user?.id;if(!owner||busy.value)return Promise.resolve()
 if(request&&requestOwner===owner)return request
 const epoch=++generation,previous=state.value;requestOwner=owner
 if(previous!=='ready')state.value='checking'
 const pending=(async()=>{
  try{const result=await mfaState(remote);if(disposed||epoch!==generation||auth.user?.id!==owner||result.userId!==owner)return
   state.value=result.required?'required':'ready';factors.value=result.factors;factorId.value=result.factors[0]?.id||''
  }catch{if(!disposed&&epoch===generation)state.value=previous==='ready'?'ready':'error'}
  finally{if(epoch===generation)request=null}
 })();request=pending;return pending
}
async function verify(){
 if(busy.value||!/^\d{6}$/.test(code.value)||!factorId.value)return
 const owner=auth.user?.id;busy.value=true;error.value=false
 try{await verifyMfaCode(factorId.value,code.value);if(disposed||auth.user?.id!==owner)return
  generation++;request=null;code.value='';state.value='ready';emit('verified')
 }catch{if(!disposed&&auth.user?.id===owner){error.value=true;code.value=''}}finally{if(!disposed&&auth.user?.id===owner)busy.value=false}
}
function remoteCheck(){void refresh(true)}
watch(()=>auth.user?.id,()=>{generation++;state.value='checking';busy.value=false;code.value='';factors.value=[];void refresh()},{immediate:true})
onMounted(()=>{window.addEventListener('mfa-required',remoteCheck);window.addEventListener('focus',remoteCheck)})
onBeforeUnmount(()=>{disposed=true;generation++;code.value='';window.removeEventListener('mfa-required',remoteCheck);window.removeEventListener('focus',remoteCheck)})
</script>
