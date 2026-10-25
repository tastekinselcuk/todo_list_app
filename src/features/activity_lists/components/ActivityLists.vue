<template>
 <div ref="libraryRoot" class="activity-library workspace-content mx-auto space-y-3">
  <div class="workspace-toolbar space-y-3">
   <template v-if="!opened">
    <form v-if="canWrite" class="flex items-center gap-2" @submit.prevent="createCollection"><input v-model="newName" class="activity-input flex-1" maxlength="80" :placeholder="t('activityLibrary.collectionPlaceholder')" :aria-label="t('activityLibrary.collectionName')" :disabled="working||store.setupRequired" /><button type="submit" class="activity-button is-primary !min-h-[40px]" :disabled="working||store.isLoading||store.setupRequired||!newName.trim()"><Plus :size="15" />{{ t('activityLibrary.create') }}</button></form>
    <div class="activity-breadcrumb"><span>{{ t(showArchived?'activityLibrary.archivedCollections':'activityLibrary.collections') }}</span><button v-if="hasArchives||showArchived" type="button" class="activity-subtle" @click="showArchived=!showArchived"><Archive :size="13" />{{ t(showArchived?'activityLibrary.showActive':'activityLibrary.showArchived') }}</button></div>
   </template>
   <template v-else>
    <div class="activity-breadcrumb"><button type="button" class="activity-back" :aria-label="t('activityLibrary.back')" @click="opened=''"><ArrowLeft :size="16" /></button><button class="activity-subtle" @click="opened=''">{{ t('activityLibrary.collections') }}</button><ChevronRight :size="12" class="opacity-40" /><span class="activity-collection-title"><span v-if="currentCollection" class="activity-color-dot" :style="{backgroundColor:currentCollection.color}" />{{ collectionName }}</span><button v-if="canWrite&&currentCollection" type="button" class="activity-icon ml-auto" :aria-label="t('activityLibrary.editCollection')" @click="editCollection(currentCollection)"><MoreHorizontal :size="17" /></button></div>
    <div v-if="currentCollection?.archived_at" class="activity-notice"><span>{{ t('activityLibrary.collectionArchived') }}</span><button v-if="canWrite" class="activity-button" :disabled="working" @click="changeArchive(currentCollection,true)"><RotateCcw :size="14" />{{ t('activityLibrary.restore') }}</button></div>
    <form v-else-if="canWrite" class="activity-add" @submit.prevent="runSearch">
     <CustomSelect v-model="selectedType" :options="typeOptions" size="sm" popover :aria-label="t('activityLibrary.type')" :disabled="store.setupRequired" class="activity-add-type" />
     <input v-model="searchQuery" class="activity-input" maxlength="240" :placeholder="t('activities.searchPlaceholders.'+selectedType)" :aria-label="t('activities.searchPlaceholders.'+selectedType)" :disabled="store.setupRequired" />
     <button type="submit" class="activity-button !min-h-[40px]" :disabled="!searchQuery.trim()||isSearching||store.setupRequired" :title="t('activities.search')" :aria-label="t('activities.search')"><Loader2 v-if="isSearching" :size="15" class="animate-spin" /><Search v-else :size="15" /><span class="hidden sm:inline">{{ t('activities.search') }}</span></button>
     <button type="button" class="activity-button is-primary !min-h-[40px]" :disabled="!searchQuery.trim()||working||store.setupRequired" :title="t('activityLibrary.addByName')" :aria-label="t('activityLibrary.addByName')" @click="addManual"><Plus :size="15" /><span class="hidden sm:inline">{{ t('activityLibrary.add') }}</span></button>
    </form>
    <div class="activity-list-filters"><CustomSelect v-model="typeFilter" :options="filterTypes" size="sm" variant="ghost" popover :aria-label="t('activityLibrary.filterType')" class="w-[120px]" /><CustomSelect v-model="statusFilter" :options="statusOptions" size="sm" variant="ghost" popover :aria-label="t('activityLibrary.filterStatus')" class="w-[130px]" /><span class="activity-hint ml-auto">{{ t('activityLibrary.itemCount',{count:currentItems.length}) }}</span></div>
   </template>
  </div>

  <div v-if="store.error&&!editorMode" class="activity-notice" role="alert"><span>{{ t('activityLibrary.errors.'+store.error) }}</span><button type="button" class="activity-subtle shrink-0" :disabled="store.isLoading||working" @click="reload">{{ t('activityLibrary.retry') }}</button></div>
  <div v-if="store.isLoading&&!store.items.length&&!store.collections.length" class="activity-empty" role="status"><Loader2 :size="20" class="animate-spin mx-auto mb-2" />{{ t('activityLibrary.loading') }}</div>
  <Transition v-else name="activity-view" mode="out-in">
   <div v-if="!opened" key="collections">
    <p v-if="!store.collections.length&&!store.items.length" class="activity-hint mb-3 px-1">{{ t('activityLibrary.startHint') }}</p>
    <div class="workspace-card-grid activity-collection-grid">
     <article v-for="group in shownCollections" :key="group.id" class="activity-collection-card workspace-card">
      <button type="button" class="activity-collection-open" :aria-label="t('activityLibrary.openCollection',{name:group.name})" @click="opened=group.id">
       <div class="flex items-center gap-2.5 pr-5"><Folder :size="18" :stroke-width="1.5" :style="{color:group.color}" /><h3>{{ group.name }}</h3></div>
       <div class="activity-collection-preview"><span v-for="item in group.items.slice(0,4)" :key="item.id" class="activity-mini-cover"><img v-if="activityImage(item.image_url)" :src="activityImage(item.image_url)!" alt="" loading="lazy" referrerpolicy="no-referrer" @error="($event.target as HTMLImageElement).style.opacity='0'" /><component v-else :is="typeIcons[item.type]" :size="17" :stroke-width="1.3" /></span><span v-if="!group.items.length" class="activity-hint">{{ t('activityLibrary.emptyCollection') }}</span><span v-if="group.items.length>4" class="activity-hint ml-1">+{{ group.items.length-4 }}</span></div>
       <div class="activity-collection-summary"><span>{{ t('activityLibrary.itemCount',{count:group.items.length}) }}</span><span v-if="group.done">{{ t('activityLibrary.completedCount',{count:group.done}) }}</span><ChevronRight :size="14" class="ml-auto opacity-50" /></div>
      </button>
      <button v-if="canWrite&&group.id!==generalCollection" type="button" class="activity-icon activity-collection-menu" :aria-label="t('activityLibrary.editCollection')+': '+group.name" @click="editCollection(group.source!)"><MoreHorizontal :size="16" /></button>
     </article>
    </div>
    <p v-if="!shownCollections.length" class="activity-empty">{{ t('activityLibrary.noArchives') }}</p>
   </div>
   <div v-else :key="opened" class="space-y-3">
    <section v-if="searched" class="activity-results" :aria-label="t('activities.searchResults')"><div class="flex items-center justify-between mb-2"><span class="activity-hint">{{ t('activities.searchResults') }}</span><button type="button" class="activity-icon" :aria-label="t('common.close')" @click="clearSearch"><X :size="15" /></button></div><p v-if="isSearching" class="activity-hint py-2" role="status">{{ t('activityLibrary.loading') }}</p><p v-else-if="!searchResults.length" class="activity-hint py-2">{{ t('activities.noSearchResults') }}</p><div v-else class="activity-results-grid"><button v-for="result in searchResults" :key="result.externalSource+result.externalId" type="button" class="activity-result" :disabled="working||resultAdded(result)" @click="addResult(result)"><span class="activity-result-image"><img v-if="activityImage(result.imageUrl)" :src="activityImage(result.imageUrl)!" alt="" loading="lazy" referrerpolicy="no-referrer" /><component v-else :is="typeIcons[result.type]" :size="17" /></span><span class="flex-1 min-w-0"><span class="block text-xs line-clamp-2">{{ result.title }}</span><span class="activity-hint block truncate">{{ result.subtitle }}</span></span><Check v-if="resultAdded(result)" :size="15" class="text-primary shrink-0" /><Plus v-else :size="15" class="text-muted-foreground shrink-0" /></button></div></section>
    <div v-if="filteredItems.length" class="workspace-card-grid activity-items-grid"><ActivityCard v-for="item in filteredItems" :key="item.id" :item="item" :busy="store.pending.includes(item.id)||working" :can-organize="!store.setupRequired" :read-only="!!currentCollection?.archived_at" @toggle="toggleItem" @delete="removeItem" @organize="organizeItem" /></div>
    <div v-else class="activity-empty"><FolderOpen :size="26" :stroke-width="1.2" class="mx-auto mb-3 opacity-50" /><p>{{ t(currentItems.length?'activityLibrary.noMatches':'activityLibrary.emptyHint') }}</p></div>
   </div>
  </Transition>
  <Teleport to="body"><ActivityCollectionEditor v-if="editorMode" :mode="editorMode" :collection="editingCollection" :item="editingItem" :collections="store.collections" :group-ids="editingItem?store.memberships.filter(m=>m.item_id===editingItem!.id).map(m=>m.group_id):[]" :busy="working" :error="editorError" @close="closeEditor" @save="saveEditor" @archive="changeArchive(editingCollection!,!!editingCollection?.archived_at)" /></Teleport>
 </div>
</template>
<script setup lang="ts">
import { computed,ref,watch,inject,nextTick,onDeactivated,onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Folder,FolderOpen,ArrowLeft,ChevronRight,MoreHorizontal,Plus,Search,X,Check,Loader2,Film,Tv,BookOpen,MapPin,Archive,RotateCcw } from 'lucide-vue-next'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useModuleAccess,useModuleLoad,useWorkspaceDraft } from '@/lib/workspaceScope'
import { useSearchReveal,searchScrollKey } from '@/lib/searchNavigation'
import { useUIStore } from '@/stores/ui'
import { useWorkspacesStore } from '@/stores/workspaces'
import { useActivityListsStore,type ActivityItem } from '../stores/activityLists'
import { activityImage,activityLibraryError,activityTypes,generalCollection,type ActivityCollection } from '../lib/collections'
import { searchActivities,isTmdbConfigured,type ActivityType,type SearchResult } from '../lib/providers'
import ActivityCard from './ActivityCard.vue'
import ActivityCollectionEditor from './ActivityCollectionEditor.vue'
const {t}=useI18n(),{canWrite}=useModuleAccess('activities'),store=useActivityListsStore(),ui=useUIStore(),workspaces=useWorkspacesStore(),scope=workspaces.sessionKey
const libraryRoot=ref<HTMLElement>(),reveal=inject(searchScrollKey,null)
const opened=useWorkspaceDraft('activity-open-collection',''),selectedType=useWorkspaceDraft<ActivityType>('activity-type','movie'),searchQuery=useWorkspaceDraft('activity-search','')
const statusFilter=ref('all'),typeFilter=ref('all'),showArchived=ref(false),newName=ref(''),working=ref(false),createId=ref(crypto.randomUUID())
const searchResults=ref<SearchResult[]>([]),isSearching=ref(false),searched=ref(false),typeIcons={movie:Film,series:Tv,book:BookOpen,place:MapPin}
let searchGeneration=0,controller:AbortController|undefined
const editorMode=ref<'collection'|'memberships'|null>(null),editingCollection=ref<ActivityCollection|null>(null),editingItem=ref<ActivityItem|null>(null),editorError=ref<string|null>(null)
const currentCollection=computed(()=>store.collections.find(c=>c.id===opened.value)),collectionName=computed(()=>opened.value===generalCollection?t('activityLibrary.general'):currentCollection.value?.name||'')
const currentItems=computed(()=>store.inCollection(opened.value)),hasArchives=computed(()=>store.collections.some(c=>c.archived_at))
const shownCollections=computed(()=>{
 const groups:{id:string;name:string;color:string;source:ActivityCollection|null;items:ActivityItem[];done:number}[]=store.collections.filter(c=>Boolean(c.archived_at)===showArchived.value).map(c=>{const items=store.inCollection(c.id);return {id:c.id,name:c.name,color:c.color,source:c,items,done:items.filter(i=>i.status==='done').length}})
 if(!showArchived.value){const items=store.inCollection(generalCollection);if(items.length||!groups.length)groups.unshift({id:generalCollection,name:t('activityLibrary.general'),color:'currentColor',source:null,items,done:items.filter(i=>i.status==='done').length})}
 return groups
})
const filteredItems=computed(()=>currentItems.value.filter(i=>(typeFilter.value==='all'||i.type===typeFilter.value)&&(statusFilter.value==='all'||i.status===statusFilter.value)))
const typeOptions=computed(()=>activityTypes.map(value=>({value,label:t('activities.types.'+value)}))),filterTypes=computed(()=>[{value:'all',label:t('activityLibrary.allTypes')},...typeOptions.value])
const statusOptions=computed(()=>['all','want','done'].map(value=>({value,label:value==='all'?t('activities.filters.all'):t(typeFilter.value==='all'?'activities.filters.'+value:`activityLibrary.states.${typeFilter.value}.${value}`)})))
useModuleLoad(reload)
async function reload(){await store.loadItems();if(opened.value&&opened.value!==generalCollection&&!currentCollection.value)opened.value=''}
watch(opened,async()=>{clearSearch();searchQuery.value='';statusFilter.value='all';typeFilter.value='all';await nextTick();const toolbar=libraryRoot.value?.querySelector<HTMLElement>('.workspace-toolbar');if(toolbar&&libraryRoot.value!.getBoundingClientRect().top<0)reveal?.(toolbar,'smooth')})
watch(selectedType,clearSearch)
function clearSearch(){searchGeneration++;controller?.abort();controller=undefined;searchResults.value=[];searched.value=false;isSearching.value=false}
onDeactivated(()=>{clearSearch();closeEditor(true)})
onBeforeUnmount(()=>{clearSearch();closeEditor(true)})
async function run(action:()=>Promise<unknown>){if(working.value)return false;working.value=true;editorError.value=null;try{await action();return true}catch(error){const code=activityLibraryError(error);if(editorMode.value)editorError.value=code;else ui.addToast(t('activityLibrary.errors.'+code),'error');return false}finally{working.value=false}}
async function createCollection(){if(!newName.value.trim())return;const name=newName.value.trim();if(await run(async()=>{const data=await store.mutate('collection.create',createId.value,{name});opened.value=data.collection.id})){if(newName.value.trim()===name)newName.value='';createId.value=crypto.randomUUID();showArchived.value=false}}
function editCollection(collection:ActivityCollection){editingCollection.value={...collection};editingItem.value=null;editorError.value=null;editorMode.value='collection'}
function organizeItem(item:ActivityItem){editingItem.value={...item};editingCollection.value=null;editorError.value=null;editorMode.value='memberships'}
function closeEditor(force=false){if(working.value&&!force)return;editorMode.value=null;editingCollection.value=null;editingItem.value=null;editorError.value=null}
async function saveEditor(payload:{name:string;color:string;group_ids:string[]}){if(await run(async()=>{if(editorMode.value==='memberships'&&editingItem.value)await store.mutate('item.collections',editingItem.value.id,{group_ids:payload.group_ids},editingItem.value.version);else if(editingCollection.value)await store.mutate('collection.update',editingCollection.value.id,{name:payload.name,color:payload.color},editingCollection.value.version)})){closeEditor();ui.addToast(t('activityLibrary.saved'),'success')}}
async function changeArchive(collection:ActivityCollection,restore=false){let receipt:ActivityCollection|undefined
 if(!await run(async()=>{receipt=(await store.mutate(restore?'collection.restore':'collection.archive',collection.id,{},collection.version)).collection}))return
 closeEditor();if(opened.value===collection.id)opened.value=''
 if(!restore&&receipt)ui.addUndoToast(()=>t('activityLibrary.collectionArchivedToast'),t('activityLibrary.undo'),async()=>{try{await store.mutate('collection.restore',collection.id,{},receipt!.version)}catch(error){ui.addToast(t('activityLibrary.errors.'+activityLibraryError(error)),'error');throw error}},`activity-collections:${scope}`)
}
async function runSearch(){
 if(!searchQuery.value.trim()||isSearching.value||!opened.value)return
 if((selectedType.value==='movie'||selectedType.value==='series')&&!isTmdbConfigured()){ui.addToast(t('activityLibrary.catalogUnavailable'),'info');return}
 const request=++searchGeneration,type=selectedType.value,group=opened.value,query=searchQuery.value
 controller?.abort();const abort=new AbortController();controller=abort;isSearching.value=true;searched.value=true;searchResults.value=[]
 const timeout=setTimeout(()=>abort.abort(),20000)
 try{const results=await searchActivities(type,query,abort.signal);if(request===searchGeneration&&scope===workspaces.sessionKey&&group===opened.value)searchResults.value=results}
 catch{if(request===searchGeneration&&scope===workspaces.sessionKey)ui.addToast(t('activities.searchError'),'error')}
 finally{clearTimeout(timeout);if(request===searchGeneration){isSearching.value=false;controller=undefined}}
}
const addRequests=new Map<string,string>()
function resultKey(result:SearchResult){return `${opened.value}:${result.type}:${result.externalSource}:${result.externalId}`}
function resultAdded(result:SearchResult){return currentItems.value.some(item=>item.type===result.type&&item.external_source===result.externalSource&&item.external_id===result.externalId)}
async function addResult(result:SearchResult){const key=resultKey(result),id=addRequests.get(key)||crypto.randomUUID();addRequests.set(key,id)
 const saved=await run(async()=>{const data=await store.addFromSearch(result,opened.value,id)
  if(data.already_exists&&opened.value===generalCollection&&data.group_ids?.length){const ids:string[]=data.group_ids;opened.value=ids.find(id=>store.collections.some(c=>c.id===id&&!c.archived_at))||ids[0]!;ui.addToast(t('activities.alreadyExists'),'info')}
  else ui.addToast(t(data.already_exists?'activityLibrary.alreadyInCollection':'activityLibrary.added'),'info')
 })
 if(saved)addRequests.delete(key)
 return saved
}
async function addManual(){const title=searchQuery.value.trim();if(!title)return;const result:SearchResult={type:selectedType.value,title,subtitle:'',imageUrl:null,externalSource:'manual',externalId:`manual:${selectedType.value}:${title}`,meta:{}};if(await addResult(result)){if(searchQuery.value.trim()===title)searchQuery.value='';clearSearch()}}
async function toggleItem(id:string){if(!await store.toggleStatus(id))ui.addToast(t('activityLibrary.errors.'+(store.error||'failed')),'error')}
async function removeItem(id:string){if(!canWrite.value)return;if(!await store.deleteItem(id))ui.addToast(t('activityLibrary.errors.'+(store.error||'failed')),'error')}
useSearchReveal('activities',async(hit,isCurrent)=>{await store.loadItems(hit.record_id);if(!isCurrent())return;const groups=store.memberships.filter(m=>m.item_id===hit.record_id).map(m=>m.group_id);opened.value=groups.find(id=>store.collections.some(c=>c.id===id&&!c.archived_at))||groups[0]||generalCollection;statusFilter.value='all';typeFilter.value='all';clearSearch()})
</script>
<style scoped>
.activity-breadcrumb{display:flex;align-items:center;gap:8px;min-height:28px;color:hsl(var(--muted-foreground));font-size:11px}.activity-breadcrumb>.activity-subtle:last-child{margin-left:auto}.activity-subtle{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:hsl(var(--muted-foreground))}.activity-subtle:hover{color:hsl(var(--foreground))}.activity-back{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;flex-shrink:0}.activity-back:hover{background:hsl(var(--muted)/.5)}.activity-collection-title{display:flex;align-items:center;gap:7px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;color:hsl(var(--foreground))}.activity-collection-grid{--workspace-card-min:14rem;gap:12px}.activity-items-grid{--workspace-card-min:18rem;gap:12px}.activity-collection-card{position:relative;border-radius:16px;background:hsl(var(--card));overflow:hidden}.activity-collection-open{display:flex;flex-direction:column;gap:17px;padding:17px;width:100%;min-height:156px;text-align:left}.activity-collection-open:hover{background:hsl(var(--muted)/.18)}.activity-collection-open:focus-visible{outline:2px solid hsl(var(--primary)/.5);outline-offset:-3px;border-radius:inherit}.activity-collection-card h3{font-size:13px;line-height:1.5;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.activity-collection-preview{display:flex;align-items:center;gap:6px;min-height:42px}.activity-mini-cover{display:flex;align-items:center;justify-content:center;width:32px;height:42px;border-radius:5px;overflow:hidden;background:linear-gradient(145deg,hsl(var(--primary)/.07),hsl(var(--muted)/.65));color:hsl(var(--muted-foreground)/.6)}.activity-mini-cover img{width:100%;height:100%;object-fit:cover}.activity-collection-summary{display:flex;align-items:center;gap:10px;font-size:10px;color:hsl(var(--muted-foreground));margin-top:auto}.activity-collection-menu{position:absolute;top:11px;right:9px}.activity-list-filters{display:flex;align-items:center;gap:4px;border-bottom:1px solid hsl(var(--border)/.6);padding-bottom:8px}.activity-add{display:grid;grid-template-columns:108px minmax(0,1fr) auto auto;gap:7px;align-items:center}.activity-add-type{min-width:0}.activity-notice{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border:1px solid hsl(var(--border)/.6);border-radius:12px;font-size:12px;color:hsl(var(--muted-foreground))}.activity-empty{text-align:center;padding:30px 14px;color:hsl(var(--muted-foreground));font-size:12px}.activity-results{border:1px solid hsl(var(--border)/.65);border-radius:14px;padding:10px 12px;background:hsl(var(--muted)/.12)}.activity-results-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:6px}.activity-result{display:flex;align-items:center;gap:9px;padding:8px;border:1px solid transparent;border-radius:10px;text-align:left}.activity-result:hover:not(:disabled){border-color:hsl(var(--border));background:hsl(var(--card))}.activity-result:disabled{cursor:default}.activity-result-image{display:flex;align-items:center;justify-content:center;width:30px;height:42px;border-radius:4px;overflow:hidden;flex-shrink:0;background:hsl(var(--muted));color:hsl(var(--muted-foreground))}.activity-result-image img{width:100%;height:100%;object-fit:cover}.activity-view-enter-active{transition:opacity 180ms ease,transform 200ms cubic-bezier(.22,1,.36,1)}.activity-view-leave-active{transition:opacity 100ms ease}.activity-view-enter-from{opacity:0;transform:translateY(5px)}.activity-view-leave-to{opacity:0}@media(max-width:479px){.activity-add{grid-template-columns:92px minmax(0,1fr) 38px 38px;gap:5px}.activity-add .activity-button{padding:8px}.activity-list-filters>.activity-hint{font-size:10px}}@media(prefers-reduced-motion:reduce){.activity-view-enter-active,.activity-view-leave-active{transition:none}.activity-view-enter-from{transform:none}}
</style>
