<template>
  <dialog ref="dialog" @cancel.prevent="close()" class="note-edit-dialog vault-manager" :aria-label="$t('vault.manage')">
    <header class="manager-header"><h2 class="flex items-center gap-2.5 text-[13px] font-medium"><ShieldCheck class="h-4 w-4 text-muted-foreground"/>{{ $t(recoveryResult?'vault.recoveryTitle':session?'vault.manage':'vault.'+mode) }}</h2><button type="button" class="icon" :disabled="busy||!!recoveryResult" @click="close()" :aria-label="$t('common.close')"><X class="h-4 w-4"/></button></header>
    <div v-if="recoveryResult" class="manager-recovery space-y-4">
      <p class="hint">{{ $t('vault.recoveryOnce') }}</p>
      <code class="block select-all break-all rounded-xl border border-border/70 bg-muted/20 p-4 text-[13px] leading-6">{{ recoveryResult }}</code>
      <div class="flex gap-2"><button type="button" class="secondary" @click="copyRecovery"><Copy class="h-3.5 w-3.5"/>{{ $t('vault.copy') }}</button><button type="button" class="secondary" @click="downloadVaultFile(recoveryResult,'pomodolist-recovery-key.txt')"><Download class="h-3.5 w-3.5"/>{{ $t('vault.download') }}</button></div>
      <p v-if="error" role="alert" class="text-xs text-destructive">{{ error }}</p>
      <label class="flex items-start gap-2.5 rounded-xl border border-border/60 p-3 text-xs leading-5"><input v-model="savedRecovery" type="checkbox" class="mt-1 accent-primary"/>{{ $t('vault.recoverySaved') }}</label>
      <div class="flex justify-end border-t border-border/50 pt-4"><button class="workspace-add-button" :disabled="!savedRecovery" @click="finishRecovery">{{ $t('vault.done') }}</button></div>
    </div>
    <form v-else @submit.prevent="submit" class="manager-form">
      <div class="manager-scroll space-y-4">
        <CustomSelect v-if="session&&!challenge" :model-value="mode" :options="modes.map(item=>({value:item,label:$t('vault.'+item)}))" :aria-label="$t('vault.manage')" :disabled="busy" size="md" popover @update:model-value="choose($event as Mode)"/>
        <template v-if="challenge"><p class="hint">{{ $t('vault.sent') }} {{ $t('vault.emailHint') }}</p><label class="label">{{ $t('vault.code') }}<input v-model="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" class="field font-mono tracking-widest" required autofocus :disabled="busy"/></label></template>
        <template v-else>
          <fieldset v-if="mode==='import'" class="space-y-3 border-b border-border/50 pb-4">
            <legend class="mb-1 text-xs font-medium">{{ $t('vault.backupTitle') }}</legend>
            <label class="label">{{ $t('vault.backupFile') }}<input type="file" accept=".pvault,application/octet-stream,application/json" @change="selectFile" class="field file-field" required :disabled="busy"/></label>
            <label class="label">{{ $t('vault.backupPassword') }}<input v-model="backupPassword" type="password" class="field" autocomplete="off" maxlength="1024" required :disabled="busy"/></label>
            <p class="hint">{{ $t('vault.importHint') }}</p>
          </fieldset>
          <p v-if="mode==='import'" class="text-xs font-medium">{{ $t('vault.newVaultTitle') }}</p>
          <label v-if="mode==='create'||mode==='import'" class="label">{{ $t('secure.sessionName') }}<input v-model="name" maxlength="100" class="field" required :disabled="busy"/></label>
          <p v-if="mode==='upgrade'" class="hint">{{ $t('vault.upgradeHint') }}</p>
          <p v-if="mode==='recover'&&!recoverable" class="hint">{{ $t('vault.recoveryHint') }}</p>
          <label v-if="['password','upgrade','backup','keys'].includes(mode)" class="label">{{ $t('vault.currentPassword') }}<input v-model="currentPassword" class="field" type="password" autocomplete="current-password" required maxlength="1024" :disabled="busy"/></label>
          <label v-if="mode==='recover'&&recoverable" class="label">{{ $t('vault.recoveryCode') }}<input v-model="recoveryInput" class="field font-mono" autocomplete="off" spellcheck="false" required maxlength="64" :disabled="busy"/></label>
          <template v-if="!['delete','backup','keys'].includes(mode)&&(mode!=='recover'||recoverable)">
            <label class="label">{{ $t(mode==='create'?'vault.vaultPassword':'vault.newPassword') }}<input v-model="newPassword" type="password" class="field" autocomplete="new-password" minlength="12" maxlength="1024" required :disabled="busy"/></label>
            <label class="label">{{ $t('vault.repeat') }}<input v-model="repeated" type="password" class="field" autocomplete="new-password" minlength="12" maxlength="1024" required :disabled="busy"/></label>
            <p class="hint">{{ $t('vault.passwordRule') }}</p>
          </template>
          <fieldset v-if="mode==='backup'" class="space-y-3 border-t border-border/50 pt-4">
            <legend class="pr-2 text-xs font-medium">{{ $t('vault.backupTitle') }}</legend>
            <label class="label">{{ $t('vault.backupPassword') }}<input v-model="backupPassword" type="password" class="field" autocomplete="new-password" minlength="12" maxlength="1024" required :disabled="busy"/></label>
            <label class="label">{{ $t('vault.repeat') }}<input v-model="backupRepeated" type="password" class="field" autocomplete="new-password" required :disabled="busy"/></label>
            <p class="hint">{{ $t('vault.backupHint') }}</p>
          </fieldset>
          <template v-if="mode==='delete'"><p class="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs leading-5 text-destructive">{{ $t('vault.destructive') }}</p><label class="flex items-start gap-2.5 text-xs leading-5"><input v-model="destructiveConfirmed" type="checkbox" class="mt-1 accent-destructive" :disabled="busy"/>{{ $t('vault.destructiveConfirm') }}</label></template>
          <p v-if="['password','recover','delete','keys'].includes(mode)" class="hint">{{ $t('vault.emailHint') }}</p>
        </template>
        <p v-if="error" role="alert" class="text-xs leading-5 text-destructive">{{ error }}</p>
      </div>
      <footer class="manager-footer"><button type="button" class="secondary" :disabled="busy" @click="close()">{{ $t('vault.cancel') }}</button><button class="workspace-add-button" :class="{'!bg-destructive !text-white':mode==='delete'}" :disabled="busy||(mode==='delete'&&!destructiveConfirmed)||(mode==='recover'&&!recoverable)"><Loader2 v-if="busy" class="h-3.5 w-3.5 animate-spin"/>{{ challenge?$t('vault.confirm'):['password','recover','delete','keys'].includes(mode)?$t('vault.sendCode'):mode==='backup'?$t('vault.download'):$t('common.save') }}</button></footer>
    </form>
  </dialog>
</template>
<script setup lang="ts">
import {ref,computed,onBeforeUnmount} from 'vue'
import {X,Loader2,ShieldCheck,Copy,Download} from 'lucide-vue-next'
import {useI18n} from 'vue-i18n'
import {useWorkspaceClient} from '@/lib/workspaceScope'
import {createRecoverableVault,isRecoverableVault,isSealedVault,unlockVaultKey,encryptVaultValue,decryptVaultValue,changeVaultPassword,recoverVault,rotateVaultRecovery,vaultKeyId,encryptVaultBackup,decryptVaultBackup} from '@/lib/vaultCrypto'
import {vaultSecurity,downloadVaultFile} from '../lib/vaultApi'
import CustomSelect from '@/components/ui/CustomSelect.vue'
type Mode='create'|'password'|'recover'|'upgrade'|'delete'|'backup'|'import'|'keys'
interface Session{id:string;name:string;password_hash:string;version?:number}
const emit=defineEmits<{changed:[]}>(),client=useWorkspaceClient(),{t}=useI18n()
const dialog=ref<HTMLDialogElement>(),session=ref<Session|null>(null),mode=ref<Mode>('create'),name=ref(''),busy=ref(false),error=ref(''),newPassword=ref(''),repeated=ref(''),currentPassword=ref(''),recoveryInput=ref(''),otp=ref(''),challenge=ref(''),recoveryResult=ref(''),savedRecovery=ref(false),destructiveConfirmed=ref(false),backupPassword=ref(''),backupRepeated=ref(''),file=ref<File|null>(null)
let generation=0,pendingRecovery=''
const recoverable=computed(()=>!!session.value&&isRecoverableVault(session.value.password_hash))
const modes=computed<Mode[]>(()=>recoverable.value?['password','recover','keys','backup','delete']:['upgrade','backup','delete'])
function clearSecrets(){newPassword.value='';repeated.value='';currentPassword.value='';recoveryInput.value='';otp.value='';challenge.value='';backupPassword.value='';backupRepeated.value='';pendingRecovery='';file.value=null}
function choose(next:Mode){clearSecrets();error.value='';destructiveConfirmed.value=false;mode.value=next}
function open(next:Mode,value:Session|null=null,initialName=''){
  generation++;clearSecrets();session.value=value;name.value=initialName||value?.name||'';error.value='';savedRecovery.value=false;destructiveConfirmed.value=false;recoveryResult.value='';mode.value=next;dialog.value?.showModal()
}
function close(force=false){if(!force&&(busy.value||recoveryResult.value))return;generation++;clearSecrets();recoveryResult.value='';savedRecovery.value=false;session.value=null;dialog.value?.close()}
function finishRecovery(){recoveryResult.value='';close();emit('changed')}
function showRecovery(code:string){clearSecrets();savedRecovery.value=false;recoveryResult.value=code}
async function copyRecovery(){try{await navigator.clipboard.writeText(recoveryResult.value)}catch{error.value=t('secure.copyFailed')}}
function selectFile(e:Event){file.value=(e.target as HTMLInputElement).files?.[0]||null}
async function loadRows(){
  const sid=session.value!.id,rows:any[]=[]
  for(let start=0;;start+=500){const result=await client.from('secure_notes').select('*').eq('session_id',sid).order('id').range(start,start+499);if(result.error)throw result.error;rows.push(...(result.data||[]));if((result.data||[]).length<500)return rows}
}
async function decodeRows(){
  const s=session.value!,key=isSealedVault(s.password_hash)?await unlockVaultKey(currentPassword.value,s.password_hash):null
  if(!key&&currentPassword.value.trim()!==s.password_hash)throw Error('OperationError')
  return Promise.all((await loadRows()).map(async(row:any)=>({...row,...(key?await decryptVaultValue<Record<string,unknown>>(key,row.encrypted_payload,s.id+':'+row.id):{})})))
}
const fields=(n:any)=>({title:n.title||'',description:n.description||'',type:n.type==='password'?'password':'secret',username:n.username||'',password_encrypted:n.password_encrypted||'',url:n.url||'',content:n.content||''})
async function submit(){
  if(busy.value)return
  error.value='';const epoch=generation;busy.value=true
  try{
    if(challenge.value){
      await vaultSecurity({action:'finish',challenge:challenge.value,code:otp.value})
      if(epoch!==generation)return
      const code=pendingRecovery;clearSecrets();emit('changed')
      if(code)showRecovery(code);else close(true)
      return
    }
    if(!['delete','backup','keys'].includes(mode.value)&&(newPassword.value!==repeated.value))throw Error('PASSWORD_MISMATCH')
    if((mode.value==='delete')&&!destructiveConfirmed.value)return
    if(mode.value==='create'){
      const sealed=await createRecoverableVault(newPassword.value)
      if(epoch!==generation)return
      const result=await client.from('password_sessions').insert([{name:name.value.trim(),password_hash:sealed.metadata}]).select()
      if(result.error)throw result.error
      if(epoch!==generation)return
      emit('changed');showRecovery(sealed.recoveryCode);return
    }
    if(mode.value==='import'){
      if(!file.value)throw Error('VAULT_INVALID_DATA')
      if(file.value.size>10_000_000)throw Error('VAULT_BACKUP_TOO_LARGE')
      const backup:any=await decryptVaultBackup(backupPassword.value,await file.value.text())
      if(backup?.format!=='vault-records-v1'||!Array.isArray(backup.records)||backup.records.length>10000)throw Error('VAULT_INVALID_DATA')
      const sealed=await createRecoverableVault(newPassword.value),sid=crypto.randomUUID()
      const notes=await Promise.all(backup.records.map(async(n:any)=>{
        if(!n||!['password','secret'].includes(n.type)||typeof n.title!=='string'||n.title.length>160||Object.values(fields(n)).some(v=>typeof v!=='string'||v.length>100000))throw Error('VAULT_INVALID_DATA')
        const id=crypto.randomUUID();return {id,session_id:sid,encrypted_payload:{...await encryptVaultValue(sealed.key,fields(n),sid+':'+id),key_id:vaultKeyId(sealed.metadata)}}
      }))
      if(epoch!==generation)return
      await client.importVault(name.value.trim(),sealed.metadata,notes)
      if(epoch!==generation)return
      emit('changed');showRecovery(sealed.recoveryCode);return
    }
    if(mode.value==='backup'){
      if(backupPassword.value!==backupRepeated.value)throw Error('PASSWORD_MISMATCH')
      const records=(await decodeRows()).map(fields)
      if(records.length>10000)throw Error('VAULT_BACKUP_TOO_LARGE')
      const content=await encryptVaultBackup(backupPassword.value,{format:'vault-records-v1',records})
      if(epoch!==generation)return
      downloadVaultFile(content,'pomodolist-backup.pvault');close(true);return
    }
    if(mode.value==='upgrade'){
      const rows=await decodeRows(),sealed=await createRecoverableVault(newPassword.value),s=session.value!
      const previousKey=isSealedVault(s.password_hash)?await unlockVaultKey(currentPassword.value,s.password_hash):null
      const history=await client.vaultHistoryPayloads(rows.map((row:any)=>row.id))
      const notes=await Promise.all(rows.map(async(row:any)=>({id:row.id,version:row.version,
        encrypted_payload:{...await encryptVaultValue(sealed.key,fields(row),s.id+':'+row.id),key_id:vaultKeyId(sealed.metadata)},
        history:await Promise.all(history.filter(entry=>entry.note_id===row.id).map(async(entry)=>{
          if(!previousKey)throw Error('VAULT_INVALID_DATA')
          const value=await decryptVaultValue(previousKey,entry.encrypted_payload,s.id+':'+row.id)
          return {id:entry.id,encrypted_payload:{...await encryptVaultValue(sealed.key,value,s.id+':'+row.id),key_id:vaultKeyId(sealed.metadata)}}
        }))
      })))
      if(epoch!==generation)return
      await client.sealVault(s.id,s.password_hash,sealed.metadata,notes,s.version!,s.name)
      if(epoch!==generation)return
      emit('changed');showRecovery(sealed.recoveryCode);return
    }
    let prepared:{metadata:string;recoveryCode?:string}|undefined
    if(mode.value==='password')prepared=await changeVaultPassword(currentPassword.value,session.value!.password_hash,newPassword.value)
    if(mode.value==='keys')prepared=await rotateVaultRecovery(currentPassword.value,session.value!.password_hash)
    if(mode.value==='recover')prepared=await recoverVault(newPassword.value,session.value!.password_hash,recoveryInput.value)
    if(epoch!==generation)return
    const result=await vaultSecurity({action:'start',vaultId:session.value!.id,version:session.value!.version,operation:mode.value==='keys'?'password':mode.value,metadata:prepared?.metadata})
    if(epoch!==generation)return
    clearSecrets();challenge.value=result.challenge;pendingRecovery=prepared?.recoveryCode||''
  }catch(err){
    if(epoch!==generation)return
    const message=(err as Error)?.message||'',key=(err as Error)?.name==='OperationError'||message==='OperationError'||message==='VAULT_RECOVERY_INVALID'?'wrongSecret':message==='PASSWORD_MISMATCH'?'passwordMismatch':null
    error.value=key?t('vault.'+key):t('vault.errors.'+(['EMAIL_CONFIGURATION_REQUIRED','EMAIL_UNAVAILABLE','TEST_RECIPIENT_ONLY','RATE_LIMITED','INVALID_CODE','MFA_REQUIRED','AUTH_REQUIRED','SHARING_CONFLICT','ACCESS_DENIED','VAULT_PASSWORD_LENGTH','VAULT_BACKUP_TOO_LARGE','VAULT_INVALID_DATA','VAULT_ACK_REQUIRED'].find(code=>message.includes(code))||'UNAVAILABLE'))
  }finally{busy.value=false}
}
onBeforeUnmount(()=>close(true))
defineExpose({open,close})
</script>
<style scoped>
.vault-manager{height:fit-content;min-height:0;max-width:520px;max-height:calc(100dvh - 48px);padding:0;overflow:hidden}
.vault-manager[open]{display:flex;flex-direction:column}
.manager-header{@apply flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-5 py-4;}
.manager-form{display:flex;flex-direction:column;min-height:0;max-height:calc(100dvh - 120px)}
.manager-scroll{@apply min-h-0 overflow-y-auto px-5 py-5;}
.manager-recovery{@apply overflow-y-auto px-5 py-5;}
.manager-footer{@apply flex shrink-0 justify-end gap-2 border-t border-border/50 px-5 py-4;}
.field{@apply mt-2 h-10 w-full min-w-0 rounded-xl border border-border/60 bg-background/50 px-3 text-[13px] font-normal text-foreground outline-none transition-colors focus:border-primary/40 focus:ring-1 focus:ring-primary/20 disabled:opacity-50;}
.file-field{@apply h-auto min-h-10 py-2 text-xs file:mr-2 file:rounded-md file:border-0 file:bg-muted/70 file:px-2 file:py-1 file:text-xs file:text-foreground;}
.label{@apply block text-[11px] font-medium text-muted-foreground;}.hint{@apply text-[11px] leading-5 text-muted-foreground;}
.secondary{@apply inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border/70 bg-card/60 px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-40;}
.icon{@apply flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 disabled:opacity-40;}
.vault-manager .workspace-add-button{height:36px;padding:0 14px;font-weight:500}
@media(max-width:639px){.vault-manager{width:calc(100vw - 24px);max-height:calc(100dvh - 32px)}.manager-header,.manager-footer{padding:14px 16px}.manager-scroll,.manager-recovery{padding:16px}.manager-form{max-height:calc(100dvh - 104px)}}
</style>
