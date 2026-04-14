<template>
  <div class="rounded-xl border border-border bg-card shadow-sm overflow-hidden transition-all duration-200">
    
    <div 
      @click="$emit('toggle')"
      class="relative p-4 cursor-pointer hover:bg-accent/30 transition-colors group"
    >
      <div class="absolute left-0 top-0 bottom-0 w-1.5" :style="{ backgroundColor: subject.color }"></div>
      
      <div class="flex items-center justify-between pl-2">
        <div class="flex items-center gap-3">
          <ChevronDown
            class="h-4 w-4 text-muted-foreground transition-transform duration-200"
            :class="{ '-rotate-90': !isExpanded }"
          />
          <div>
            <h3 class="font-semibold text-foreground">{{ subject.title }}</h3>
            <p class="text-xs text-muted-foreground">
              {{ $t('learning.topicsCount', { count: subject.topics.length }) }} • 
              {{ $t('learning.stepsCount', { completed: completedSteps, total: subject.topics.length * 3 }) }}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-3 w-32 sm:w-48">
          <div class="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div 
              class="h-full transition-all duration-500 ease-out"
              :style="{ width: `${progressPercentage}%`, backgroundColor: subject.color }"
            ></div>
          </div>
          <span class="text-xs font-medium w-9 text-right tabular-nums">{{ Math.round(progressPercentage) }}%</span>
        </div>
      </div>
    </div>

    <transition name="slide-fade">
      <div v-if="isExpanded" class="border-t border-border bg-muted/10">
        
        <div class="grid grid-cols-[1fr,auto] gap-4 px-6 py-2 border-b border-border/50 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          <div>{{ $t('learning.topicUnit') }}</div>
          <div class="flex items-center gap-2 sm:gap-6 mr-2 sm:mr-4">
            <span class="w-8 text-center" :title="$t('learning.learnTitle')">{{ $t('learning.learn') }}</span>
            <span class="w-8 text-center" :title="$t('learning.practiceTitle')">{{ $t('learning.practice') }}</span>
            <span class="w-8 text-center" :title="$t('learning.masterTitle')">{{ $t('learning.master') }}</span>
          </div>
        </div>

        <div v-if="subject.topics.length === 0" class="p-6 text-center text-sm text-muted-foreground">
          {{ $t('learning.noTopics') }}
        </div>

        <div 
          v-for="topic in subject.topics" 
          :key="topic.id"
          class="grid grid-cols-[1fr,auto] gap-4 px-6 py-3 border-b border-border/50 items-center hover:bg-muted/20 transition-colors group/topic"
        >
          <div class="flex items-center gap-3 overflow-hidden">
            <button @click="learningStore.deleteTopic(subject.id, topic.id)" class="opacity-0 group-hover/topic:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
              <Trash2 class="h-3.5 w-3.5" />
            </button>
            <span class="text-sm font-medium truncate" :class="{ 'line-through text-muted-foreground': isTopicFullyCompleted(topic) }">
              {{ topic.title }}
            </span>
          </div>

          <div class="flex items-center gap-2 sm:gap-6">
            <button 
              @click="learningStore.toggleTopicStatus(subject.id, topic.id, 'learn')"
              class="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200"
              :class="topic.learn ? 'bg-blue-500/15 text-blue-500 ring-1 ring-blue-500/30' : 'bg-muted text-muted-foreground hover:bg-accent'"
            >
              <BookOpen class="h-4 w-4" />
            </button>
            <button 
              @click="learningStore.toggleTopicStatus(subject.id, topic.id, 'practice')"
              class="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200"
              :class="topic.practice ? 'bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30' : 'bg-muted text-muted-foreground hover:bg-accent'"
            >
              <PenTool class="h-4 w-4" />
            </button>
            <button 
              @click="learningStore.toggleTopicStatus(subject.id, topic.id, 'master')"
              class="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200"
              :class="topic.master ? 'bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/30' : 'bg-muted text-muted-foreground hover:bg-accent'"
            >
              <Award class="h-4 w-4" />
            </button>
          </div>
        </div>

        <div class="px-6 py-3 flex items-center gap-3">
          <Plus class="h-4 w-4 text-muted-foreground" />
          <input
            v-model="newTopicTitle"
            @keyup.enter="handleAddTopic"
            type="text"
            :placeholder="$t('learning.addTopicPlaceholder')"
            class="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        
        <div class="px-6 py-3 border-t border-border/50 flex justify-end">
          <button @click="handleDeleteSubject" class="text-xs text-destructive hover:underline flex items-center gap-1">
            <Trash2 class="h-3 w-3" /> {{ $t('learning.deleteSubject') }}
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronDown, BookOpen, PenTool, Award, Trash2, Plus } from 'lucide-vue-next'
import { useLearningStore, type Subject, type Topic } from '@/features/learning/stores/learning'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  subject: Subject
  isExpanded: boolean
}>()

defineEmits<{
  toggle: []
}>()

const learningStore = useLearningStore()
const { t } = useI18n()

// Sadece bu karta ait Topic Title state'i
const newTopicTitle = ref('')

// Hesaplamalar
const completedSteps = computed(() => {
  if (!props.subject.topics) return 0
  return props.subject.topics.reduce((acc, topic) => {
    let completed = 0
    if (topic.learn) completed++
    if (topic.practice) completed++
    if (topic.master) completed++
    return acc + completed
  }, 0)
})

const progressPercentage = computed(() => {
  if (!props.subject.topics || props.subject.topics.length === 0) return 0
  const totalSteps = props.subject.topics.length * 3
  return (completedSteps.value / totalSteps) * 100
})

const isTopicFullyCompleted = (topic: Topic) => {
  return topic.learn && topic.practice && topic.master
}

// Aksiyonlar
const handleAddTopic = () => {
  if (!newTopicTitle.value.trim()) return
  learningStore.addTopic(props.subject.id, newTopicTitle.value.trim())
  newTopicTitle.value = '' 
}

const handleDeleteSubject = () => {
  if (confirm(t('learning.deleteConfirm'))) {
    learningStore.deleteSubject(props.subject.id)
  }
}
</script>

<style scoped>
.slide-fade-enter-active { transition: all 0.3s ease-out; }
.slide-fade-leave-active { transition: all 0.2s ease-in; }
.slide-fade-enter-from, .slide-fade-leave-to { transform: translateY(-10px); opacity: 0; }
</style>