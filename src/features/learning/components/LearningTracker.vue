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
      <LearningSubjectItem
        v-for="subject in learningStore.subjects" 
        :key="subject.id"
        :subject="subject"
        :isExpanded="expandedSubject === subject.id"
        @toggle="toggleSubject(subject.id)"
      />
    </div>
    
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Target, Plus, X } from 'lucide-vue-next'
import { useLearningStore } from '@/features/learning/stores/learning'
import LearningSubjectItem from './LearningSubjectItem.vue'

const learningStore = useLearningStore()
// UI States
const showAddSubject = ref(false)
const expandedSubject = ref<string | null>(null)
const newSubjectTitle = ref('')
const newSubjectColor = ref('#6366f1')

onMounted(async () => {
  await learningStore.fetchSubjects()
})

const toggleSubject = (id: string) => {
  expandedSubject.value = expandedSubject.value === id ? null : id
}

const handleAddSubject = async () => {
  if (!newSubjectTitle.value.trim()) return
  
  await learningStore.addSubject(newSubjectTitle.value.trim(), newSubjectColor.value)
  
  newSubjectTitle.value = ''
  showAddSubject.value = false
}
</script>

<style scoped>
.slide-fade-enter-active { transition: all 0.3s ease-out; }
.slide-fade-leave-active { transition: all 0.2s ease-in; }
.slide-fade-enter-from, .slide-fade-leave-to { transform: translateY(-10px); opacity: 0; }
</style>