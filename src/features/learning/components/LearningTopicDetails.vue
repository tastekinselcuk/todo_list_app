<template>
 <div v-if="!topic.archived" class="study-topic-detail" :class="{'is-compact':compact}">
  <div v-if="personal.seconds" class="study-topic-meta"><span class="study-hint">{{ t('study.focusTime',{minutes:Math.floor(personal.seconds/60)}) }}</span></div>
  <div class="study-topic-tools">
   <button v-if="settings.isModuleActive('detailed')" type="button" class="study-btn" :disabled="busy" @click="$emit('link','note')"><FileText :size="14" />{{ t('study.note') }}</button>
   <button v-if="settings.isModuleActive('flashcards')" type="button" class="study-btn" :disabled="busy" @click="$emit('link','deck')"><Layers :size="14" />{{ t('study.cards') }}</button>
   <button v-if="settings.isModuleActive('pomodoro')" type="button" class="study-btn" :disabled="busy||(timer.isRunning&&timer.currentTarget?.id===personal.pomo_task_id)" @click="$emit('link','focus')"><Timer :size="14" />{{ t('study.focus') }}</button>
   <button v-if="settings.isModuleActive('tasks')" type="button" class="study-btn" :disabled="busy" @click="$emit('plan')"><CalendarDays :size="14" />{{ t('study.plan') }}</button>
   <button type="button" class="study-btn" :disabled="busy" @click="$emit('mistake')"><Plus :size="14" />{{ t('study.addMistake') }}</button>
  </div>
 </div>
 <p v-else class="study-hint">{{ t('study.archivedTopic') }}</p>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarDays,FileText,Layers,Plus,Timer } from 'lucide-vue-next'
import { useLearningStore,type Topic } from '../stores/learning'
import { useSettingsStore } from '@/stores/settings'
import { usePomodoroStore } from '@/features/pomodoro/stores/pomodoro'
const props=defineProps<{subjectId:string;topic:Topic;busy:boolean;compact?:boolean}>()
defineEmits<{link:[kind:'note'|'deck'|'focus'];plan:[];mistake:[]}>()
const store=useLearningStore(),settings=useSettingsStore(),timer=usePomodoroStore(),{t}=useI18n()
const personal=computed(()=>store.state(props.subjectId,props.topic.id))
</script>

<style scoped>
.study-topic-meta{display:flex;flex-wrap:wrap;gap:4px 14px;margin-bottom:9px}.study-topic-tools{display:flex;flex-wrap:wrap;gap:7px}
.is-compact .study-btn{min-height:30px;padding:5px 9px;border:1px solid hsl(var(--border)/.65);border-radius:9px;background:hsl(var(--background)/.5);font-size:11px;font-weight:400;color:hsl(var(--muted-foreground));box-shadow:0 1px 1px hsl(var(--foreground)/.015);transition:background 150ms,border-color 150ms,color 150ms}.is-compact .study-btn:hover:not(:disabled){border-color:hsl(var(--primary)/.24);background:hsl(var(--primary)/.045);color:hsl(var(--foreground))}.is-compact .study-hint{font-size:10px}
@media(prefers-reduced-motion:reduce){.is-compact .study-btn{transition:none}}
</style>
