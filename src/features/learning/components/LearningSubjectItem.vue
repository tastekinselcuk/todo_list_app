<template>
 <section class="study-subject workspace-card bg-card" :class="{'has-study-handle':Boolean($slots.handle),'is-focused':focused}" :data-search-record="subject.id" @click="openStudy">
  <header v-if="!focused" class="study-subject-header">
   <slot name="handle" />
   <button type="button" class="study-subject-toggle" aria-haspopup="dialog" :disabled="disabled" :aria-label="t('study.openSubject',{name:subject.title})" @click.stop="$emit('manage')"><span class="study-subject-title" :title="subject.title">{{ subject.title }}</span></button>
   <span class="ml-auto text-xs text-muted-foreground tabular-nums shrink-0">{{ filtered?t('study.matchingTopics',{count:topics.length}):`${completed}/${activeCount}` }}</span>
   <button v-if="canWrite" type="button" class="study-icon is-delete" :disabled="disabled" :aria-label="t('study.deleteSubject')" @click.stop="$emit('delete')"><Trash2 :size="15" /></button>
  </header>
  <div v-if="focused" class="study-subject-body">
   <div v-if="canWrite||$slots.summary" class="study-topic-toolbar">
    <form v-if="canWrite" class="study-topic-create" @submit.prevent="addTopics">
     <div class="flex items-start gap-2"><textarea ref="topicInput" v-model="topicDraft" class="study-input flex-1" rows="1" :maxlength="bulkMode?10100:topicNameLimit" :aria-label="t('study.addTopics')" :placeholder="t(bulkMode?'study.bulkPlaceholder':'study.topicPlaceholder')" :disabled="disabled||creating" @keydown.enter="enterTopic" /><button type="submit" class="workspace-add-button" :disabled="disabled||creating||!validTopics">{{ t('study.add') }}</button></div>
     <p v-if="topicDraft.trim()&&!validTopics" class="study-hint !text-destructive mt-1">{{ t('study.topicLimit',{count:topicNameLimit}) }}</p>
    </form>
    <div class="study-topic-toolbar-meta"><slot name="summary" /><button v-if="canWrite" type="button" class="study-bulk-toggle" :disabled="creating||disabled" @click="toggleBulk">{{ t(bulkMode?'study.singleTopic':'study.bulkTopics') }}</button></div>
   </div>
   <div class="study-topic-viewport">
   <draggable v-model="ordered" item-key="id" handle=".study-topic-handle" :disabled="blocked" :animation="reducedMotion?0:180" :delay="150" :delay-on-touch-only="true" :touch-start-threshold="5" :force-fallback="true" :fallback-on-body="true" :fallback-tolerance="5" ghost-class="study-order-ghost" fallback-class="study-order-dragging" @start="start" @end="finish">
    <template #item="{element:topic}">
     <LearningTopicRow :subject="subject" :topic="topic" :can-write="canWrite" :busy="disabled||saving" :save-title="(title,version)=>renameTopic(topic,title,version)" @status="$emit('status',topic,$event)" @remove="$emit('remove',topic)" @link="kind=>$emit('link',topic,kind)" @plan="$emit('plan',topic)" @mistake="$emit('mistake',topic)">
      <template v-if="canWrite&&topics.length>1" #handle><button type="button" class="study-drag-handle study-topic-handle" :disabled="blocked" :aria-label="t('study.reorder',{name:topic.title})" :title="t('study.reorderHint')" @keydown.up.prevent="move(topic.id,-1)" @keydown.down.prevent="move(topic.id,1)"><GripVertical :size="14" /></button></template>
     </LearningTopicRow>
    </template>
   </draggable>
   <div v-if="!topics.length" class="study-topic-empty" role="status"><span class="study-topic-empty-icon"><BookOpen :size="22" :stroke-width="1.4" /></span><p>{{ t('study.emptyTopics') }}</p><span v-if="canWrite" class="study-hint">{{ t('study.emptyTopicsHint') }}</span></div>
   </div>
  </div>
  <p class="sr-only" role="status" aria-live="polite">{{ announcement?t('study.order.'+announcement):'' }}</p>
 </section>
</template>
<script setup lang="ts">
import { computed,nextTick,ref,onDeactivated } from 'vue'
import { useI18n } from 'vue-i18n'
import { Trash2,GripVertical,BookOpen } from 'lucide-vue-next'
import draggable from 'vuedraggable'
import LearningTopicRow from './LearningTopicRow.vue'
import { useLearningStore,type Subject,type Topic,type StudyStatus } from '../stores/learning'
import { topicNameLimit,validStudyName,mergeStudyOrder } from '../lib/study'
import { useStudyOrder } from '../lib/useStudyOrder'
const props=withDefaults(defineProps<{subject:Subject;topics:Topic[];focused?:boolean;filtered?:boolean;canWrite:boolean;disabled:boolean;canReorder:boolean;saveTitle?:(topic:Topic,title:string,version?:number)=>Promise<boolean>;createTopics:(titles:string[])=>Promise<boolean>;saveOrder:(ids:string[],version?:number)=>Promise<boolean>}>(),{focused:false})
const emit=defineEmits<{manage:[];delete:[];remove:[topic:Topic];status:[topic:Topic,status:StudyStatus];link:[topic:Topic,kind:'note'|'deck'|'focus'];plan:[topic:Topic];mistake:[topic:Topic]}>()
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
function focusTopic(){topicInput.value?.focus({preventScroll:true})}
defineExpose({focusTopic})
</script>
<style scoped>
.study-subject{overflow:visible;border-radius:15px}.study-subject:not(.is-focused){cursor:pointer}.study-subject:not(.is-focused):hover{background:hsl(var(--muted)/.2)}.study-subject.is-focused{display:flex;flex-direction:column;flex:1;min-height:0;border:0;border-radius:0;background:transparent}.study-subject-header{display:flex;align-items:center;gap:6px;padding:10px 12px}.study-subject-toggle{display:flex;align-items:center;flex:1;min-width:0;padding:7px 6px;border-radius:8px;text-align:left;font-size:13px}.study-subject-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}.study-subject-body{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0}.study-icon{display:inline-flex;align-items:center;justify-content:center;padding:7px;border-radius:8px;color:hsl(var(--muted-foreground));flex-shrink:0}.study-icon:hover{background:hsl(var(--muted)/.7);color:hsl(var(--foreground))}.study-icon.is-delete:hover{color:hsl(var(--destructive));background:hsl(var(--destructive)/.06)}.study-icon:disabled{opacity:.4}.study-topic-toolbar{flex-shrink:0;padding:18px 22px 12px;border-bottom:1px solid hsl(var(--border)/.55);background:hsl(var(--card))}.study-topic-toolbar-meta{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:8px;min-height:20px}.study-bulk-toggle{margin-left:auto;padding:3px 0 3px 8px;font-size:10px;color:hsl(var(--muted-foreground))}.study-bulk-toggle:hover{color:hsl(var(--foreground))}.study-bulk-toggle:disabled{opacity:.4}.study-topic-viewport{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:16px 22px 20px;scrollbar-width:none}.study-topic-viewport::-webkit-scrollbar{display:none}.study-topic-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:260px;height:100%;padding:32px 20px;text-align:center}.study-topic-empty-icon{display:flex;align-items:center;justify-content:center;width:48px;height:48px;border:1px solid hsl(var(--border)/.6);border-radius:15px;background:hsl(var(--muted)/.25);color:hsl(var(--muted-foreground)/.7)}.study-topic-empty>p{font-size:13px;font-weight:500;color:hsl(var(--foreground)/.8)}.study-topic-empty>.study-hint{max-width:280px}.study-topic-create textarea{min-height:40px;max-height:160px;resize:vertical}.study-icon:focus-visible,.study-subject-toggle:focus-visible{outline:2px solid hsl(var(--primary)/.4);outline-offset:2px}
@media(max-width:540px){.study-topic-toolbar{padding:14px 14px 10px}.study-topic-viewport{padding:12px 14px 14px}.study-topic-empty{min-height:180px}}
</style>
