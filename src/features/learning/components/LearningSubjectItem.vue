<template>
 <section class="study-subject workspace-card bg-card" :class="{'has-study-handle':Boolean($slots.handle)}" :data-search-record="subject.id">
  <header class="study-subject-header">
   <slot name="handle" />
   <button type="button" class="study-subject-toggle" :aria-expanded="isExpanded" :aria-label="t('study.toggle',{name:subject.title})" @click="$emit('toggle')"><ChevronDown :size="15" class="shrink-0 text-muted-foreground transition-transform" :class="{'-rotate-90':!isExpanded}" /><span class="study-subject-title" :title="subject.title">{{ subject.title }}</span></button>
   <span class="ml-auto text-xs text-muted-foreground tabular-nums shrink-0">{{ completed }}/{{ activeCount }}</span>
   <button type="button" class="study-icon" :disabled="disabled" :aria-label="t('study.manageSubject')" @click="$emit('manage')"><MoreHorizontal :size="17" /></button>
   <button v-if="canWrite" type="button" class="study-icon is-delete" :disabled="disabled" :aria-label="t('study.deleteSubject')" @click="$emit('delete')"><Trash2 :size="15" /></button>
  </header>
  <div v-if="isExpanded" class="border-t border-border/60">
  <div class="study-subject-body">
   <draggable v-model="ordered" item-key="id" handle=".study-topic-handle" :disabled="blocked" :animation="reducedMotion?0:180" :delay="150" :delay-on-touch-only="true" :touch-start-threshold="5" :force-fallback="true" :fallback-on-body="true" :fallback-tolerance="5" ghost-class="study-order-ghost" fallback-class="study-order-dragging" @start="start" @end="finish">
    <template #item="{element:topic}">
     <div class="study-topic-shell" :data-search-record="subject.id" :data-search-child="topic.id">
     <div class="study-topic" :class="{'is-disabled':disabled||saving,'is-open':detailTopic===topic.id}" @click="rowClick(topic,$event)">
      <button v-if="canWrite&&topics.length>1&&!topic.archived" type="button" class="study-drag-handle study-topic-handle" :disabled="blocked" :title="t('study.reorderHint')" :aria-label="t('study.reorder',{name:topic.title})" aria-keyshortcuts="ArrowUp ArrowDown" @click.stop @keydown.up.prevent="move(topic.id,-1)" @keydown.down.prevent="move(topic.id,1)"><GripVertical :size="14" /></button>
      <span v-else class="study-topic-spacer" aria-hidden="true" />
      <button type="button" class="study-topic-open" :class="{'text-muted-foreground':topic.archived}" :title="topic.title" :disabled="disabled||saving" :aria-label="t('study.topicDetails',{name:topic.title})" :aria-expanded="detailTopic===topic.id" :aria-controls="`study-details-${subject.id}-${topic.id}`" @click.stop="toggleDetails(topic)"><span>{{ topic.title }}</span></button>
      <div class="study-topic-actions" @click.stop>
       <CustomSelect v-if="!topic.archived" :model-value="store.state(subject.id,topic.id).status" :options="statusOptions" size="sm" variant="ghost" class="w-[116px] shrink-0" :aria-label="t('study.statusFor',{name:topic.title})" :disabled="disabled||saving" @update:model-value="$emit('status',topic,String($event) as StudyStatus)" />
       <button v-if="canWrite" type="button" class="study-icon" :class="{'is-delete':!topic.archived}" :disabled="disabled||saving" :aria-label="t(topic.archived?'study.restore':'study.archive')" @click="topic.archived?$emit('restore',topic):$emit('archive',topic)"><RotateCcw v-if="topic.archived" :size="15" /><Trash2 v-else :size="15" /></button>
      </div>
     </div>
     <div v-if="detailTopic===topic.id" :id="`study-details-${subject.id}-${topic.id}`" class="study-inline-details"><slot name="details" :topic="topic" /></div>
     </div>
    </template>
   </draggable>
   <p v-if="!topics.length&&!adding" class="study-empty">{{ t('study.noTopics') }}</p>
   <form v-if="adding&&canWrite&&!archivedView" class="study-topic-create" @submit.prevent="addTopics" @keydown.esc.stop.prevent="!creating&&(adding=false)">
    <div class="flex items-start gap-2"><textarea ref="topicInput" v-model="topicDraft" class="study-input flex-1" rows="1" :maxlength="bulkMode?10100:topicNameLimit" :aria-label="t('study.addTopics')" :placeholder="t(bulkMode?'study.bulkPlaceholder':'study.topicPlaceholder')" :disabled="disabled||creating" @keydown.enter="enterTopic" /><button type="submit" class="study-btn" :disabled="disabled||creating||!validTopics" :aria-label="t('study.add')"><Check :size="15" /></button><button type="button" class="study-icon" :disabled="creating" :aria-label="t('study.cancel')" @click="adding=false"><X :size="15" /></button></div>
    <div class="flex items-center justify-between gap-3 mt-1.5"><span class="study-hint">{{ t(bulkMode?'study.bulkHint':'study.topicLimit',{count:topicNameLimit}) }}</span><button type="button" class="text-xs text-muted-foreground hover:text-foreground shrink-0" :disabled="creating||disabled" @click="toggleBulk">{{ t(bulkMode?'study.singleTopic':'study.bulkTopics') }}</button></div>
    <p v-if="topicDraft.trim()&&!validTopics" class="study-hint !text-destructive mt-1">{{ t('study.topicLimit',{count:topicNameLimit}) }}</p>
   </form>
   <button v-else-if="canWrite&&!archivedView" type="button" class="study-add-topic" :disabled="disabled||saving" @click="beginAdd"><Plus :size="14" />{{ t('study.addTopics') }}</button>
  </div>
  </div>
  <p class="sr-only" role="status" aria-live="polite">{{ announcement?t('study.order.'+announcement):'' }}</p>
 </section>
</template>
<script setup lang="ts">
import { computed,nextTick,ref,onDeactivated } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown,MoreHorizontal,Plus,RotateCcw,Trash2,GripVertical,Check,X } from 'lucide-vue-next'
import draggable from 'vuedraggable'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useLearningStore,type Subject,type Topic,type StudyStatus } from '../stores/learning'
import { topicNameLimit,validStudyName,mergeStudyOrder } from '../lib/study'
import { useStudyOrder } from '../lib/useStudyOrder'
const props=defineProps<{subject:Subject;topics:Topic[];isExpanded:boolean;canWrite:boolean;disabled:boolean;canReorder:boolean;archivedView:boolean;createTopics:(titles:string[])=>Promise<boolean>;saveOrder:(ids:string[],version?:number)=>Promise<boolean>}>()
defineEmits<{toggle:[];manage:[];delete:[];archive:[topic:Topic];restore:[topic:Topic];status:[topic:Topic,status:StudyStatus]}>()
const {t}=useI18n(),store=useLearningStore(),adding=ref(false),creating=ref(false),bulkMode=ref(false),singleDraft=ref(''),bulkDraft=ref(''),topicInput=ref<HTMLTextAreaElement>(),detailTopic=ref('')
onDeactivated(()=>{detailTopic.value='';adding.value=false;singleDraft.value='';bulkDraft.value='';bulkMode.value=false})
const topicDraft=computed({get:()=>bulkMode.value?bulkDraft.value:singleDraft.value,set:value=>{if(bulkMode.value)bulkDraft.value=value;else singleDraft.value=value}})
const {ordered,blocked,saving,reducedMotion,announcement,start,finish,move}=useStudyOrder(()=>props.topics,()=>props.disabled||!props.canWrite||!props.canReorder||adding.value,()=>({version:props.subject.version,ids:props.subject.topics.map(t=>t.id)}),(ids,context)=>props.saveOrder(mergeStudyOrder(context.ids,ids),context.version))
const statusOptions=computed(()=>['todo','doing','done'].map(value=>({value,label:t('study.status.'+value)})))
const activeCount=computed(()=>props.subject.topics.filter(topic=>!topic.archived).length)
const completed=computed(()=>props.subject.topics.filter(topic=>!topic.archived&&store.state(props.subject.id,topic.id).status==='done').length)
const titles=computed(()=>topicDraft.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean))
const validTopics=computed(()=>titles.value.length>0&&titles.value.length<=100&&titles.value.every(title=>validStudyName(title,topicNameLimit)))
function toggleDetails(topic:Topic){if(!props.disabled&&!saving.value)detailTopic.value=detailTopic.value===topic.id?'':topic.id}
function rowClick(topic:Topic,event:MouseEvent){if((event.target as Element|null)?.closest?.('button,input,select,textarea,a,[role="combobox"]'))return;toggleDetails(topic)}
async function beginAdd(){if(props.disabled||!props.canWrite)return;adding.value=true;bulkMode.value=false;singleDraft.value='';bulkDraft.value='';await nextTick();topicInput.value?.focus()}
function toggleBulk(){if(!bulkMode.value&&!bulkDraft.value)bulkDraft.value=singleDraft.value;bulkMode.value=!bulkMode.value;void nextTick(()=>topicInput.value?.focus())}
function enterTopic(event:KeyboardEvent){if(!bulkMode.value&&!event.isComposing){event.preventDefault();void addTopics()}}
async function addTopics(){if(!validTopics.value||creating.value||props.disabled||!props.canWrite)return;creating.value=true;let saved=false;try{saved=await props.createTopics(titles.value);if(saved)topicDraft.value=''}finally{creating.value=false;if(saved){await nextTick();topicInput.value?.focus()}}}
</script>
<style scoped>
.study-subject{--topic-indent:36px;overflow:visible;border-radius:15px}
.study-subject.has-study-handle{--topic-indent:60px}
.study-subject-header{display:flex;align-items:center;gap:6px;padding:10px 12px}
.study-subject-toggle{display:flex;align-items:center;gap:10px;flex:1;min-width:0;padding:7px 6px;border-radius:8px;text-align:left;font-size:13px}
.study-subject-toggle:hover{background:hsl(var(--muted)/.35)}
.study-subject-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:28rem;font-weight:500}
.study-subject-body{margin-inline-start:var(--topic-indent);margin-block:8px;padding-block:2px;border-inline-start:1px solid hsl(var(--border)/.55)}
.study-topic-shell{margin:0 12px;border-bottom:1px solid hsl(var(--border)/.35);background:hsl(var(--card))}
.study-topic-shell:last-child{border-bottom:0}
.study-topic{display:flex;align-items:center;gap:6px;padding:4px 3px;border-radius:8px;cursor:pointer;transition:background-color 150ms}
.study-topic:not(.is-disabled):hover,.study-topic.is-open{background:hsl(var(--muted)/.35)}
.study-topic.is-disabled{cursor:default}
.study-topic-spacer{width:20px;flex-shrink:0}
.study-topic-open{display:flex;align-items:center;min-width:0;flex:1;min-height:36px;padding:7px 0;text-align:left;font-size:13px;line-height:1.6}
.study-topic-open>span{max-width:34rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.study-topic-actions{display:flex;align-items:center;gap:2px;margin-left:auto;flex-shrink:0}
.study-inline-details{padding:8px 10px 14px 29px;animation:study-details-in 180ms ease-out}
.study-icon{display:inline-flex;align-items:center;justify-content:center;padding:7px;border-radius:8px;color:hsl(var(--muted-foreground));flex-shrink:0}
.study-icon:hover{background:hsl(var(--muted)/.7);color:hsl(var(--foreground))}
.study-icon.is-delete:hover{color:hsl(var(--destructive));background:hsl(var(--destructive)/.06)}
.study-icon:disabled{opacity:.4}
.study-add-topic{display:flex;align-items:center;gap:7px;width:calc(100% - 12px);padding:11px 18px;border-top:1px solid hsl(var(--border)/.4);font-size:12px;color:hsl(var(--muted-foreground));border-radius:8px}
.study-add-topic:hover{color:hsl(var(--primary));background:hsl(var(--muted)/.3)}
.study-topic-create{padding:12px 16px;border-top:1px solid hsl(var(--border)/.4)}
.study-topic-create textarea{min-height:36px;max-height:160px;resize:vertical}
.study-icon:focus-visible,.study-topic-open:focus-visible,.study-subject-toggle:focus-visible{outline:2px solid hsl(var(--primary)/.4);outline-offset:2px;border-radius:6px}
@keyframes study-details-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.study-inline-details{animation:none}.study-topic{transition:none}}
@media(max-width:540px){.study-subject{--topic-indent:32px}.study-subject.has-study-handle{--topic-indent:52px}.study-subject-header{gap:2px;padding:8px}.study-topic-shell{margin:0 8px}.study-topic{gap:3px;flex-wrap:wrap}.study-topic-open{min-width:80px}.study-topic-actions{max-width:100%}.study-inline-details{padding-inline:26px 6px}.study-topic-create{padding:10px}}
</style>
