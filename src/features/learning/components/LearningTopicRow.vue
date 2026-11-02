<template>
 <article class="study-topic-row" :data-search-record="subject.id" :data-search-child="topic.id">
  <div class="study-topic-heading">
   <slot name="handle" />
   <div class="min-w-0 flex-1"><LearningTitle :title="topic.title" :version="topic._version" :limit="topicNameLimit" :label="t('study.topic')" :editable="canWrite" :disabled="busy" :save="saveTitle" /><span v-if="showSubject" class="study-topic-parent">{{ subject.title }}</span></div>
   <div class="study-topic-status" role="group" :aria-label="t('study.statusFor',{name:topic.title})"><button v-for="item in statuses" :key="item.value" type="button" :disabled="busy" :aria-pressed="personal.status===item.value" :aria-label="t('study.status.'+item.value)" :title="t('study.status.'+item.value)" @click="$emit('status',item.value)"><component :is="item.icon" :size="14" :stroke-width="1.6" /></button></div>
   <button v-if="canWrite" type="button" class="study-topic-remove" :disabled="busy" :aria-label="t('study.deleteTopic')" :title="t('study.deleteTopic')" @click="$emit('remove')"><Trash2 :size="14" /></button>
  </div>
  <LearningTopicDetails :subject-id="subject.id" :topic="topic" :busy="busy" compact @link="$emit('link',$event)" @plan="$emit('plan')" @mistake="$emit('mistake')" @review="$emit('review',$event)" />
 </article>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Circle,CircleDot,CheckCircle2,Trash2 } from 'lucide-vue-next'
import LearningTitle from './LearningTitle.vue'
import LearningTopicDetails from './LearningTopicDetails.vue'
import { useLearningStore,type Subject,type Topic,type StudyStatus } from '../stores/learning'
import { topicNameLimit } from '../lib/study'
const props=defineProps<{subject:Subject;topic:Topic;canWrite:boolean;busy:boolean;showSubject?:boolean;saveTitle:(title:string,version?:number)=>Promise<boolean>}>()
defineEmits<{status:[status:StudyStatus];remove:[];link:[kind:'note'|'deck'|'focus'];plan:[];mistake:[];review:[correct:boolean]}>()
const {t}=useI18n(),store=useLearningStore(),personal=computed(()=>store.state(props.subject.id,props.topic.id))
const statuses=[{value:'todo' as const,icon:Circle},{value:'doing' as const,icon:CircleDot},{value:'done' as const,icon:CheckCircle2}]
</script>
<style scoped>
.study-topic-row{min-width:0;margin-bottom:10px;padding:12px 14px;border:1px solid hsl(var(--border)/.9);border-radius:14px;background:hsl(var(--card)/.9);box-shadow:0 1px 2px hsl(var(--foreground)/.025);transition:border-color 160ms}.study-topic-row:last-child{margin-bottom:0}.study-topic-row:hover{border-color:hsl(var(--primary)/.22)}
.study-topic-heading{display:flex;align-items:center;gap:8px;min-height:32px}.study-topic-parent{display:block;margin:3px 0 2px;font-size:10px;color:hsl(var(--muted-foreground))}
.study-topic-status{display:flex;gap:2px;flex-shrink:0;padding:3px;border:1px solid hsl(var(--border)/.65);border-radius:10px;background:hsl(var(--muted)/.2)}
.study-topic-status button,.study-topic-remove{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:1px solid transparent;border-radius:7px;color:hsl(var(--muted-foreground));transition:background 150ms,color 150ms,border-color 150ms}.study-topic-status button:hover{background:hsl(var(--card));color:hsl(var(--foreground))}.study-topic-status button[aria-pressed='true']{border-color:hsl(var(--primary)/.2);background:hsl(var(--primary)/.08);color:hsl(var(--primary));box-shadow:0 1px 2px hsl(var(--primary)/.035)}
.study-topic-remove{width:30px;height:30px;flex-shrink:0;border-color:hsl(var(--border)/.65);border-radius:9px;background:hsl(var(--background)/.5)}.study-topic-remove:hover{border-color:hsl(var(--destructive)/.22);background:hsl(var(--destructive)/.05);color:hsl(var(--destructive))}
.study-topic-row :deep(.study-topic-detail){margin-top:9px}.study-topic-row :deep(.study-title){font-size:13px}.study-topic-row button:focus-visible{outline:2px solid hsl(var(--primary)/.3);outline-offset:2px}.study-topic-row button:disabled{opacity:.4}
@media(max-width:540px){.study-topic-row{padding:10px}.study-topic-heading{gap:5px}.study-topic-status{padding:2px}.study-topic-status button{width:25px;height:26px}.study-topic-remove{width:28px;height:30px}}
@media(prefers-reduced-motion:reduce){.study-topic-row,.study-topic-status button,.study-topic-remove{transition:none}}
</style>
