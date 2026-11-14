<template>
  <section class="min-w-0 rounded-2xl border border-border/60 bg-card/60 shadow-sm">
    <header class="flex min-h-12 items-center justify-between gap-3 border-b border-border/40 px-4 py-2.5"><h3 class="flex items-center gap-2 text-[13px] font-medium"><ShieldCheck class="h-4 w-4 text-muted-foreground" />{{ t('mfaSecurity.title') }}</h3><span class="text-[11px]" :class="factors.length?'text-primary':'text-muted-foreground'">{{ t(factors.length?'mfaSecurity.active':'mfaSecurity.inactive') }}</span></header>
    <div class="space-y-4 p-4">
      <p class="text-xs leading-5 text-muted-foreground">{{ t('mfaSecurity.description') }}</p>
      <Loader2 v-if="loading" class="h-4 w-4 animate-spin text-muted-foreground" />
      <div v-for="(factor,index) in factors" :key="factor.id" class="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2.5"><span class="text-xs">{{ factor.friendly_name||t('mfaSecurity.app')+' '+(index+1) }}</span><button type="button" class="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-destructive disabled:opacity-40" :disabled="busy||Boolean(enrollment)" @click="startRemoval(factor.id)">{{ t('mfaSecurity.disable') }}</button></div>
      <div v-if="enrollment" class="space-y-3 rounded-xl border border-border/50 bg-background/40 p-4">
        <p class="text-xs text-muted-foreground">{{ t('mfaSecurity.scan') }}</p><img :src="enrollment.qr" :alt="t('mfaSecurity.scan')" class="mx-auto h-44 w-44 rounded-xl bg-white p-2" />
        <div><p class="text-[11px] text-muted-foreground">{{ t('mfaSecurity.key') }}</p><code class="mt-1 block select-all break-all rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-xs">{{ enrollment.secret }}</code></div>
        <p class="text-[11px] leading-5 text-muted-foreground">{{ t('mfaSecurity.backup') }}</p>
      </div>
      <form v-if="enrollment||removeId" class="space-y-3" @submit.prevent="confirm">
        <p v-if="removeId" class="text-xs text-muted-foreground">{{ t('mfaSecurity.removeHint') }}</p>
        <CustomSelect v-if="removeId&&factors.length>1" v-model="verificationId" :options="factorOptions" :aria-label="t('mfaSecurity.choose')" />
        <label for="mfa-settings-code" class="block text-xs text-muted-foreground">{{ t('mfaSecurity.code') }}</label>
        <div class="flex flex-wrap gap-2"><input id="mfa-settings-code" v-model="code" class="h-9 min-w-0 flex-1 rounded-xl border border-border/60 bg-background/40 px-3 text-sm tracking-widest outline-none focus:border-primary/50" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required :disabled="busy" /><button type="submit" class="rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-40" :disabled="busy||!/^\d{6}$/.test(code)">{{ t('mfaSecurity.verify') }}</button><button type="button" class="rounded-xl border border-border/60 px-3 py-2 text-xs text-muted-foreground disabled:opacity-40" :disabled="busy" @click="cancel">{{ t('mfaSecurity.cancel') }}</button></div>
      </form>
      <button v-else type="button" class="inline-flex min-h-9 items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-3 text-xs font-medium transition-colors hover:bg-muted/50 disabled:opacity-40" :disabled="busy||loading" @click="enroll"><Plus class="h-3.5 w-3.5" />{{ t('mfaSecurity.enable') }}</button>
      <p v-if="feedback" role="status" class="text-xs" :class="failed?'text-destructive':'text-muted-foreground'">{{ t('mfaSecurity.'+feedback) }}</p>
      <button v-if="feedback==='loadFailed'" type="button" class="text-xs text-primary" @click="load">{{ t('mfaSecurity.retry') }}</button>
    </div>
  </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue'
import {Loader2,Plus,ShieldCheck} from 'lucide-vue-next'
import {useI18n} from 'vue-i18n'
import {supabase} from '@/lib/supabase'
import {useAuthStore} from '@/stores/auth'
import {verifyMfaCode} from '@/lib/mfaClient'
import CustomSelect from '@/components/ui/CustomSelect.vue'
const auth=useAuthStore(),{t}=useI18n()
const factors=ref<{id:string;friendly_name?:string}[]>([]),enrollment=ref<{id:string;qr:string;secret:string}|null>(null)
const loading=ref(false),busy=ref(false),code=ref(''),removeId=ref(''),verificationId=ref(''),feedback=ref(''),failed=ref(false)
const factorOptions=computed(()=>factors.value.map((factor,index)=>({value:factor.id,label:factor.friendly_name||t('mfaSecurity.app')+' '+(index+1)})))
let disposed=false,revision=0
function clear(){enrollment.value=null;removeId.value='';verificationId.value='';code.value=''}
async function load(){
 const owner=auth.user?.id,epoch=++revision;loading.value=true
 try{const result=await supabase.auth.mfa.listFactors();if(result.error)throw result.error
  if(!disposed&&epoch===revision&&auth.user?.id===owner){factors.value=result.data.totp;feedback.value='';return true}return false
 }catch{if(!disposed&&epoch===revision){feedback.value='loadFailed';failed.value=true}return false}finally{if(epoch===revision)loading.value=false}
}
async function enroll(){
 if(busy.value)return
 const owner=auth.user?.id;let pendingId='';busy.value=true;feedback.value=''
 try{const result=await supabase.auth.mfa.enroll({factorType:'totp',issuer:'Pomodolist'});if(result.error)throw result.error
  pendingId=result.data.id
  if(disposed||auth.user?.id!==owner){if(auth.user?.id===owner)await supabase.auth.mfa.unenroll({factorId:result.data.id});return}
  let qr=result.data.totp.qr_code
  const prefix='data:image/svg+xml;utf-8,'
  if(qr.startsWith(prefix)&&qr.slice(prefix.length).trimStart().startsWith('<'))qr=prefix+encodeURIComponent(qr.slice(prefix.length))
  if(!qr.startsWith('data:image/'))throw new Error('INVALID_QR')
  enrollment.value={id:result.data.id,qr,secret:result.data.totp.secret};code.value=''
 }catch{if(pendingId&&auth.user?.id===owner)try{await supabase.auth.mfa.unenroll({factorId:pendingId})}catch{/* Unverified factors never grant access. */}if(!disposed&&auth.user?.id===owner){feedback.value='failed';failed.value=true}}finally{if(auth.user?.id===owner)busy.value=false}
}
function startRemoval(id:string){if(busy.value||enrollment.value)return;removeId.value=id;verificationId.value=factors.value[0]?.id||'';code.value='';feedback.value=''}
async function confirm(){
 if(busy.value||!/^\d{6}$/.test(code.value))return
 const owner=auth.user?.id,target=removeId.value,factor=enrollment.value?.id||verificationId.value
 if(!factor)return
 busy.value=true;feedback.value=''
 try{await verifyMfaCode(factor,code.value);if(disposed||auth.user?.id!==owner)return
  if(target){const result=await supabase.auth.mfa.unenroll({factorId:target});if(result.error)throw result.error}
  if(target)factors.value=factors.value.filter(item=>item.id!==target)
  else if(!factors.value.some(item=>item.id===factor))factors.value.push({id:factor})
  clear();const loaded=await load();if(loaded&&!disposed&&auth.user?.id===owner){feedback.value=target?'removed':'setupDone';failed.value=false}
 }catch{if(!disposed&&auth.user?.id===owner){feedback.value='failed';failed.value=true;code.value=''}}finally{if(auth.user?.id===owner)busy.value=false}
}
async function cancel(){
 if(busy.value)return
 const owner=auth.user?.id,id=enrollment.value?.id;busy.value=true
 try{if(id){const result=await supabase.auth.mfa.unenroll({factorId:id});if(result.error)throw result.error}if(auth.user?.id===owner)clear()}
 catch{if(auth.user?.id===owner){feedback.value='failed';failed.value=true}}finally{if(auth.user?.id===owner)busy.value=false}
}
watch(()=>auth.user?.id,()=>{revision++;clear();factors.value=[];busy.value=false;void load()})
onMounted(load)
onBeforeUnmount(()=>{disposed=true;revision++;const id=enrollment.value?.id;if(id&&!busy.value)void supabase.auth.mfa.unenroll({factorId:id}).catch(()=>{});clear()})
</script>
