<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <div class="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
          <Target class="h-4 w-4 text-indigo-500" />
        </div>
        <div>
          <h2 class="text-sm font-semibold text-foreground">{{ $t('learning.title') }}</h2>
          <p class="text-xs text-muted-foreground">{{ $t('learning.subtitle') }}</p>
        </div>
      </div>
      
      <button
        @click="showAddSubject = !showAddSubject"
        class="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all flex items-center gap-2"
      >
        <Plus v-if="!showAddSubject" class="h-4 w-4" />
        <X v-else class="h-4 w-4" />
        <span>{{ showAddSubject ? $t('learning.cancel') : $t('learning.newSubject') }}</span>
      </button>
    </div>

    <transition name="slide-fade">
      <div v-if="showAddSubject" class="p-4 rounded-xl border border-border bg-card shadow-sm space-y-4">
        <div class="flex items-center gap-3">
          <input
            v-model="newSubjectTitle"
            @keyup.enter="handleAddSubject"
            type="text"
            :placeholder="$t('learning.subjectPlaceholder')"
            class="flex-1 h-10 px-3 rounded-lg border border-input bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            autofocus
          />
          <input
            v-model="newSubjectColor"
            type="color"
            class="h-10 w-10 p-1 rounded-lg border border-input bg-transparent cursor-pointer"
          />
          <button
            @click="handleAddSubject"
            :disabled="!newSubjectTitle.trim() || learningStore.isLoading"
            class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {{ $t('learning.create') }}
          </button>
        </div>
      </div>
    </transition>

    <div v-if="learningStore.isLoading && learningStore.subjects.length === 0" class="flex justify-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="subject in learningStore.subjects" 
        :key="subject.id"
        class="rounded-xl border border-border bg-card shadow-sm overflow-hidden transition-all duration-200"
      >
        <div 
          @click="toggleSubject(subject.id)"
          class="relative p-4 cursor-pointer hover:bg-accent/30 transition-colors group"
        >
          <div class="absolute left-0 top-0 bottom-0 w-1.5" :style="{ backgroundColor: subject.color }"></div>
          
          <div class="flex items-center justify-between pl-2">
            <div class="flex items-center gap-3">
              <ChevronDown
                class="h-4 w-4 text-muted-foreground transition-transform duration-200"
                :class="{ '-rotate-90': expandedSubject !== subject.id }"
              />
              <div>
                <h3 class="font-semibold text-foreground">{{ subject.title }}</h3>
                <p class="text-xs text-muted-foreground">
                  {{ $t('learning.topicsCount', { count: subject.topics.length }) }} • 
                  {{ $t('learning.stepsCount', { completed: getCompletedSteps(subject), total: subject.topics.length * 3 }) }}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-3 w-32 sm:w-48">
              <div class="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  class="h-full transition-all duration-500 ease-out"
                  :style="{ width: `${getSubjectProgress(subject)}%`, backgroundColor: subject.color }"
                ></div>
              </div>
              <span class="text-xs font-medium w-9 text-right tabular-nums">{{ Math.round(getSubjectProgress(subject)) }}%</span>
            </div>
          </div>
        </div>

        <transition name="slide-fade">
          <div v-if="expandedSubject === subject.id" class="border-t border-border bg-muted/10">
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
                <button @click="handleDeleteTopic(subject.id, topic.id)" class="opacity-0 group-hover/topic:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
                <span class="text-sm font-medium truncate" :class="{ 'line-through text-muted-foreground': isTopicFullyCompleted(topic) }">
                  {{ topic.title }}
                </span>
              </div>

              <div class="flex items-center gap-2 sm:gap-6">
                <button 
                  @click="handleToggleTopicStatus(subject.id, topic, 'learn')"
                  class="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200"
                  :class="topic.learn ? 'bg-blue-500/15 text-blue-500 ring-1 ring-blue-500/30' : 'bg-muted text-muted-foreground hover:bg-accent'"
                >
                  <BookOpen class="h-4 w-4" />
                </button>
                <button 
                  @click="handleToggleTopicStatus(subject.id, topic, 'practice')"
                  class="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200"
                  :class="topic.practice ? 'bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30' : 'bg-muted text-muted-foreground hover:bg-accent'"
                >
                  <PenTool class="h-4 w-4" />
                </button>
                <button 
                  @click="handleToggleTopicStatus(subject.id, topic, 'master')"
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
                v-model="newTopicTitles[subject.id]"
                @keyup.enter="handleAddTopic(subject.id)"
                type="text"
                :placeholder="$t('learning.addTopicPlaceholder')"
                class="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/50"
              />
            </div>
            
            <div class="px-6 py-3 border-t border-border/50 flex justify-end">
              <button @click="handleDeleteSubject(subject.id)" class="text-xs text-destructive hover:underline flex items-center gap-1">
                <Trash2 class="h-3 w-3" /> {{ $t('learning.deleteSubject') }}
              </button>
            </div>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Target, Plus, X, ChevronDown, BookOpen, PenTool, Award, Trash2 } from 'lucide-vue-next'
import { useLearningStore, type Subject, type Topic } from '@/stores/learning'
import { useI18n } from 'vue-i18n' // <-- YENİ EKLENDİ

const learningStore = useLearningStore()
const { t } = useI18n() // <-- YENİ EKLENDİ

// UI States
const showAddSubject = ref(false)
const expandedSubject = ref<string | null>(null)
const newSubjectTitle = ref('')
const newSubjectColor = ref('#6366f1')
const newTopicTitles = ref<Record<string, string>>({})

// Veritabanından verileri çek
onMounted(async () => {
  await learningStore.fetchSubjects()
})

// ACTIONS
const toggleSubject = (id: string) => {
  expandedSubject.value = expandedSubject.value === id ? null : id
}

const handleAddSubject = async () => {
  if (!newSubjectTitle.value.trim()) return
  
  await learningStore.addSubject(newSubjectTitle.value.trim(), newSubjectColor.value)
  
  newSubjectTitle.value = ''
  showAddSubject.value = false
}

const handleDeleteSubject = (id: string) => {
  // <-- ÇEVİRİ EKLENDİ
  if (confirm(t('learning.deleteConfirm'))) {
    learningStore.deleteSubject(id)
  }
}

const handleAddTopic = (subjectId: string) => {
  const title = newTopicTitles.value[subjectId]?.trim()
  if (!title) return

  learningStore.addTopic(subjectId, title)
  newTopicTitles.value[subjectId] = '' 
}

const handleDeleteTopic = (subjectId: string, topicId: string) => {
  learningStore.deleteTopic(subjectId, topicId)
}

const handleToggleTopicStatus = (subjectId: string, topic: Topic, phase: 'learn' | 'practice' | 'master') => {
  learningStore.toggleTopicStatus(subjectId, topic.id, phase)
}

// COMPUTED PROGRESS
const getCompletedSteps = (subject: Subject) => {
  if (!subject.topics) return 0 // Hata önleme
  return subject.topics.reduce((acc, topic) => {
    let completed = 0
    if (topic.learn) completed++
    if (topic.practice) completed++
    if (topic.master) completed++
    return acc + completed
  }, 0)
}

const getSubjectProgress = (subject: Subject) => {
  if (!subject.topics || subject.topics.length === 0) return 0
  const totalSteps = subject.topics.length * 3
  const completed = getCompletedSteps(subject)
  return (completed / totalSteps) * 100
}

const isTopicFullyCompleted = (topic: Topic) => {
  return topic.learn && topic.practice && topic.master
}
</script>

<style scoped>
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}
.slide-fade-leave-active {
  transition: all 0.2s ease-in;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}
</style>