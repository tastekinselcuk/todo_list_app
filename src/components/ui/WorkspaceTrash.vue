<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArchiveRestore, Loader2, RefreshCw, Search, Trash2, X } from 'lucide-vue-next'
import CustomSelect from './CustomSelect.vue'
import { supabase } from '@/lib/supabase'
import { useWorkspacesStore } from '@/stores/workspaces'
import { useUIStore } from '@/stores/ui'
import { changeTrash, notifyTrash, onTrashChange, trashError, trashModules, type TrashItem } from '@/lib/workspaceTrash'

const emit=defineEmits<{close:[]}>(),{t,locale}=useI18n(),spaces=useWorkspacesStore(),ui=useUIStore()
const workspace=spaces.activeId,scope=spaces.sessionKey,owner=spaces.userId
const dialog=ref<HTMLDialogElement>(),confirmation=ref<HTMLDialogElement>(),items=ref<TrashItem[]>([])
const query=ref(''),module=ref(''),loading=ref(false),busy=ref(false),pending=ref(''),error=ref(''),total=ref(0),purgeable=ref(0),hasMore=ref(false)
const confirm=ref<TrashItem|'all'|null>(null),asOf=ref('')
let cursor:{time:string;key:string}|null=null,generation=0,disposed=false,debounce:ReturnType<typeof setTimeout>|undefined
let previousFocus:HTMLElement|null=null,confirmFocus:HTMLElement|null=null,scrollState:{body:string;root:string;gutter:string}|undefined
const moduleName=(id:string)=>t(id==='pomodoro'?'pomoNotes.tab':`workspace.modules.${id}Name`)
const options=computed(()=>[{value:'',label:t('trash.all')},...trashModules.map(id=>({value:id,label:moduleName(id)}))])
const current=()=>!disposed&&spaces.sessionKey===scope
function daysLeft(date:string){const days=Math.ceil((new Date(date).getTime()+30*86400000-Date.now())/86400000);return days>0?t('trash.daysLeft',{count:days}):t('trash.today')}
function dateLabel(date:string){return new Date(date).toLocaleString(locale.value,{dateStyle:'medium',timeStyle:'short'})}
async function load(append=false){
 const request=++generation;loading.value=true;error.value=''
 try{
  const result=await supabase.rpc('trash_page',{wid:workspace,only_module:module.value||null,query_text:query.value.trim(),after_time:append?cursor?.time:null,after_key:append?cursor?.key:null,page_size:40})
  if(!current()||request!==generation)return
  if(result.error)throw result.error
  const page=result.data as {items:TrashItem[];total:number;purgeable:number;has_more:boolean;cursor:typeof cursor;as_of:string}
  items.value=append?[...items.value,...page.items.filter(row=>!items.value.some(item=>item.key===row.key))]:page.items
  total.value=page.total;purgeable.value=page.purgeable;hasMore.value=page.has_more;cursor=page.cursor;asOf.value=page.as_of
 }catch(failure){if(current()&&request===generation)error.value=trashError(failure)}
 finally{if(current()&&request===generation)loading.value=false}
}
function removeLocal(item:TrashItem){items.value=items.value.filter(row=>row.key!==item.key);total.value=Math.max(0,total.value-1);if(item.can_purge)purgeable.value=Math.max(0,purgeable.value-1)}
async function restore(item:TrashItem){
 if(busy.value||!current())return
 busy.value=true;pending.value=item.key;error.value=''
 try{await changeTrash(workspace,item.module,item.id,'restore',item.version,owner);if(current()){removeLocal(item);ui.addToast(t('trash.restored'),'success')}}
 catch(failure){if(current())error.value=trashError(failure)}
 finally{busy.value=false;pending.value='';await nextTick();if(current())(dialog.value?.querySelector('[data-trash-restore]') as HTMLElement || dialog.value?.querySelector('[data-trash-close]') as HTMLElement)?.focus({preventScroll:true})}
}
async function ask(item:TrashItem|'all'){
 if(busy.value||loading.value)return
 confirmFocus=document.activeElement as HTMLElement;confirm.value=item
 await nextTick();confirmation.value?.showModal()
}
function cancelConfirm(){if(busy.value)return;confirmation.value?.close();confirm.value=null;confirmFocus?.focus({preventScroll:true})}
async function permanentlyDelete(){
 const target=confirm.value;if(!target||busy.value||!current())return
 busy.value=true;error.value=''
 try{
  if(target==='all'){
   const result=await supabase.rpc('trash_empty',{wid:workspace,only_module:module.value||null,cutoff:asOf.value})
   if(result.error)throw result.error
   if(current()){ui.addToast(t('trash.emptied',{count:result.data.count}),'info');for(const row of result.data.removed)notifyTrash({owner,workspace,module:row.module,id:row.id,version:row.version,action:'purge'})}
  }else{await changeTrash(workspace,target.module,target.id,'purge',target.version,owner);if(current())ui.addToast(t('trash.deleted'),'info')}
  if(current()){confirmation.value?.close();confirm.value=null;await load()}
 }catch(failure){if(current()){confirmation.value?.close();confirm.value=null;error.value=trashError(failure)}}
 finally{busy.value=false;await nextTick();if(current())(confirmFocus?.isConnected?confirmFocus:dialog.value?.querySelector<HTMLElement>('[data-trash-close]'))?.focus({preventScroll:true})}
}
function close(){if(busy.value)return;emit('close')}
watch([module,query],()=>{generation++;items.value=[];total.value=0;purgeable.value=0;hasMore.value=false;cursor=null;error.value='';loading.value=true;if(debounce)clearTimeout(debounce);debounce=setTimeout(()=>void load(),200)})
watch(()=>spaces.sessionKey,()=>emit('close'))
const unsubscribe=onTrashChange(change=>{
 if(change.owner===owner&&change.workspace===workspace&&!busy.value&&current()){
  if(debounce)clearTimeout(debounce);debounce=setTimeout(()=>void load(),100)
 }
})
onMounted(()=>{
 previousFocus=document.activeElement as HTMLElement
 scrollState={body:document.body.style.overflow,root:document.documentElement.style.overflow,gutter:document.documentElement.style.scrollbarGutter}
 document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';document.documentElement.style.scrollbarGutter='stable'
 dialog.value?.showModal();void load()
})
onBeforeUnmount(()=>{
 disposed=true;generation++;unsubscribe();if(debounce)clearTimeout(debounce)
 confirmation.value?.close();dialog.value?.close()
 if(scrollState){document.body.style.overflow=scrollState.body;document.documentElement.style.overflow=scrollState.root;document.documentElement.style.scrollbarGutter=scrollState.gutter}
 previousFocus?.isConnected&&previousFocus.focus({preventScroll:true})
})
</script>

<template>
 <Teleport to="body">
  <dialog ref="dialog" class="trash-dialog" :aria-label="t('trash.title')" @cancel.prevent="close" @click="event=>{if(event.target===dialog)close()}">
   <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <header class="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
     <div class="min-w-0"><h2 class="text-sm font-semibold">{{t('trash.title')}} <span v-if="total" class="ml-1.5 text-xs font-normal tabular-nums text-muted-foreground">{{total}}</span></h2><p class="mt-1 text-[11px] text-muted-foreground">{{spaces.active?.name}} · {{t('trash.hint')}}</p></div>
     <button type="button" data-trash-close class="trash-icon" :disabled="busy" :aria-label="t('common.close')" @click="close"><X class="h-4 w-4" /></button>
    </header>
    <div class="flex shrink-0 items-center gap-2 border-b border-border/40 px-4 py-3">
     <CustomSelect v-model="module" :options="options" :disabled="busy" :aria-label="t('trash.all')" size="sm" class="w-40 shrink-0" />
     <div class="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-2.5"><Search class="h-3.5 w-3.5 shrink-0 text-muted-foreground"/><input v-model="query" :disabled="busy" maxlength="100" :placeholder="t('trash.search')" :aria-label="t('trash.search')" class="min-w-0 flex-1 bg-transparent text-xs outline-none"/></div>
     <button type="button" class="trash-icon" :disabled="busy||loading" :aria-label="t('trash.refresh')" :title="t('trash.refresh')" @click="load()"><RefreshCw class="h-3.5 w-3.5"/></button>
    </div>
    <div v-if="error" role="alert" class="mx-4 mt-3 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground"><p>{{t('trash.'+error)}}</p><button type="button" :disabled="loading||busy" class="mt-2 font-medium text-foreground underline underline-offset-4" @click="load()">{{t('trash.retry')}}</button></div>
    <div class="trash-list min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3" :aria-busy="loading||busy">
     <div v-if="loading&&!items.length" role="status" :aria-label="t('app.loading')" class="space-y-2"><div v-for="i in 3" :key="i" class="h-16 animate-pulse rounded-xl border border-border/50 bg-muted/20 motion-reduce:animate-none"/></div>
     <ul v-else-if="items.length" class="space-y-2">
      <li v-for="item in items" :key="item.key" class="workspace-card flex items-center gap-3 px-3 py-3">
       <div class="min-w-0 flex-1"><p class="truncate text-[13px]" :title="item.title">{{item.title||t('trash.unnamed')}}</p><div class="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground"><span>{{moduleName(item.module)}}</span><span aria-hidden="true">·</span><time :datetime="item.deleted_at" :title="dateLabel(item.deleted_at)">{{daysLeft(item.deleted_at)}}</time></div></div>
       <div class="flex shrink-0 items-center gap-0.5"><button type="button" data-trash-restore class="trash-icon" :disabled="busy" :aria-label="t('trash.restore')+': '+item.title" :title="t('trash.restore')" @click="restore(item)"><Loader2 v-if="pending===item.key" class="h-4 w-4 animate-spin"/><ArchiveRestore v-else class="h-4 w-4"/></button><button v-if="item.can_purge" type="button" class="trash-icon hover:!bg-destructive/10 hover:!text-destructive" :disabled="busy" :aria-label="t('trash.permanentlyDelete')+': '+item.title" :title="t('trash.permanentlyDelete')" @click="ask(item)"><Trash2 class="h-4 w-4"/></button></div>
      </li>
     </ul>
     <div v-else-if="!error" class="flex min-h-48 flex-col items-center justify-center gap-2 text-center"><Trash2 class="mb-1 h-5 w-5 text-muted-foreground/50"/><p class="text-sm">{{t(query||module?'trash.noResults':'trash.empty')}}</p><p v-if="!query&&!module" class="text-xs text-muted-foreground">{{t('trash.emptyHint')}}</p></div>
     <button v-if="hasMore" type="button" :disabled="loading||busy" class="mt-3 w-full rounded-xl border border-border/60 px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted/40 disabled:opacity-50" @click="load(true)">{{t('trash.more')}}</button>
    </div>
    <footer v-if="purgeable&&!query&&!error" class="flex shrink-0 justify-end border-t border-border/40 px-4 py-3"><button type="button" class="rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40" :disabled="loading||busy" @click="ask('all')">{{t('trash.emptyTrash')}}</button></footer>
   </div>
  </dialog>
  <dialog ref="confirmation" class="trash-confirm" :aria-label="t('trash.confirmTitle')" @cancel.prevent="cancelConfirm" @click="event=>{if(event.target===confirmation)cancelConfirm()}">
   <div class="p-5"><h3 class="text-sm font-semibold">{{t('trash.confirmTitle')}}</h3><p v-if="confirm&&confirm!=='all'" class="mt-3 truncate text-xs">{{confirm.title}}</p><p class="mt-2 text-xs leading-relaxed text-muted-foreground">{{confirm==='all'?t('trash.confirmAll',{count:purgeable}):t('trash.confirmBody')}}</p><div class="mt-5 flex justify-end gap-2"><button type="button" autofocus :disabled="busy" class="rounded-xl border border-border/60 px-3 py-2 text-xs hover:bg-muted/40" @click="cancelConfirm">{{t('common.cancel')}}</button><button type="button" :disabled="busy" class="inline-flex items-center gap-1.5 rounded-xl bg-destructive px-3 py-2 text-xs font-medium text-destructive-foreground disabled:opacity-50" @click="permanentlyDelete"><Loader2 v-if="busy" class="h-3.5 w-3.5 animate-spin"/>{{t('trash.permanentlyDelete')}}</button></div></div>
  </dialog>
 </Teleport>
</template>

<style scoped>
.trash-dialog{width:min(680px,calc(100vw - 32px));max-width:calc(100vw - 16px);height:min(640px,calc(100dvh - 64px));max-height:calc(100dvh - 64px);padding:0;margin:auto;border:1px solid hsl(var(--border)/.7);border-radius:24px;background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 24px 80px rgb(0 0 0/.2);overflow:hidden}
.trash-dialog[open]{display:flex}
.trash-dialog::backdrop,.trash-confirm::backdrop{background:hsl(var(--background)/.7);backdrop-filter:blur(6px)}
.trash-confirm{width:min(380px,calc(100vw - 32px));padding:0;margin:auto;border:1px solid hsl(var(--border)/.7);border-radius:20px;background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 24px 80px rgb(0 0 0/.2)}
.trash-list{scrollbar-width:thin;scrollbar-color:hsl(var(--muted-foreground)/.3) transparent}
.trash-list::-webkit-scrollbar{width:5px}.trash-list::-webkit-scrollbar-track{background:transparent}.trash-list::-webkit-scrollbar-thumb{border-radius:8px;background:hsl(var(--muted-foreground)/.3)}
.trash-icon{@apply inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-40}
@media(max-width:479px){.trash-dialog{width:calc(100vw - 16px);height:calc(100dvh - 24px);max-height:calc(100dvh - 24px);border-radius:20px}}
@media(prefers-reduced-motion:no-preference){.trash-dialog[open],.trash-confirm[open]{animation:trash-appear .18s ease-out}@keyframes trash-appear{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}}
</style>
