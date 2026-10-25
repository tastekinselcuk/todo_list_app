<template>
 <div v-if="!topic.archived" class="study-topic-detail">
  <div v-if="personal.review_on||personal.seconds" class="flex flex-wrap gap-x-4 gap-y-1 mb-3"><span v-if="personal.review_on" class="study-hint">{{ t('study.nextReview') }} · {{ personal.review_on }}</span><span v-if="personal.seconds" class="study-hint">{{ t('study.focusTime',{minutes:Math.floor(personal.seconds/60)}) }}</span></div>
  <div class="flex flex-wrap gap-2">
   <button v-if="settings.isModuleActive('detailed')" type="button" class="study-btn" :disabled="busy" @click="$emit('link','note')"><FileText :size="14" />{{ t('study.note') }}</button>
   <button v-if="settings.isModuleActive('flashcards')" type="button" class="study-btn" :disabled="busy" @click="$emit('link','deck')"><Layers :size="14" />{{ t('study.cards') }}</button>
   <button v-if="settings.isModuleActive('pomodoro')" type="button" class="study-btn" :disabled="busy||(timer.isRunning&&timer.currentTarget?.id===personal.pomo_task_id)" @click="$emit('link','focus')"><Timer :size="14" />{{ t('study.focus') }}</button>
   <button v-if="settings.isModuleActive('tasks')" type="button" class="study-btn" :disabled="busy" @click="$emit('plan')"><CalendarDays :size="14" />{{ t('study.plan') }}</button>
   <button type="button" class="study-btn" :disabled="busy" @click="$emit('mistake')"><Plus :size="14" />{{ t('study.addMistake') }}</button>
  </div>
  <div v-if="personal.review_on" class="flex gap-2 mt-3"><button type="button" class="study-btn" :disabled="busy" @click="$emit('review',false)">{{ t('study.again') }}</button><button type="button" class="study-btn" :disabled="busy" @click="$emit('review',true)">{{ t('study.remembered') }}</button></div>
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
const props=defineProps<{subjectId:string;topic:Topic;busy:boolean}>()
defineEmits<{link:[kind:'note'|'deck'|'focus'];plan:[];mistake:[];review:[correct:boolean]}>()
const store=useLearningStore(),settings=useSettingsStore(),timer=usePomodoroStore(),{t}=useI18n()
const personal=computed(()=>store.state(props.subjectId,props.topic.id))
</script>
