<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6">
      <div class="bg-card w-full max-w-5xl rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col h-[90vh] sm:h-[85vh] animate-in zoom-in-95 duration-200">
        
        <div class="p-6 border-b border-border bg-muted/30 space-y-4">
          <div class="flex justify-between items-center">
            <div>
              <h3 class="text-2xl font-bold text-foreground">{{ $t('workout.exerciseDatabase') }}</h3>
              <p class="text-sm text-muted-foreground mt-1">{{ $t('workout.searchAPI') }}</p>
            </div>
            <button @click="$emit('close')" class="p-2 hover:bg-accent rounded-full transition-colors"><X class="w-6 h-6"/></button>
          </div>
          
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input 
              v-model="searchQuery" 
              @keyup.enter="searchExercises"
              type="text" 
              :placeholder="$t('workout.searchPlaceholder')" 
              class="w-full h-12 pl-10 pr-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-all"
              autofocus
            />
            <button 
              @click="searchExercises" 
              :disabled="isSearching || !searchQuery"
              class="absolute right-2 top-1/2 -translate-y-1/2 h-8 px-4 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
            >
              {{ $t('workout.searchBtn') }}
            </button>
          </div>
        </div>
        
        <div class="overflow-y-auto p-6 flex-1 bg-muted/10 relative">
          
          <div v-if="isSearching" class="absolute inset-0 flex flex-col items-center justify-center bg-muted/10 backdrop-blur-sm z-10">
            <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-500 mb-4"></div>
            <p class="text-muted-foreground text-sm font-medium">{{ $t('workout.fetching') }}</p>
          </div>

          <div v-if="!isSearching && apiExercises.length === 0" class="h-full flex flex-col items-center justify-center text-muted-foreground text-center">
            <Dumbbell class="w-16 h-16 opacity-20 mb-4" />
            <p>{{ $t('workout.noExercises') }}</p>
            <p class="text-xs mt-2 opacity-70">{{ $t('workout.searchExample') }}</p>
          </div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div v-for="ex in apiExercises" :key="ex.name" class="group bg-card border border-border rounded-2xl overflow-hidden hover:shadow-xl hover:border-teal-500/50 transition-all duration-300 flex flex-col">
              
              <div class="w-full h-48 sm:h-56 bg-white relative overflow-hidden flex items-center justify-center p-4">
                <img :src="ex.imageUrl" class="w-auto h-full object-contain group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none"></div>
                <div class="absolute top-3 left-3 px-2.5 py-1 bg-background/90 backdrop-blur-md rounded-md text-[10px] font-bold uppercase tracking-wider text-foreground shadow-sm border border-border/50">
                  {{ ex.target }}
                </div>
                <h4 class="absolute bottom-3 left-4 font-bold text-xl text-white drop-shadow-lg capitalize">{{ ex.name }}</h4>
              </div>
              
              <div class="p-4 flex flex-col gap-3">
                <p class="text-xs text-muted-foreground mb-1">{{ $t('workout.quickAdd') }}</p>
                <div class="flex items-center gap-2">
                  <button @click="$emit('add', ex, 3, '10-12')" class="flex-1 py-2.5 bg-muted hover:bg-teal-500 hover:text-white rounded-xl text-sm font-semibold transition-colors duration-200">
                    {{ $t('workout.addSets', { sets: 3, reps: '10-12' }) }}
                  </button>
                  <button @click="$emit('add', ex, 4, '8-10')" class="flex-1 py-2.5 bg-muted hover:bg-teal-500 hover:text-white rounded-xl text-sm font-semibold transition-colors duration-200">
                    {{ $t('workout.addSets', { sets: 4, reps: '8-10' }) }}
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { X, Search, Dumbbell } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useUIStore } from '@/stores/ui'

const props = defineProps<{ show: boolean }>()
defineEmits<{
  close: []
  add: [exercise: any, sets: number, reps: string]
}>()

const RAPID_API_KEY = '1bd59db26fmsha1a081f8ce096c3p15e53djsnf1f74c1bed0d'
const { t } = useI18n()
const uiStore = useUIStore()

const searchQuery = ref('')
const isSearching = ref(false)
const apiExercises = ref<any[]>([])

// Modal açıldığında aramayı sıfırla
watch(() => props.show, (newVal) => {
  if (newVal && apiExercises.value.length === 0) searchQuery.value = ''
})

const searchExercises = async () => {
  if (!searchQuery.value.trim()) return

  isSearching.value = true
  try {
    const response = await fetch(`https://exercisedb.p.rapidapi.com/exercises/name/${searchQuery.value.toLowerCase()}?limit=15`, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPID_API_KEY,
        'x-rapidapi-host': 'exercisedb.p.rapidapi.com'
      }
    })

    const data = await response.json()
    
    if (Array.isArray(data)) {
      apiExercises.value = data.map((ex: any) => ({
        name: ex.name,
        target: ex.target,
        imageUrl: ex.gifUrl 
      }))
    } else {
      apiExercises.value = []
    }
  } catch (error) {
    uiStore.addToast(t('workout.apiError'), 'error')
  } finally {
    isSearching.value = false
  }
}
</script>