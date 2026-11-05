<script setup lang="ts">
import { computed,inject,nextTick,onActivated,onDeactivated,onBeforeUnmount,onMounted,ref,watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { BookOpen,Plus,Trash2,Upload,GripVertical,ArrowLeft,X,List } from 'lucide-vue-next'
import draggable from 'vuedraggable'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import LearningDialog from './LearningDialog.vue'
import LearningSubjectItem from './LearningSubjectItem.vue'
import LearningTitle from './LearningTitle.vue'
import LearningTopicRow from './LearningTopicRow.vue'
import LearningTemplatePicker from './LearningTemplatePicker.vue'
import { useLearningStore,learningError,type Subject,type Topic,type Mistake,type LearningView,type StudyStatus } from '../stores/learning'
import { studyTopics,studyStatuses,studyNameLimit,topicNameLimit,validStudyName,studyToday,studyPlan } from '../lib/study'
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
const view=ref<LearningView>('topics'),status=ref('all'),selectedStudy=ref(''),listMode=ref<'subjects'|'topics'>('subjects')
const disabled=computed(()=>store.busy||store.isLoading||store.setupRequired),mistakeFilter=ref('open')
const statusOptions=computed(()=>studyStatuses.map(value=>({value,label:t('study.status.'+value)})))
const filterOptions=computed(()=>[{value:'all',label:t('study.all')},...statusOptions.value])
const mistakeFilters=computed(()=>['open','resolved'].map(value=>({value,label:t('study.'+value)})))
const groups=computed(()=>store.subjects.filter(subject=>!selectedStudy.value||subject.id===selectedStudy.value).map(subject=>({subject,topics:studyTopics(subject,'',status.value,store.state)})).filter(group=>group.topics.length||status.value==='all'))
const flatTopics=computed(()=>groups.value.flatMap(group=>group.topics.map(topic=>({subject:group.subject,topic}))))
const visibleMistakes=computed(()=>store.mistakes.filter(m=>!m.deleted_at&&m.resolved===(mistakeFilter.value==='resolved')))
watch(()=>store.subjects.map(subject=>subject.id),ids=>{if(selectedStudy.value&&!ids.includes(selectedStudy.value))selectedStudy.value=''})
let active=true,entryGeneration=0
useModuleLoad(async()=>{await store.fetchSubjects();if(view.value==='mistakes')await store.fetchMistakes(mistakeFilter.value)})
watch(()=>navigation?.value,intent=>{if(intent?.module==='learning'&&['topics','mistakes'].includes(intent.view))view.value=intent.view as LearningView},{immediate:true})
watch(view,(next,previous)=>{if(previous!==undefined){entryGeneration++;newTitle.value='';newId.value=''}reportView('learning',next);if(next==='mistakes')void store.fetchMistakes(mistakeFilter.value)},{immediate:true})
watch(mistakeFilter,next=>{if(active&&view.value==='mistakes')void store.fetchMistakes(next)})
watch(()=>timer.taskStatsSequence,()=>{if(active&&!disabled.value)void store.fetchSubjects()})
function refreshVisible(){if(active&&document.visibilityState==='visible'&&!disabled.value){void store.fetchSubjects();if(view.value==='mistakes')void store.fetchMistakes(mistakeFilter.value)}}
onMounted(()=>document.addEventListener('visibilitychange',refreshVisible));onActivated(()=>{active=true});onDeactivated(()=>{
 active=false;entryGeneration++;closePanel(true);view.value='topics';status.value='all';selectedStudy.value='';listMode.value='subjects';mistakeFilter.value='open';newTitle.value='';newId.value='';prompt.value='';solution.value='';source.value='';reason.value=''
})
onBeforeUnmount(()=>{active=false;entryGeneration++;document.removeEventListener('visibilitychange',refreshVisible);closePanel(true)})
useSearchReveal('learning',async(hit,isCurrent)=>{await store.fetchSubjects(hit.record_id);if(!isCurrent())return;view.value='topics';status.value='all';selectedStudy.value='';const found=store.subjects.find(s=>s.id===hit.record_id);if(!found)return;closePanel(true);listMode.value=hit.child_id?'topics':'subjects';if(hit.child_id)selectedStudy.value=found.id})

type Panel='subject'|'mistake'|'template'|'plan'|null
const panel=ref<Panel>(null),selectedSubject=ref(''),selectedTopic=ref(''),draftId=ref('')
const newTitle=ref(''),newId=ref(''),focusedStudy=ref<InstanceType<typeof LearningSubjectItem>>()
const working=ref(false),uploading=ref(false),photo=ref(''),imagePath=ref(''),imageError=ref(''),fileInput=ref<HTMLInputElement>(),editingMistake=ref<Mistake|null>(null)
const canReorder=computed(()=>status.value==='all'&&!selectedStudy.value)
const {ordered:orderedSubjects,blocked:orderBlocked,reducedMotion,announcement,start:startOrder,finish:finishOrder,move:moveOrder}=useStudyOrder(()=>groups.value.map(group=>group.subject),()=>disabled.value||working.value||!canWrite.value||!canReorder.value,()=>Object.fromEntries(store.subjects.map(s=>[s.id,s.version])),(ids,versions)=>saveOrder(null,ids,versions))
let uploadedPath='',imageGeneration=0
const prompt=ref(''),solution=ref(''),source=ref(''),reason=ref(''),planDate=ref(studyToday()),planTime=ref('09:00'),planMinutes=ref(45)
const templateSelection=ref<ExamImport|null>(null)
const templateCount=computed(()=>templateSelection.value?.subjects.reduce((count,subject)=>count+subject.topics.length,0)||0)
const subject=computed(()=>store.subjects.find(s=>s.id===selectedSubject.value)),topic=computed(()=>subject.value?.topics.find(topic=>topic.id===selectedTopic.value))
const panelBusy=computed(()=>working.value||uploading.value||store.busy)
const subjectOptions=computed(()=>store.subjects.map(s=>({value:s.id,label:s.title})))
const studyFilterOptions=computed(()=>[{value:'',label:t('study.allSubjects')},...subjectOptions.value])
const topicOptions=computed(()=>subject.value?.topics.filter(topic=>!topic.archived).map(topic=>({value:topic.id,label:topic.title}))||[])
const reasonOptions=computed(()=>['','knowledge','attention','time'].map(value=>({value,label:t('study.reason.'+(value||'none'))})))
const panelTitle=computed(()=>panel.value==='subject'?subject.value?.title||t('study.manageSubject'):panel.value==='template'?t('study.importTemplate'):panel.value==='mistake'?t(editingMistake.value?'study.mistakeDetail':'study.addMistake'):panel.value==='plan'?t('study.plan'):t('study.topic'))
const subjectStats=computed(()=>{const topics=subject.value?.topics.filter(topic=>!topic.archived)||[];return {total:topics.length,doing:topics.filter(topic=>store.state(subject.value!.id,topic.id).status==='doing').length,done:topics.filter(topic=>store.state(subject.value!.id,topic.id).status==='done').length}})
const validMistake=computed(()=>Boolean(selectedTopic.value&&(prompt.value.trim()||source.value.trim()||imagePath.value)))
function topicLabel(sid:string,tid:string){const s=store.subjects.find(s=>s.id===sid);return `${s?.title||''} · ${s?.topics.find(topic=>topic.id===tid)?.title||''}`}
function errorToast(error?:unknown){ui.addToast(t('study.errors.'+(error?learningError(error):store.error||'failed')),'error')}
async function run(action:()=>Promise<unknown>,success?:string){if(panelBusy.value||store.setupRequired)return false;working.value=true;try{await action();if(success)ui.addToast(t('study.'+success),'success');return true}catch(error){errorToast(error);return false}finally{working.value=false}}
function openPanel(kind:Panel,s?:Subject,topic?:Topic){
 if(panel.value||disabled.value)return
 selectedSubject.value=s?.id||'';selectedTopic.value=topic?.id||'';draftId.value=crypto.randomUUID();panel.value=kind
}
function closePanel(force=false){if(panelBusy.value&&!force)return;panel.value=null;imageGeneration++;if(uploadedPath)void discardStudyImage(uploadedPath);uploadedPath='';photo.value='';imagePath.value='';imageError.value='';editingMistake.value=null}
function handleSubjectEnter(event:KeyboardEvent){if(event.isComposing||event.keyCode===229){event.preventDefault();return}event.preventDefault();void saveSubject()}
async function saveSubject(){
 if(!canWrite.value||view.value!=='topics'||panel.value||panelBusy.value||disabled.value||!validStudyName(newTitle.value,studyNameLimit))return
 if(!newId.value)newId.value=crypto.randomUUID()
 const entry=entryGeneration,createdId=newId.value
 if(await run(()=>store.mutate('subject.create',createdId,null,{title:newTitle.value.trim()}))&&entry===entryGeneration){
  newTitle.value='';newId.value='';status.value='all';selectedStudy.value=''
  const created=store.subjects.find(subject=>subject.id===createdId)
  if(created){openPanel('subject',created);await nextTick();focusedStudy.value?.focusTopic()}
 }
}
async function saveTopics(s:Subject,titles:string[]){
 if(!canWrite.value||!titles.length||titles.length>100||!titles.every(title=>validStudyName(title,topicNameLimit)))return false
 const entry=entryGeneration
 const saved=await run(()=>store.mutate('topic.add',s.id,null,{titles}))
 if(saved&&entry===entryGeneration){status.value='all'}return saved
}
async function rename(s:Subject,topic:Topic|null,title:string,version?:number){
 if(!canWrite.value||topic?.archived||!validStudyName(title,topic?topicNameLimit:studyNameLimit))return false
 return run(()=>store.mutate(topic?'topic.update':'subject.update',s.id,topic?.id||null,{title},version))
}
async function saveOrder(sid:string|null,ids:string[],versions:Record<string,number|undefined>){
 if(!canWrite.value||(!sid&&!canReorder.value))return false
 return run(()=>store.reorder(sid,ids,versions))
}
async function changeStatus(s:Subject,topic:Topic,status:StudyStatus){if(store.state(s.id,topic.id).status===status)return;await run(()=>store.mutate('progress.update',s.id,topic.id,{status},store.state(s.id,topic.id).version))}
async function removeTopic(s:Subject,topic:Topic){
 if(!canWrite.value)return
 if(!await run(()=>store.mutate('topic.archive',s.id,topic.id,{},topic._version)))return
 const version=store.subjects.find(item=>item.id===s.id)?.topics.find(item=>item.id===topic.id)?._version
 ui.addUndoToast(()=>t('study.topicDeleted'),t('study.undo'),async()=>{try{await store.mutate('topic.restore',s.id,topic.id,{},version)}catch(error){errorToast(error);throw error}},'learning-topics',undefined,'deleted')
}
async function deleteSubject(s:Subject){if(!canWrite.value)return;if(await run(async()=>{if(!await store.deleteSubject(s.id))throw Error(store.error)})){if(selectedSubject.value===s.id)closePanel()}}
async function link(kind:'note'|'deck'){
 await run(async()=>{const data=await store.mutate('link.'+kind,selectedSubject.value,selectedTopic.value,{})
  closePanel(true);openItem({module:kind==='note'?'detailed':'flashcards',record_id:data.link.id,child_id:null,title:topic.value?.title||'',preview:'',meta:{}})
 })
}
function withTopic(s:Subject,topic:Topic,action:()=>unknown){if(disabled.value||panelBusy.value)return;selectedSubject.value=s.id;selectedTopic.value=topic.id;void action()}
function openPlan(){panel.value='plan';draftId.value=crypto.randomUUID();planDate.value=studyToday()}

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
async function removeMistake(m:Mistake,restore=false){
 let version=0
 if(!await run(async()=>{version=(await store.mutate(restore?'mistake.restore':'mistake.archive',m.subject_id,m.topic_id,{id:m.id},m.version)).mistake.version}))return
 if(!restore)ui.addUndoToast(()=>t('study.mistakeDeleted'),t('study.undo'),async()=>{try{await store.mutate('mistake.restore',m.subject_id,m.topic_id,{id:m.id},version);await store.fetchMistakes(mistakeFilter.value)}catch(error){errorToast(error);throw error}},'learning-mistakes',undefined,'deleted')
 closePanel();await store.fetchMistakes(mistakeFilter.value)
}
</script>

<template>
 <div class="learning-workspace space-y-3 min-w-0">
  <div class="workspace-toolbar space-y-3">
   <form v-if="view==='topics'&&canWrite" class="workspace-capture" @submit.prevent="saveSubject"><input v-model="newTitle" type="text" class="study-input flex-1 min-w-0" :maxlength="studyNameLimit" :disabled="disabled||working" :placeholder="t('study.newSubjectPlaceholder')" :aria-label="t('study.newSubject')" @keydown.enter="handleSubjectEnter" /><button type="button" class="study-btn study-template-action" :disabled="disabled||working" :aria-label="t('study.template')" :title="t('study.template')" @click="openPanel('template')"><Upload :size="14" /><span class="hidden sm:inline">{{ t('study.template') }}</span></button><button type="submit" class="workspace-add-button" :disabled="disabled||working||!validStudyName(newTitle,studyNameLimit)">{{ t('study.add') }}</button></form>
   <div class="flex flex-wrap items-center gap-2">
    <div v-if="view==='topics'" role="group" :aria-label="t('study.listMode')" class="study-list-modes"><button type="button" :aria-pressed="listMode==='subjects'" @click="listMode='subjects'"><BookOpen :size="14" />{{ t('study.subjectsLabel') }}</button><button type="button" :aria-pressed="listMode==='topics'" @click="listMode='topics'"><List :size="14" />{{ t('study.views.topics') }}</button></div>
    <CustomSelect popover v-if="view==='topics'" v-model="selectedStudy" :options="studyFilterOptions" size="sm" :aria-label="t('study.filterSubject')" class="w-40 min-w-0" />
    <CustomSelect popover v-if="view==='topics'" v-model="status" :options="filterOptions" size="sm" :aria-label="t('study.filter')" class="w-[124px]" />
    <CustomSelect popover v-if="view==='mistakes'" v-model="mistakeFilter" :options="mistakeFilters" :disabled="store.mistakesLoading" size="sm" :aria-label="t('study.filter')" class="w-[124px]" />

    <button v-if="view==='mistakes'" type="button" class="study-btn ml-auto" :disabled="disabled||!store.subjects.some(s=>s.topics.some(topic=>!topic.archived))" @click="openMistake()"><Plus :size="14" />{{ t('study.addMistake') }}</button>
   </div>
  </div>
  <div v-if="store.error && !panel" role="alert" class="rounded-xl border border-border px-4 py-3 flex items-start justify-between gap-3 text-xs"><span>{{ t('study.errors.'+store.error) }}</span><button class="text-primary shrink-0" :disabled="store.isLoading" @click="store.fetchSubjects()">{{ t('study.retry') }}</button></div>
  <p v-if="store.isLoading&&!store.subjects.length" class="study-empty" role="status">{{ t('study.loading') }}</p>
  <template v-else-if="view==='topics'">
   <draggable v-if="listMode==='subjects'" v-model="orderedSubjects" item-key="id" handle=".study-subject-handle" class="space-y-3" :disabled="orderBlocked" :animation="reducedMotion?0:180" :delay="150" :delay-on-touch-only="true" :touch-start-threshold="5" :force-fallback="true" :fallback-on-body="true" :fallback-tolerance="5" ghost-class="study-order-ghost" fallback-class="study-order-dragging" @start="startOrder" @end="finishOrder">
    <template #item="{element:s}">
     <LearningSubjectItem :subject="s" :topics="studyTopics(s,'',status,store.state)" :filtered="status!=='all'" :can-write="canWrite" :disabled="disabled||working" :can-reorder="canReorder" :create-topics="titles=>saveTopics(s,titles)" :save-order="(ids,version)=>saveOrder(s.id,ids,{[s.id]:version})" @manage="openPanel('subject',s)" @delete="deleteSubject(s)">
      <template v-if="canWrite&&store.subjects.length>1" #handle><button type="button" class="study-drag-handle study-subject-handle" :disabled="orderBlocked" :title="t('study.reorderHint')" :aria-label="t('study.reorder',{name:s.title})" aria-keyshortcuts="ArrowUp ArrowDown" @click.stop @keydown.up.prevent="moveOrder(s.id,-1)" @keydown.down.prevent="moveOrder(s.id,1)"><GripVertical :size="15" /></button></template>

     </LearningSubjectItem>
    </template>
   </draggable>
   <section v-else-if="flatTopics.length" class="study-topic-list"><LearningTopicRow v-for="entry in flatTopics" :key="entry.subject.id+entry.topic.id" :subject="entry.subject" :topic="entry.topic" :can-write="canWrite" :busy="disabled||working" show-subject :save-title="(title,version)=>rename(entry.subject,entry.topic,title,version)" @status="changeStatus(entry.subject,entry.topic,$event)" @remove="removeTopic(entry.subject,entry.topic)" @link="kind=>withTopic(entry.subject,entry.topic,()=>link(kind))" @plan="withTopic(entry.subject,entry.topic,openPlan)" @mistake="withTopic(entry.subject,entry.topic,()=>openMistake())" /></section>
   <p class="sr-only" role="status" aria-live="polite">{{ announcement?t('study.order.'+announcement):'' }}</p>
   <div v-if="listMode==='topics'?!flatTopics.length:!groups.length" class="study-empty"><BookOpen :size="24" class="mx-auto mb-3 opacity-50" />{{ t(store.subjects.length?'study.noMatches':'study.startHint') }}</div>
  </template>
  <template v-else>
   <p v-if="!visibleMistakes.length" class="study-empty">{{ t(store.mistakesLoading?'study.loading':'study.noMistakes') }}</p>
   <article v-for="m in visibleMistakes" :key="m.id" class="study-review-row workspace-card">
    <button class="text-left flex-1 min-w-0" :disabled="disabled" @click="openMistake(m)"><span class="block text-[13px] line-clamp-2">{{ m.prompt||m.source||t('study.photoQuestion') }}</span><span class="study-hint truncate block">{{ topicLabel(m.subject_id,m.topic_id) }}</span></button>
    <button class="study-btn" :disabled="disabled||working" :aria-label="t('study.deleteMistake')" @click="removeMistake(m)"><Trash2 :size="15" /></button>
   </article>
   <button v-if="store.hasMore" class="study-btn mx-auto" :disabled="store.mistakesLoading" @click="store.fetchMistakes(mistakeFilter,true)">{{ t('study.loadMore') }}</button>
  </template>

  <Teleport to="body">
   <LearningDialog v-if="panel" :title="panelTitle" :busy="panelBusy" :wide="panel==='template'" :workspace="panel!=='template'" :contained="panel==='subject'" @close="closePanel()">
    <template v-if="subject&&panel==='subject'" #title><LearningTitle class="study-detail-title" :title="subject.title" :version="subject.version" :limit="studyNameLimit" :label="t('study.subjectName')" :editable="canWrite" :disabled="panelBusy" :save="(title,version)=>rename(subject!,null,title,version)" /></template>
    <template v-if="panel==='subject'&&subject">
     <LearningSubjectItem ref="focusedStudy" :key="subject.id" :subject="subject" :topics="studyTopics(subject,'','all',store.state)" focused :can-write="canWrite" :disabled="disabled||working" :can-reorder="true" :save-title="(topic,title,version)=>rename(subject!,topic,title,version)" :create-topics="titles=>saveTopics(subject!,titles)" :save-order="(ids,version)=>saveOrder(subject!.id,ids,{[subject!.id]:version})" @status="(topic,status)=>changeStatus(subject!,topic,status)" @remove="removeTopic(subject!,$event)" @link="(topic,kind)=>withTopic(subject!,topic,()=>link(kind))" @plan="withTopic(subject!,$event,openPlan)" @mistake="withTopic(subject!,$event,()=>openMistake())">
      <template v-if="subjectStats.total" #summary><div class="study-summary" role="status"><span>{{ t('study.topicCount',{count:subjectStats.total}) }}</span><span>{{ t('study.doingCount',{count:subjectStats.doing}) }}</span><span>{{ t('study.doneCount',{count:subjectStats.done}) }}</span></div></template>
     </LearningSubjectItem>
    </template>
    <template v-else-if="panel==='template'">
     <LearningTemplatePicker :busy="panelBusy" @update:selection="templateSelection=$event" />
    </template>
    <template v-else-if="panel==='plan'"><div class="grid grid-cols-2 gap-3"><label class="study-field"><span>{{ t('study.date') }}</span><input v-model="planDate" type="date" class="study-input" required /></label><label class="study-field"><span>{{ t('study.time') }}</span><input v-model="planTime" type="time" class="study-input" required /></label></div><label class="study-field"><span>{{ t('study.duration') }}</span><input v-model.number="planMinutes" type="number" min="5" max="480" class="study-input" /></label></template>
    <template v-else-if="panel==='mistake'">
     <div @paste="paste" @dragover.prevent @drop="drop">
      <div class="grid grid-cols-2 gap-3 mb-4"><CustomSelect popover v-model="selectedSubject" :options="subjectOptions" :disabled="!!editingMistake||panelBusy" :aria-label="t('study.subjectName')" @update:model-value="selectedTopic=topicOptions[0]?.value||''" /><CustomSelect popover v-model="selectedTopic" :options="topicOptions" :disabled="!!editingMistake||panelBusy" :aria-label="t('study.topic')" /></div>
      <label class="study-field"><span>{{ t('study.question') }}</span><textarea v-model="prompt" class="study-input" maxlength="4000" :placeholder="t('study.questionHint')" :readonly="!!editingMistake?.deleted_at" /></label>
      <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="upload(($event.target as HTMLInputElement).files?.[0]);($event.target as HTMLInputElement).value=''" />
      <div class="flex items-center gap-2 mb-3"><button class="study-btn" :disabled="panelBusy||!!editingMistake?.deleted_at" @click="fileInput?.click()"><Upload :size="14" />{{ t(uploading?'study.uploading':'study.photo') }}</button><button v-if="imagePath" class="study-btn" :disabled="panelBusy||!!editingMistake?.deleted_at" :aria-label="t('study.removePhoto')" @click="imagePath='';photo='' "><X :size="14" /></button><span class="study-hint">{{ t('study.photoHint') }}</span></div>
      <img v-if="photo" :src="photo" :alt="t('study.photoQuestion')" class="max-h-[320px] w-full object-contain rounded-xl border border-border mb-3" referrerpolicy="no-referrer" @error="imageError=t('study.imageFailed')" />
      <p v-if="imageError" role="alert" class="text-xs text-destructive mb-3">{{ imageError }}</p>
      <details class="mb-4"><summary class="text-xs text-muted-foreground cursor-pointer mb-3">{{ t('study.solutionDetails') }}</summary><label class="study-field"><span>{{ t('study.solution') }}</span><textarea v-model="solution" class="study-input" maxlength="4000" :readonly="!!editingMistake?.deleted_at" /></label><label class="study-field"><span>{{ t('study.reference') }}</span><input v-model="source" class="study-input" maxlength="300" :readonly="!!editingMistake?.deleted_at" /></label><CustomSelect popover v-model="reason" :options="reasonOptions" :disabled="!!editingMistake?.deleted_at" :aria-label="t('study.reasonLabel')" /></details>
      <p class="study-hint mt-3">{{ t('study.personal') }}</p>
     </div>
    </template>
    <template #footer>
     <button v-if="(panel==='plan'||panel==='mistake')&&subject" type="button" class="study-btn mr-auto" :disabled="panelBusy" @click="panel='subject';selectedTopic='' "><ArrowLeft :size="14" />{{ t('study.backToSubject') }}</button>
     <button class="study-btn" :disabled="panelBusy" @click="closePanel()">{{ t(panel==='subject'?'study.close':'study.cancel') }}</button>
     <button v-if="panel==='template'" class="study-btn is-primary" :disabled="panelBusy||!templateCount" @click="importTemplate">{{ t('study.import') }}</button>
     <button v-if="panel==='plan'" class="study-btn is-primary" :disabled="panelBusy||!planDate||!planTime" @click="savePlan">{{ t('study.plan') }}</button>
     <button v-if="panel==='mistake'&&!editingMistake?.deleted_at" class="study-btn is-primary" :disabled="panelBusy||!validMistake" @click="saveMistake">{{ t('study.save') }}</button>
    </template>
   </LearningDialog>
  </Teleport>
 </div>
</template>
<style scoped>
.study-template-action{height:40px;flex-shrink:0}.study-topic-list{min-width:0}
.study-list-modes{display:inline-flex;gap:2px;padding:2px;border:1px solid hsl(var(--border)/.5);border-radius:10px}.study-list-modes button{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:4px 9px;border-radius:7px;font-size:11px;color:hsl(var(--muted-foreground))}.study-list-modes button[aria-pressed='true']{background:hsl(var(--primary)/.08);color:hsl(var(--primary))}.study-summary{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11px;color:hsl(var(--muted-foreground));font-variant-numeric:tabular-nums}
.study-review-row{display:flex;align-items:center;gap:8px;padding:12px 15px;border-radius:14px;background:hsl(var(--card))}.study-template-group{border:1px solid hsl(var(--border)/.7);border-radius:12px;margin-top:8px;padding:8px 12px}.study-template-group summary{display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;padding:3px 0}.study-template-group[open] summary{margin-bottom:8px}.learning-workspace input[type=checkbox]{accent-color:hsl(var(--primary))}@media(max-width:520px){.study-review-row{flex-wrap:wrap}.study-review-row>button:first-child{flex-basis:100%}}
</style>
