<script setup lang="ts">
import { computed,inject,nextTick,onActivated,onDeactivated,onBeforeUnmount,onMounted,ref,watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { BookOpen,Plus,Search,Trash2,Upload,RotateCcw,GripVertical,Check,X } from 'lucide-vue-next'
import draggable from 'vuedraggable'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import LearningDialog from './LearningDialog.vue'
import LearningSubjectItem from './LearningSubjectItem.vue'
import LearningTitle from './LearningTitle.vue'
import LearningTopicDetails from './LearningTopicDetails.vue'
import LearningTemplatePicker from './LearningTemplatePicker.vue'
import { useLearningStore,learningError,type Subject,type Topic,type Mistake,type LearningView,type StudyStatus } from '../stores/learning'
import { studyTopics,studyStatuses,studyNameLimit,topicNameLimit,validStudyName,studyToday,isStudyDue,studyPlan } from '../lib/study'
import { useStudyOrder } from '../lib/useStudyOrder'
import type { ExamImport } from '../lib/examTemplates'
import { uploadStudyImage,discardStudyImage,signStudyImage } from '../lib/images'
import { useModuleAccess,useModuleLoad } from '@/lib/workspaceScope'
import { useSearchReveal } from '@/lib/searchNavigation'
import { workspaceNavigationKey,workspaceActiveViewKey,workspaceOpenItemKey } from '@/lib/workspaceNavigation'
import { useUIStore } from '@/stores/ui'
import { usePomodoroStore } from '@/features/pomodoro/stores/pomodoro'
const store=useLearningStore(),ui=useUIStore(),timer=usePomodoroStore(),{t}=useI18n(),{canWrite}=useModuleAccess('learning')
const navigation=inject(workspaceNavigationKey,null),reportView=inject(workspaceActiveViewKey,()=>{}),openItem=inject(workspaceOpenItemKey,()=>{})
const view=ref<LearningView>('topics'),query=ref(''),status=ref('all'),showArchive=ref(false),expanded=ref<string|null>(null),today=ref(studyToday())
const disabled=computed(()=>store.busy||store.isLoading||store.setupRequired),mistakeFilter=ref('open')
const statusOptions=computed(()=>studyStatuses.map(value=>({value,label:t('study.status.'+value)})))
const filterOptions=computed(()=>[{value:'all',label:t('study.all')},...statusOptions.value])
const mistakeFilters=computed(()=>['open','resolved','archive'].map(value=>({value,label:t('study.'+value)})))
const groups=computed(()=>store.subjects.map(subject=>({subject,topics:studyTopics(subject,query.value,status.value,store.state,showArchive.value)})).filter(group=>group.topics.length||(!query.value&&status.value==='all'&&!showArchive.value)))
const dueTopics=computed(()=>store.subjects.flatMap(subject=>subject.topics.filter(topic=>!topic.archived&&isStudyDue(store.state(subject.id,topic.id).review_on,today.value)).map(topic=>({subject,topic}))))
const dueMistakes=computed(()=>store.dueMistakes.filter(m=>isStudyDue(m.review_on,today.value)))
const visibleMistakes=computed(()=>store.mistakes.filter(m=>(mistakeFilter.value==='archive'?!!m.deleted_at:!m.deleted_at&&m.resolved===(mistakeFilter.value==='resolved'))&&(!query.value||`${m.prompt} ${m.source} ${topicLabel(m.subject_id,m.topic_id)}`.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()))))
let active=true,entryGeneration=0
useModuleLoad(async()=>{today.value=studyToday();await store.fetchSubjects();if(view.value==='mistakes')await store.fetchMistakes(mistakeFilter.value)})
watch(()=>navigation?.value,intent=>{if(intent?.module==='learning'&&['topics','today','mistakes'].includes(intent.view))view.value=intent.view as LearningView},{immediate:true})
watch(view,next=>{reportView('learning',next);query.value='';if(next==='mistakes')void store.fetchMistakes(mistakeFilter.value)},{immediate:true})
watch(mistakeFilter,next=>{if(active&&view.value==='mistakes')void store.fetchMistakes(next)})
watch(()=>timer.taskStatsSequence,()=>{if(active&&!disabled.value)void store.fetchSubjects()})
function refreshVisible(){if(active&&document.visibilityState==='visible'&&!disabled.value){today.value=studyToday();void store.fetchSubjects();if(view.value==='mistakes')void store.fetchMistakes(mistakeFilter.value)}}
onMounted(()=>document.addEventListener('visibilitychange',refreshVisible));onActivated(()=>{active=true});onDeactivated(()=>{
 active=false;entryGeneration++;closePanel(true);view.value='topics';query.value='';status.value='all';showArchive.value=false;expanded.value=null;mistakeFilter.value='open';newStudy.value=false
})
onBeforeUnmount(()=>{document.removeEventListener('visibilitychange',refreshVisible);closePanel(true)})
useSearchReveal('learning',async(hit,isCurrent)=>{await store.fetchSubjects(hit.record_id);if(!isCurrent())return;view.value='topics';query.value='';status.value='all';expanded.value=hit.record_id;showArchive.value=Boolean(store.subjects.find(s=>s.id===hit.record_id)?.topics.find(topic=>topic.id===hit.child_id)?.archived)})

type Panel='subject'|'topic'|'mistake'|'template'|'plan'|null
const panel=ref<Panel>(null),selectedSubject=ref(''),selectedTopic=ref(''),draftId=ref('')
const newStudy=ref(false),newTitle=ref(''),newId=ref(''),newInput=ref<HTMLInputElement>()
const working=ref(false),uploading=ref(false),photo=ref(''),imagePath=ref(''),imageError=ref(''),fileInput=ref<HTMLInputElement>(),editingMistake=ref<Mistake|null>(null)
const canReorder=computed(()=>!query.value.trim()&&status.value==='all'&&!showArchive.value)
const {ordered:orderedSubjects,blocked:orderBlocked,reducedMotion,announcement,start:startOrder,finish:finishOrder,move:moveOrder}=useStudyOrder(()=>groups.value.map(group=>group.subject),()=>disabled.value||working.value||!canWrite.value||!canReorder.value||newStudy.value,()=>Object.fromEntries(store.subjects.map(s=>[s.id,s.version])),(ids,versions)=>saveOrder(null,ids,versions))
let uploadedPath='',imageGeneration=0
const prompt=ref(''),solution=ref(''),source=ref(''),reason=ref(''),planDate=ref(studyToday()),planTime=ref('09:00'),planMinutes=ref(45)
const templateSelection=ref<ExamImport|null>(null)
const templateCount=computed(()=>templateSelection.value?.subjects.reduce((count,subject)=>count+subject.topics.length,0)||0)
const subject=computed(()=>store.subjects.find(s=>s.id===selectedSubject.value)),topic=computed(()=>subject.value?.topics.find(topic=>topic.id===selectedTopic.value))
const personal=computed(()=>store.state(selectedSubject.value,selectedTopic.value)),panelBusy=computed(()=>working.value||uploading.value||store.busy)
const subjectOptions=computed(()=>store.subjects.map(s=>({value:s.id,label:s.title})))
const topicOptions=computed(()=>subject.value?.topics.filter(topic=>!topic.archived).map(topic=>({value:topic.id,label:topic.title}))||[])
const reasonOptions=computed(()=>['','knowledge','attention','time'].map(value=>({value,label:t('study.reason.'+(value||'none'))})))
const panelTitle=computed(()=>panel.value==='subject'?subject.value?.title||t('study.manageSubject'):panel.value==='template'?t('study.importTemplate'):panel.value==='mistake'?t(editingMistake.value?'study.mistakeDetail':'study.addMistake'):panel.value==='plan'?t('study.plan'):topic.value?.title||t('study.topic'))
const subjectStats=computed(()=>studyStatuses.map(status=>({status,count:subject.value?.topics.filter(topic=>!topic.archived&&store.state(subject.value!.id,topic.id).status===status).length||0})))
const validMistake=computed(()=>Boolean(selectedTopic.value&&(prompt.value.trim()||source.value.trim()||imagePath.value)))
const mistakeDirty=computed(()=>{const m=editingMistake.value;return !!m&&(prompt.value!==m.prompt||solution.value!==m.solution||source.value!==m.source||reason.value!==m.reason||(imagePath.value||null)!==m.image_path)})
function topicLabel(sid:string,tid:string){const s=store.subjects.find(s=>s.id===sid);return `${s?.title||''} · ${s?.topics.find(topic=>topic.id===tid)?.title||''}`}
function errorToast(error?:unknown){ui.addToast(t('study.errors.'+(error?learningError(error):store.error||'failed')),'error')}
async function run(action:()=>Promise<unknown>,success?:string){if(panelBusy.value||store.setupRequired)return false;working.value=true;try{await action();if(success)ui.addToast(t('study.'+success),'success');return true}catch(error){errorToast(error);return false}finally{working.value=false}}
function openPanel(kind:Panel,s?:Subject,topic?:Topic){
 if(panel.value||disabled.value)return
 selectedSubject.value=s?.id||'';selectedTopic.value=topic?.id||'';draftId.value=crypto.randomUUID();panel.value=kind
}
function closePanel(force=false){if(panelBusy.value&&!force)return;panel.value=null;imageGeneration++;if(uploadedPath)void discardStudyImage(uploadedPath);uploadedPath='';photo.value='';imagePath.value='';imageError.value='';editingMistake.value=null}
async function beginStudy(){if(disabled.value||!canWrite.value)return;if(!newStudy.value){newTitle.value='';newId.value=crypto.randomUUID();newStudy.value=true}await nextTick();newInput.value?.focus()}
async function saveSubject(){
 if(!canWrite.value||!newStudy.value||!validStudyName(newTitle.value,studyNameLimit))return
 const entry=entryGeneration
 if(await run(()=>store.mutate('subject.create',newId.value,null,{title:newTitle.value.trim()}))&&entry===entryGeneration){expanded.value=newId.value;newStudy.value=false;newTitle.value='';query.value='';status.value='all';showArchive.value=false}
}
async function saveTopics(s:Subject,titles:string[]){
 if(!canWrite.value||!titles.length||titles.length>100||!titles.every(title=>validStudyName(title,topicNameLimit)))return false
 const entry=entryGeneration
 const saved=await run(()=>store.mutate('topic.add',s.id,null,{titles}))
 if(saved&&entry===entryGeneration){expanded.value=s.id;query.value='';status.value='all';showArchive.value=false}return saved
}
async function rename(s:Subject,topic:Topic|null,title:string,version?:number){
 if(!canWrite.value||topic?.archived||!validStudyName(title,topic?topicNameLimit:studyNameLimit))return false
 return run(()=>store.mutate(topic?'topic.update':'subject.update',s.id,topic?.id||null,{title},version))
}
async function saveOrder(sid:string|null,ids:string[],versions:Record<string,number|undefined>){
 if(!canWrite.value||!canReorder.value)return false
 return run(()=>store.reorder(sid,ids,versions))
}
async function changeStatus(s:Subject,topic:Topic,status:StudyStatus){await run(()=>store.mutate('progress.update',s.id,topic.id,{status},store.state(s.id,topic.id).version))}
async function archiveTopic(s:Subject,topic:Topic,restore=false){
 const saved=await run(()=>store.mutate(restore?'topic.restore':'topic.archive',s.id,topic.id,{},topic._version))
 if(!saved)return
 if(!restore){const version=store.subjects.find(item=>item.id===s.id)?.topics.find(item=>item.id===topic.id)?._version
  ui.addUndoToast(()=>t('study.archivedTopic'),t('study.undo'),async()=>{try{await store.mutate('topic.restore',s.id,topic.id,{},version)}catch(error){errorToast(error);throw error}},'learning-topics')}
 closePanel()
}
async function deleteSubject(s:Subject){if(!canWrite.value)return;if(await run(async()=>{if(!await store.deleteSubject(s.id))throw Error(store.error)})){if(selectedSubject.value===s.id)closePanel();if(expanded.value===s.id)expanded.value=null}}
const attempts=new Map<string,string>()
async function review(sid:string,tid:string,correct:boolean,m?:Mistake){
 const key=`${sid}:${tid}:${m?.id||''}:${correct}`,attempt_id=attempts.get(key)||crypto.randomUUID();attempts.set(key,attempt_id)
 if(await run(()=>store.mutate(m?'mistake.review':'review',sid,tid,{attempt_id,correct,...(m?{id:m.id}:{})},m?.version),'reviewSaved')){attempts.delete(key);if(m){closePanel();await store.fetchMistakes(mistakeFilter.value)}}
}
async function link(kind:'note'|'deck'|'focus'){
 await run(async()=>{const data=await store.mutate('link.'+kind,selectedSubject.value,selectedTopic.value,kind==='focus'?{seconds:timer.durations.focus*60}:{})
  if(kind==='focus'){const target=data.link.target;await timer.focusOn({...target,title:target.title,workspace_id:target.workspace_id,collection_id:target.collection_id,estimated_sessions:target.estimated_sessions||1,focus_seconds:target.focus_seconds||timer.durations.focus*60});if(timer.error)throw Error(timer.error);ui.addToast(t(timer.queuedTarget?.id===target.id?'study.queued':'study.focusStarted'),'success')}
  else{closePanel(true);openItem({module:kind==='note'?'detailed':'flashcards',record_id:data.link.id,child_id:null,title:topic.value?.title||'',preview:'',meta:{}})}
 })
}
function openPlan(){panel.value='plan';draftId.value=crypto.randomUUID();planDate.value=studyToday()}
function withTopic(s:Subject,topic:Topic,action:()=>unknown){if(disabled.value||panelBusy.value||panel.value)return;selectedSubject.value=s.id;selectedTopic.value=topic.id;void action()}
async function savePlan(){if(await run(()=>store.mutate('link.plan',selectedSubject.value,selectedTopic.value,{id:draftId.value,...studyPlan(planDate.value,planTime.value,Number(planMinutes.value))}),'planned'))closePanel()}
async function importTemplate(){const selection=templateSelection.value;if(!canWrite.value||!selection||!templateCount.value)return;if(await run(()=>store.mutate('template.import',null,null,selection),'imported')){closePanel();view.value='topics'}}
async function openMistake(m?:Mistake){
 if(!m&&(!selectedTopic.value||!subject.value)){selectedSubject.value=store.subjects[0]?.id||'';selectedTopic.value=store.subjects[0]?.topics.find(topic=>!topic.archived)?.id||''}
 panel.value='mistake';draftId.value=m?.id||crypto.randomUUID();editingMistake.value=m||null;prompt.value=m?.prompt||'';solution.value=m?.solution||'';source.value=m?.source||'';reason.value=m?.reason||'';imagePath.value=m?.image_path||'';photo.value='';imageError.value='';uploadedPath=''
 if(m){selectedSubject.value=m.subject_id;selectedTopic.value=m.topic_id}
 const generation=++imageGeneration
 if(imagePath.value)try{const url=await signStudyImage(imagePath.value);if(generation===imageGeneration)photo.value=url}catch{if(generation===imageGeneration)imageError.value=t('study.imageFailed')}
}
async function upload(file?:File){if(!file||panelBusy.value)return;uploading.value=true;imageError.value='';const generation=++imageGeneration
 try{const path=await uploadStudyImage(file);if(generation!==imageGeneration){void discardStudyImage(path);return}if(uploadedPath)void discardStudyImage(uploadedPath);uploadedPath=path;imagePath.value=path;photo.value=await signStudyImage(path)}catch(error){if(generation===imageGeneration)imageError.value=t((error as Error).message==='imageType'?'study.imageType':'study.imageFailed')}finally{uploading.value=false}}
function paste(event:ClipboardEvent){if(panel.value!=='mistake')return;const file=Array.from(event.clipboardData?.files||[]).find(file=>file.type.startsWith('image/'));if(file){event.preventDefault();void upload(file)}}
function drop(event:DragEvent){const file=event.dataTransfer?.files[0];if(file){event.preventDefault();void upload(file)}}
async function saveMistake(){
 if(!validMistake.value)return
 const saved=await run(()=>store.mutate(editingMistake.value?'mistake.update':'mistake.create',selectedSubject.value,selectedTopic.value,{id:draftId.value,prompt:prompt.value.trim(),solution:solution.value.trim(),source:source.value.trim(),reason:reason.value,image_path:imagePath.value||null},editingMistake.value?.version),'saved')
 if(saved){uploadedPath='';closePanel();await store.fetchMistakes(mistakeFilter.value)}
}
async function archiveMistake(m:Mistake,restore=false){
 let version=0
 if(!await run(async()=>{version=(await store.mutate(restore?'mistake.restore':'mistake.archive',m.subject_id,m.topic_id,{id:m.id},m.version)).mistake.version}))return
 if(!restore)ui.addUndoToast(()=>t('study.archivedMistake'),t('study.undo'),async()=>{try{await store.mutate('mistake.restore',m.subject_id,m.topic_id,{id:m.id},version);await store.fetchMistakes(mistakeFilter.value)}catch(error){errorToast(error);throw error}},'learning-mistakes')
 closePanel();await store.fetchMistakes(mistakeFilter.value)
}
</script>

<template>
 <div class="learning-workspace space-y-3 min-w-0">
  <div class="workspace-toolbar space-y-3">
   <div class="flex flex-wrap items-center gap-2">
    <div class="relative flex-1 min-w-[160px]"><Search :size="15" class="absolute left-3 top-3 text-muted-foreground" /><input v-model="query" class="study-input !pl-9" :placeholder="t('study.search')" :aria-label="t('study.search')" /></div>
    <CustomSelect v-if="view==='topics'" v-model="status" :options="filterOptions" size="sm" :aria-label="t('study.filter')" class="w-[124px]" />
    <CustomSelect v-if="view==='mistakes'" v-model="mistakeFilter" :options="mistakeFilters" :disabled="store.mistakesLoading" size="sm" :aria-label="t('study.filter')" class="w-[124px]" />
    <button v-if="view==='topics' && canWrite" class="study-btn" :disabled="disabled" @click="openPanel('template')"><Upload :size="14" /><span class="hidden sm:inline">{{ t('study.template') }}</span><span class="sr-only sm:hidden">{{ t('study.template') }}</span></button>
    <button v-if="view==='topics' && canWrite" class="study-btn is-primary" :disabled="disabled||working" @click="beginStudy"><Plus :size="15" />{{ t('study.newSubject') }}</button>
    <button v-if="view==='mistakes'" class="study-btn is-primary" :disabled="disabled||!store.subjects.some(s=>s.topics.some(topic=>!topic.archived))" @click="openMistake()"><Plus :size="15" />{{ t('study.addMistake') }}</button>
   </div>
   <div class="flex justify-between items-center gap-2 text-xs text-muted-foreground">
    <span>{{ t('study.views.'+view) }}</span>
    <button v-if="view==='topics'" class="hover:text-foreground" :aria-pressed="showArchive" @click="showArchive=!showArchive">{{ t(showArchive?'study.showActive':'study.showArchive') }}</button>
    <span v-else-if="view==='mistakes'">{{ t('study.personal') }}</span>
   </div>
  </div>
  <form v-if="view==='topics'&&newStudy&&canWrite" class="study-create workspace-card" @submit.prevent="saveSubject" @keydown.esc.stop.prevent="!working&&(newStudy=false)">
   <input ref="newInput" v-model="newTitle" class="study-input" :maxlength="studyNameLimit" :aria-label="t('study.subjectName')" :placeholder="t('study.subjectPlaceholder')" :disabled="disabled||working" />
   <button type="submit" class="study-btn is-primary" :disabled="disabled||working||!validStudyName(newTitle,studyNameLimit)">{{ t('study.add') }}</button><button type="button" class="study-btn" :disabled="working" :aria-label="t('study.cancel')" @click="newStudy=false"><X :size="15" /></button>
  </form>
  <div v-if="store.error && !panel" role="alert" class="rounded-xl border border-border px-4 py-3 flex items-start justify-between gap-3 text-xs"><span>{{ t('study.errors.'+store.error) }}</span><button class="text-primary shrink-0" :disabled="store.isLoading" @click="store.fetchSubjects()">{{ t('study.retry') }}</button></div>
  <p v-if="store.isLoading&&!store.subjects.length" class="study-empty" role="status">{{ t('study.loading') }}</p>
  <template v-else-if="view==='topics'">
   <draggable v-model="orderedSubjects" item-key="id" handle=".study-subject-handle" class="space-y-3" :disabled="orderBlocked" :animation="reducedMotion?0:180" :delay="150" :delay-on-touch-only="true" :touch-start-threshold="5" :force-fallback="true" :fallback-on-body="true" :fallback-tolerance="5" ghost-class="study-order-ghost" fallback-class="study-order-dragging" @start="startOrder" @end="finishOrder">
    <template #item="{element:s}">
     <LearningSubjectItem :subject="s" :topics="studyTopics(s,query,status,store.state,showArchive)" :is-expanded="expanded===s.id||Boolean(query)||status!=='all'||showArchive" :can-write="canWrite" :disabled="disabled||working" :can-reorder="canReorder" :archived-view="showArchive" :create-topics="titles=>saveTopics(s,titles)" :save-order="(ids,version)=>saveOrder(s.id,ids,{[s.id]:version})" @toggle="expanded=expanded===s.id?null:s.id" @manage="openPanel('subject',s)" @delete="deleteSubject(s)" @status="(topic,status)=>changeStatus(s,topic,status)" @archive="archiveTopic(s,$event)" @restore="archiveTopic(s,$event,true)">
      <template v-if="canWrite&&store.subjects.length>1" #handle><button type="button" class="study-drag-handle study-subject-handle" :disabled="orderBlocked" :title="t('study.reorderHint')" :aria-label="t('study.reorder',{name:s.title})" aria-keyshortcuts="ArrowUp ArrowDown" @keydown.up.prevent="moveOrder(s.id,-1)" @keydown.down.prevent="moveOrder(s.id,1)"><GripVertical :size="15" /></button></template>
      <template #details="{topic}"><LearningTitle class="study-inline-name" :title="topic.title" :version="topic._version" :limit="topicNameLimit" :label="t('study.topic')" :editable="canWrite&&!topic.archived" :disabled="disabled||working" :save="(title,version)=>rename(s,topic,title,version)" /><LearningTopicDetails :subject-id="s.id" :topic="topic" :busy="disabled||working" @link="kind=>withTopic(s,topic,()=>link(kind))" @plan="withTopic(s,topic,openPlan)" @mistake="withTopic(s,topic,()=>openMistake())" @review="correct=>review(s.id,topic.id,correct)" /></template>
     </LearningSubjectItem>
    </template>
   </draggable>
   <p class="sr-only" role="status" aria-live="polite">{{ announcement?t('study.order.'+announcement):'' }}</p>
   <div v-if="!groups.length" class="study-empty"><BookOpen :size="24" class="mx-auto mb-3 opacity-50" />{{ t(store.subjects.length?'study.noMatches':'study.startHint') }}</div>
  </template>
  <template v-else-if="view==='today'">
   <p class="study-hint px-1">{{ t('study.reviewHint') }}</p>
   <div v-if="!dueTopics.length&&!dueMistakes.length" class="study-empty"><Check :size="24" class="mx-auto mb-3 opacity-50" />{{ t('study.todayEmpty') }}</div>
   <div v-for="entry in dueTopics.filter(e=>!query||topicLabel(e.subject.id,e.topic.id).toLocaleLowerCase().includes(query.toLocaleLowerCase()))" :key="entry.subject.id+entry.topic.id" class="study-review-row workspace-card">
    <button class="text-left min-w-0 flex-1" @click="openPanel('topic',entry.subject,entry.topic)"><span class="block text-[13px] truncate">{{ entry.topic.title }}</span><span class="study-hint">{{ entry.subject.title }}</span></button>
    <button class="study-btn" :disabled="disabled||working" @click="review(entry.subject.id,entry.topic.id,false)">{{ t('study.again') }}</button><button class="study-btn" :disabled="disabled||working" @click="review(entry.subject.id,entry.topic.id,true)">{{ t('study.remembered') }}</button>
   </div>
   <button v-if="dueMistakes.length" class="study-btn w-full" :disabled="disabled" @click="openMistake(dueMistakes[0])">{{ t('study.reviewMistakes',{count:dueMistakes.length}) }}</button>
  </template>
  <template v-else>
   <p v-if="!visibleMistakes.length" class="study-empty">{{ t(store.mistakesLoading?'study.loading':'study.noMistakes') }}</p>
   <article v-for="m in visibleMistakes" :key="m.id" class="study-review-row workspace-card">
    <button class="text-left flex-1 min-w-0" :disabled="disabled" @click="openMistake(m)"><span class="block text-[13px] line-clamp-2">{{ m.prompt||m.source||t('study.photoQuestion') }}</span><span class="study-hint truncate block">{{ topicLabel(m.subject_id,m.topic_id) }}<span v-if="m.review_on"> · {{ m.review_on }}</span></span></button>
    <button class="study-btn" :disabled="disabled||working" :aria-label="t(m.deleted_at?'study.restore':'study.archive')" @click="archiveMistake(m,!!m.deleted_at)"><RotateCcw v-if="m.deleted_at" :size="15" /><Trash2 v-else :size="15" /></button>
   </article>
   <button v-if="store.hasMore" class="study-btn mx-auto" :disabled="store.mistakesLoading" @click="store.fetchMistakes(mistakeFilter,true)">{{ t('study.loadMore') }}</button>
  </template>

  <Teleport to="body">
   <LearningDialog v-if="panel" :title="panelTitle" :busy="panelBusy" :wide="panel==='template'" @close="closePanel()">
    <template v-if="subject&&(panel==='subject'||(panel==='topic'&&topic))" #title><LearningTitle :key="panel==='topic'?topic!.id:subject.id" class="study-detail-title" :title="panelTitle" :version="panel==='topic'?topic!._version:subject.version" :limit="panel==='topic'?topicNameLimit:studyNameLimit" :label="t(panel==='topic'?'study.topic':'study.subjectName')" :editable="canWrite&&(panel!=='topic'||!topic?.archived)" :disabled="panelBusy" :save="(title,version)=>rename(subject!,panel==='topic'?topic!:null,title,version)" /></template>
    <template v-if="panel==='subject'&&subject">
     <div class="grid grid-cols-3 gap-2 mb-4"><div v-for="item in subjectStats" :key="item.status" class="rounded-xl bg-muted/40 px-3 py-3"><span class="study-hint block">{{ t('study.status.'+item.status) }}</span><span class="text-lg font-medium tabular-nums">{{ item.count }}</span></div></div>
     <div class="divide-y divide-border/50"><button v-for="item in subject.topics.filter(topic=>!topic.archived)" :key="item.id" class="flex justify-between items-center gap-3 w-full text-left py-3 text-[13px]" :disabled="panelBusy" @click="selectedTopic=item.id;panel='topic'"><span class="truncate">{{ item.title }}</span><span class="study-hint shrink-0">{{ t('study.status.'+store.state(subject.id,item.id).status) }}</span></button></div>
     <p v-if="!subject.topics.some(topic=>!topic.archived)" class="study-hint">{{ t('study.noTopics') }}</p><p class="study-hint mt-4">{{ t('study.personal') }}</p>
    </template>
    <template v-else-if="panel==='topic' && topic && subject">
     <CustomSelect v-if="!topic.archived" :model-value="personal.status" :options="statusOptions" :disabled="panelBusy" :aria-label="t('study.statusLabel')" class="w-[145px] mb-4" @update:model-value="changeStatus(subject!,topic!,String($event) as StudyStatus)" />
     <LearningTopicDetails :subject-id="subject.id" :topic="topic" :busy="panelBusy" @link="link" @plan="openPlan" @mistake="openMistake()" @review="correct=>review(subject!.id,topic!.id,correct)" />
     <p class="study-hint mt-4">{{ t('study.personal') }}</p>
    </template>
    <template v-else-if="panel==='template'">
     <LearningTemplatePicker :busy="panelBusy" @update:selection="templateSelection=$event" />
    </template>
    <template v-else-if="panel==='plan'"><div class="grid grid-cols-2 gap-3"><label class="study-field"><span>{{ t('study.date') }}</span><input v-model="planDate" type="date" class="study-input" required /></label><label class="study-field"><span>{{ t('study.time') }}</span><input v-model="planTime" type="time" class="study-input" required /></label></div><label class="study-field"><span>{{ t('study.duration') }}</span><input v-model.number="planMinutes" type="number" min="5" max="480" class="study-input" /></label></template>
    <template v-else-if="panel==='mistake'">
     <div @paste="paste" @dragover.prevent @drop="drop">
      <div class="grid grid-cols-2 gap-3 mb-4"><CustomSelect v-model="selectedSubject" :options="subjectOptions" :disabled="!!editingMistake||panelBusy" :aria-label="t('study.subjectName')" @update:model-value="selectedTopic=topicOptions[0]?.value||''" /><CustomSelect v-model="selectedTopic" :options="topicOptions" :disabled="!!editingMistake||panelBusy" :aria-label="t('study.topic')" /></div>
      <label class="study-field"><span>{{ t('study.question') }}</span><textarea v-model="prompt" class="study-input" maxlength="4000" :placeholder="t('study.questionHint')" :readonly="!!editingMistake?.deleted_at" /></label>
      <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="upload(($event.target as HTMLInputElement).files?.[0]);($event.target as HTMLInputElement).value=''" />
      <div class="flex items-center gap-2 mb-3"><button class="study-btn" :disabled="panelBusy||!!editingMistake?.deleted_at" @click="fileInput?.click()"><Upload :size="14" />{{ t(uploading?'study.uploading':'study.photo') }}</button><button v-if="imagePath" class="study-btn" :disabled="panelBusy||!!editingMistake?.deleted_at" :aria-label="t('study.removePhoto')" @click="imagePath='';photo='' "><X :size="14" /></button><span class="study-hint">{{ t('study.photoHint') }}</span></div>
      <img v-if="photo" :src="photo" :alt="t('study.photoQuestion')" class="max-h-[320px] w-full object-contain rounded-xl border border-border mb-3" referrerpolicy="no-referrer" @error="imageError=t('study.imageFailed')" />
      <p v-if="imageError" role="alert" class="text-xs text-destructive mb-3">{{ imageError }}</p>
      <details class="mb-4"><summary class="text-xs text-muted-foreground cursor-pointer mb-3">{{ t('study.solutionDetails') }}</summary><label class="study-field"><span>{{ t('study.solution') }}</span><textarea v-model="solution" class="study-input" maxlength="4000" :readonly="!!editingMistake?.deleted_at" /></label><label class="study-field"><span>{{ t('study.reference') }}</span><input v-model="source" class="study-input" maxlength="300" :readonly="!!editingMistake?.deleted_at" /></label><CustomSelect v-model="reason" :options="reasonOptions" :disabled="!!editingMistake?.deleted_at" :aria-label="t('study.reasonLabel')" /></details>
      <p v-if="mistakeDirty" class="study-hint mb-2">{{ t('study.saveBeforeReview') }}</p>
      <div v-if="editingMistake&&!editingMistake.deleted_at" class="flex gap-2"><button class="study-btn flex-1" :disabled="panelBusy||mistakeDirty" @click="review(selectedSubject,selectedTopic,false,editingMistake)">{{ t('study.again') }}</button><button class="study-btn flex-1" :disabled="panelBusy||mistakeDirty" @click="review(selectedSubject,selectedTopic,true,editingMistake)">{{ t('study.solved') }}</button></div>
      <p class="study-hint mt-3">{{ t('study.personal') }}</p>
     </div>
    </template>
    <template #footer>
     <button class="study-btn" :disabled="panelBusy" @click="closePanel()">{{ t(panel==='subject'||panel==='topic'?'study.close':'study.cancel') }}</button>
     <button v-if="panel==='template'" class="study-btn is-primary" :disabled="panelBusy||!templateCount" @click="importTemplate">{{ t('study.import') }}</button>
     <button v-if="panel==='plan'" class="study-btn is-primary" :disabled="panelBusy||!planDate||!planTime" @click="savePlan">{{ t('study.plan') }}</button>
     <button v-if="panel==='mistake'&&!editingMistake?.deleted_at" class="study-btn is-primary" :disabled="panelBusy||!validMistake" @click="saveMistake">{{ t('study.save') }}</button>
    </template>
   </LearningDialog>
  </Teleport>
 </div>
</template>
<style scoped>
.study-inline-name{width:100%;max-width:32rem;margin-bottom:8px}
.study-inline-name :deep(.title-pencil){opacity:.65}
.study-create{display:flex;align-items:center;gap:8px;padding:12px;border-radius:15px}.study-create .study-input{max-width:36rem;flex:1;min-width:0}
.study-review-row{display:flex;align-items:center;gap:8px;padding:12px 15px;border-radius:14px;background:hsl(var(--card))}.study-template-group{border:1px solid hsl(var(--border)/.7);border-radius:12px;margin-top:8px;padding:8px 12px}.study-template-group summary{display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;padding:3px 0}.study-template-group[open] summary{margin-bottom:8px}.learning-workspace input[type=checkbox]{accent-color:hsl(var(--primary))}@media(max-width:520px){.study-review-row{flex-wrap:wrap}.study-review-row>button:first-child{flex-basis:100%}}
</style>
