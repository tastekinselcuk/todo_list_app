<template>
 <section class="study-subject workspace-card bg-card" :class="{'has-study-handle':Boolean($slots.handle),'is-focused':focused}" :data-search-record="subject.id" @click="openStudy">
  <header v-if="!focused" class="study-subject-header">
   <slot name="handle" />
   <button type="button" class="study-subject-toggle" aria-haspopup="dialog" :disabled="disabled" :aria-label="t('study.openSubject',{name:subject.title})" @click.stop="$emit('manage')"><span class="study-subject-title" :title="subject.title">{{ subject.title }}</span></button>
   <span class="ml-auto text-xs text-muted-foreground tabular-nums shrink-0">{{ filtered?t('study.matchingTopics',{count:topics.length}):`${completed}/${activeCount}` }}</span>
   <button v-if="canWrite" type="button" class="study-icon is-delete" :disabled="disabled" :aria-label="t('study.deleteSubject')" @click.stop="$emit('delete')"><Trash2 :size="15" /></button>
  </header>
  <div v-if="focused">
  <div class="study-subject-body">
   <draggable v-model="ordered" item-key="id" handle=".study-topic-handle" :disabled="blocked" :animation="reducedMotion?0:180" :delay="150" :delay-on-touch-only="true" :touch-start-threshold="5" :force-fallback="true" :fallback-on-body="true" :fallback-tolerance="5" ghost-class="study-order-ghost" fallback-class="study-order-dragging" @start="start" @end="finish">
    <template #item="{element:topic}">
     <LearningTopicRow :subject="subject" :topic="topic" :can-write="canWrite" :busy="disabled||saving" :save-title="(title,version)=>renameTopic(topic,title,version)" @status="$emit('status',topic,$event)" @remove="$emit('remove',topic)" @link="kind=>$emit('link',topic,kind)" @plan="$emit('plan',topic)" @mistake="$emit('mistake',topic)" @review="correct=>$emit('review',topic,correct)">
      <template v-if="canWrite&&topics.length>1" #handle><button type="button" class="study-drag-handle study-topic-handle" :disabled="blocked" :aria-label="t('study.reorder',{name:topic.title})" :title="t('study.reorderHint')" @keydown.up.prevent="move(topic.id,-1)" @keydown.down.prevent="move(topic.id,1)"><GripVertical :size="14" /></button></template>
     </LearningTopicRow>
    </template>
   </draggable>
   <p v-if="!topics.length" class="study-empty">{{ t('study.noTopics') }}</p>
   <form v-if="canWrite" class="study-topic-create" @submit.prevent="addTopics">
    <div class="flex items-start gap-2"><textarea ref="topicInput" v-model="topicDraft" class="study-input flex-1" rows="1" :maxlength="bulkMode?10100:topicNameLimit" :aria-label="t('study.addTopics')" :placeholder="t(bulkMode?'study.bulkPlaceholder':'study.topicPlaceholder')" :disabled="disabled||creating" @keydown.enter="enterTopic" /><button type="submit" class="workspace-add-button" :disabled="disabled||creating||!validTopics">{{ t('study.add') }}</button></div>
    <div class="flex justify-end mt-1.5"><button type="button" class="text-[10px] text-muted-foreground hover:text-foreground" :disabled="creating||disabled" @click="toggleBulk">{{ t(bulkMode?'study.singleTopic':'study.bulkTopics') }}</button></div>
    <p v-if="topicDraft.trim()&&!validTopics" class="study-hint !text-destructive mt-1">{{ t('study.topicLimit',{count:topicNameLimit}) }}</p>
   </form>
  </div>
  </div>
  <p class="sr-only" role="status" aria-live="polite">{{ announcement?t('study.order.'+announcement):'' }}</p>
 </section>
</template>
<script setup lang="ts">
import { computed,nextTick,ref,onDeactivated } from 'vue'
import { useI18n } from 'vue-i18n'
import { Trash2,GripVertical } from 'lucide-vue-next'
import draggable from 'vuedraggable'
import LearningTopicRow from './LearningTopicRow.vue'
import { useLearningStore,type Subject,type Topic,type StudyStatus } from '../stores/learning'
import { topicNameLimit,validStudyName,mergeStudyOrder } from '../lib/study'
import { useStudyOrder } from '../lib/useStudyOrder'
const props=withDefaults(defineProps<{subject:Subject;topics:Topic[];focused?:boolean;filtered?:boolean;canWrite:boolean;disabled:boolean;canReorder:boolean;saveTitle?:(topic:Topic,title:string,version?:number)=>Promise<boolean>;createTopics:(titles:string[])=>Promise<boolean>;saveOrder:(ids:string[],version?:number)=>Promise<boolean>}>(),{focused:false})
const emit=defineEmits<{manage:[];delete:[];remove:[topic:Topic];status:[topic:Topic,status:StudyStatus];link:[topic:Topic,kind:'note'|'deck'|'focus'];plan:[topic:Topic];mistake:[topic:Topic];review:[topic:Topic,correct:boolean]}>()
const {t}=useI18n(),store=useLearningStore(),creating=ref(false),bulkMode=ref(false),singleDraft=ref(''),bulkDraft=ref(''),topicInput=ref<HTMLTextAreaElement>()
onDeactivated(()=>{singleDraft.value='';bulkDraft.value='';bulkMode.value=false})
const topicDraft=computed({get:()=>bulkMode.value?bulkDraft.value:singleDraft.value,set:value=>{if(bulkMode.value)bulkDraft.value=value;else singleDraft.value=value}})
const {ordered,blocked,saving,reducedMotion,announcement,start,finish,move}=useStudyOrder(()=>props.topics,()=>props.disabled||!props.canWrite||!props.canReorder||Boolean(topicDraft.value.trim()),()=>({version:props.subject.version,ids:props.subject.topics.map(t=>t.id)}),(ids,context)=>props.saveOrder(mergeStudyOrder(context.ids,ids),context.version))
const activeCount=computed(()=>props.subject.topics.filter(topic=>!topic.archived).length)
const completed=computed(()=>props.subject.topics.filter(topic=>!topic.archived&&store.state(props.subject.id,topic.id).status==='done').length)
const titles=computed(()=>topicDraft.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean))
const validTopics=computed(()=>titles.value.length>0&&titles.value.length<=100&&titles.value.every(title=>validStudyName(title,topicNameLimit)))
function renameTopic(topic:Topic,title:string,version?:number){return props.saveTitle?.(topic,title,version)??Promise.resolve(false)}
function openStudy(event:MouseEvent){
 if(props.focused||props.disabled||saving.value)return
 const target=event.target as HTMLElement|null
 if(target?.closest?.('button,input,select,textarea,a,[role="combobox"]'))return
 const selection=window.getSelection()
 if(selection&&!selection.isCollapsed)return
 emit('manage')
}
function toggleBulk(){if(!bulkMode.value&&!bulkDraft.value)bulkDraft.value=singleDraft.value;bulkMode.value=!bulkMode.value;void nextTick(()=>topicInput.value?.focus())}
function enterTopic(event:KeyboardEvent){if(!bulkMode.value&&!event.isComposing){event.preventDefault();void addTopics()}}
async function addTopics(){if(!validTopics.value||creating.value||props.disabled||!props.canWrite)return;creating.value=true;let saved=false;try{saved=await props.createTopics(titles.value);if(saved)topicDraft.value=''}finally{creating.value=false;if(saved){await nextTick();topicInput.value?.focus()}}}
</script>
<style scoped>
.study-subject{overflow:visible;border-radius:15px}.study-subject:not(.is-focused){cursor:pointer}.study-subject:not(.is-focused):hover{background:hsl(var(--muted)/.2)}.study-subject.is-focused{border:0;border-radius:0;background:transparent}.study-subject-header{display:flex;align-items:center;gap:6px;padding:10px 12px}.study-subject-toggle{display:flex;align-items:center;flex:1;min-width:0;padding:7px 6px;border-radius:8px;text-align:left;font-size:13px}.study-subject-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}.study-subject-body{min-width:0}.study-icon{display:inline-flex;align-items:center;justify-content:center;padding:7px;border-radius:8px;color:hsl(var(--muted-foreground));flex-shrink:0}.study-icon:hover{background:hsl(var(--muted)/.7);color:hsl(var(--foreground))}.study-icon.is-delete:hover{color:hsl(var(--destructive));background:hsl(var(--destructive)/.06)}.study-icon:disabled{opacity:.4}.study-topic-create{padding:12px;border-top:1px solid hsl(var(--border)/.4)}.study-topic-create textarea{min-height:40px;max-height:160px;resize:vertical}.study-icon:focus-visible,.study-subject-toggle:focus-visible{outline:2px solid hsl(var(--primary)/.4);outline-offset:2px}
</style>
