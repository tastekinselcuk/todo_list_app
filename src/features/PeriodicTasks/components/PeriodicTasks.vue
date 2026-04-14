<template>
  <div class="space-y-5 animate-in fade-in zoom-in-95 duration-500 relative z-10 w-full flex flex-col items-center">
    
    <div class="flex flex-col gap-3 max-w-5xl w-full bg-card/40 border border-border/40 p-4 rounded-2xl shadow-sm">
      <div class="flex gap-2.5 w-full">
        <div class="relative flex-1 group">
          <input
            v-model="newTaskTitle"
            @keyup.enter="addTask"
            type="text"
            :placeholder="$t('periodicTasks.placeholder') || 'Örn: Haftalık raporları kontrol et...'"
            class="w-full h-10 pl-4 pr-3 rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground/60 shadow-sm focus:ring-1 focus:ring-primary/30 focus:border-primary/40 focus:bg-background transition-all outline-none text-sm"
          />
        </div>
        <button
          @click="addTask"
          class="h-10 px-5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-sm hover:shadow-lg transition-all disabled:opacity-50 text-xs flex items-center justify-center gap-2"
          :disabled="!newTaskTitle.trim() || (frequency === 'weekly' && selectedDays.length === 0) || taskStore.isLoading"
        >
          <span v-if="taskStore.isLoading" class="animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full"></span>
          {{ $t('periodicTasks.add') || 'Rutin Ekle' }}
        </button>
      </div>

      <div class="flex items-center gap-4 mt-1">
        <select
          v-model="frequency"
          class="h-8 rounded-lg border border-input bg-background text-foreground px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
        >
          <option value="daily">{{ $t('periodicTasks.daily') || 'Her Gün' }}</option>
          <option value="weekly">{{ $t('periodicTasks.weekly') || 'Belirli Günler' }}</option>
        </select>

        <div v-if="frequency === 'weekly'" class="flex gap-1.5 animate-in fade-in slide-in-from-left-2 duration-300">
          <button
            v-for="day in weekDays"
            :key="day.value"
            @click="toggleDay(day.value)"
            class="w-8 h-8 rounded-full text-[11px] font-medium transition-all flex items-center justify-center border"
            :class="selectedDays.includes(day.value) 
              ? 'bg-primary text-primary-foreground border-primary shadow-sm' 
              : 'bg-background/50 text-muted-foreground border-border/50 hover:bg-muted'"
          >
            {{ day.label }}
          </button>
        </div>
      </div>
    </div>
    
    <div class="space-y-4 pt-2 max-w-7xl w-full">
      
      <div class="flex items-center justify-between gap-3 w-full border-b border-border/40 pb-3">
        <div class="flex items-center gap-3">
          <div class="h-4 w-1 bg-primary rounded-full"></div>
          <span class="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
            <CalendarCheck v-if="!showWeeklyPlanner" class="w-4 h-4" />
            <LayoutGrid v-else class="w-4 h-4" />
            {{ showWeeklyPlanner ? ($t('periodicTasks.weeklyPlanner') || 'Haftalık Planlayıcı') : ($t('periodicTasks.todayTasks') || "Bugünün Rutinleri") }}
          </span>
        </div>
        
        <button 
          @click="showWeeklyPlanner = !showWeeklyPlanner"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 border"
          :class="showWeeklyPlanner 
            ? 'bg-primary/10 border-primary/20 text-primary hover:bg-primary/20' 
            : 'bg-background border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted'"
        >
          <ListTodo v-if="showWeeklyPlanner" class="w-3.5 h-3.5" />
          <LayoutGrid v-else class="w-3.5 h-3.5" />
          {{ showWeeklyPlanner ? ($t('periodicTasks.backToToday') || 'Bugüne Dön') : ($t('periodicTasks.viewAll') || 'Tümünü Gör / Düzenle') }}
        </button>
      </div>
      
      <div v-if="taskStore.isLoading && taskStore.tasks.length === 0" class="flex justify-center py-12 text-muted-foreground">
         <span class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full"></span>
      </div>

      <div v-else-if="!showWeeklyPlanner" class="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto w-full">
        <div v-if="taskStore.todaysTasks.length > 0" class="grid grid-cols-1 gap-2 w-full">
          <PeriodicTaskItem
            v-for="task in taskStore.todaysTasks"
            :key="task.id"
            :task="task"
            @toggle="toggleTask"
            @delete="deleteTask"
          />
        </div>
        <div v-else class="text-center py-10 flex flex-col items-center justify-center border border-dashed border-border/40 rounded-3xl bg-muted/5 w-full">
          <div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <CheckCircle class="w-5 h-5 text-emerald-500/60" />
          </div>
          <p class="text-sm font-medium text-muted-foreground">{{ $t('periodicTasks.noTasksToday') || 'Bugün için planlanmış bir rutin yok!' }}</p>
        </div>
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        <div 
          v-for="day in plannerDays" 
          :key="day.value" 
          class="bg-card/40 border border-border/50 rounded-xl overflow-hidden flex flex-col h-[380px] shadow-sm hover:shadow-md transition-shadow"
          :class="{'ring-1 ring-primary/30 bg-primary/5': currentDayOfWeek === day.value}"
        >
          <div class="bg-muted/30 border-b border-border/50 px-3 py-2.5 flex items-center justify-between">
            <span class="font-semibold text-xs flex items-center gap-1.5" :class="currentDayOfWeek === day.value ? 'text-primary' : 'text-foreground'">
              {{ day.label }}
              <span v-if="currentDayOfWeek === day.value" class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            </span>
            <span class="text-[10px] font-medium bg-background border border-border/50 text-muted-foreground px-1.5 py-0.5 rounded-md">
              {{ day.tasks.length }}
            </span>
          </div>
          
          <div class="p-2 overflow-y-auto flex-1 space-y-2 custom-scrollbar">
            <div 
              v-for="task in day.tasks" 
              :key="task.id + day.value" 
              class="group relative flex flex-col gap-1.5 bg-background/80 border border-border/40 p-2.5 rounded-lg text-xs transition-all hover:border-destructive/30 hover:shadow-sm"
            >
              <div class="flex items-start justify-between gap-2">
                <span class="font-medium text-foreground/90 leading-tight break-words">{{ task.title }}</span>
                <button 
                  @click="deleteTask(task.id)" 
                  class="opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-all shrink-0 rounded p-1" 
                  title="Rutini Tamamen Sil"
                >
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>
              <div class="flex items-center gap-1 text-[9px] text-muted-foreground/70 font-medium">
                <Repeat class="w-2.5 h-2.5" />
                {{ task.frequency === 'daily' ? ($t('periodicTasks.daily') || 'Her Gün') : ($t('periodicTasks.weekly') || 'Haftalık') }}
              </div>
            </div>
            
            <div v-if="day.tasks.length === 0" class="h-full flex flex-col items-center justify-center text-muted-foreground/30 gap-2 opacity-50 pt-8">
              <div class="w-8 h-8 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center">
                <span class="text-[10px]">-</span>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { CalendarCheck, CheckCircle, LayoutGrid, ListTodo, Trash2, Repeat } from 'lucide-vue-next'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import { usePeriodicTasksStore } from '../stores/periodicTasks';
import PeriodicTaskItem from './PeriodicTaskItem.vue'

const uiStore = useUIStore()
const { t } = useI18n()
const taskStore = usePeriodicTasksStore()

// Form Durumları
const newTaskTitle = ref('')
const frequency = ref<'daily' | 'weekly'>('daily')
const selectedDays = ref<number[]>([])

// Görünüm Değiştirici
const showWeeklyPlanner = ref(false)
const currentDayOfWeek = new Date().getDay() // Bugünün gün indeksini vurgulamak için

const weekDays = computed(() => [
  { label: t('days.mon') || 'Mon', value: 1 },
  { label: t('days.tue') || 'Tue', value: 2 },
  { label: t('days.wed') || 'Wed', value: 3 },
  { label: t('days.thu') || 'Thu', value: 4 },
  { label: t('days.fri') || 'Fri', value: 5 },
  { label: t('days.sat') || 'Sat', value: 6 },
  { label: t('days.sun') || 'Sun', value: 0 }
])
// Sayfa yüklendiğinde verileri Supabase'den çek
onMounted(() => {
  taskStore.loadTasks()
})

// Haftalık Planlayıcı için Veri Hazırlığı
const plannerDays = computed(() => {
  // Pazartesi'den başlayacak şekilde günleri sıralayalım
  const orderedDays = [
    { label: t('days.mon') || 'Pazartesi', value: 1 },
    { label: t('days.tue') || 'Salı', value: 2 },
    { label: t('days.wed') || 'Çarşamba', value: 3 },
    { label: t('days.thu') || 'Perşembe', value: 4 },
    { label: t('days.fri') || 'Cuma', value: 5 },
    { label: t('days.sat') || 'Cumartesi', value: 6 },
    { label: t('days.sun') || 'Pazar', value: 0 }
  ]

  return orderedDays.map(day => {
    // Bu güne ait görevleri filtrele
    const dayTasks = taskStore.tasks.filter(task => {
      if (task.frequency === 'daily') return true
      if (task.frequency === 'weekly' && task.days_of_week?.includes(day.value)) return true
      return false
    })
    return { ...day, tasks: dayTasks }
  })
})

const toggleDay = (dayValue: number) => {
  const index = selectedDays.value.indexOf(dayValue)
  if (index === -1) {
    selectedDays.value.push(dayValue)
  } else {
    selectedDays.value.splice(index, 1)
  }
}

const addTask = async () => {
  if (!newTaskTitle.value.trim() || taskStore.isLoading) return
  if (frequency.value === 'weekly' && selectedDays.value.length === 0) {
    uiStore.addToast('Lütfen en az bir gün seçin.', 'error')
    return
  }

  await taskStore.addTask(newTaskTitle.value.trim(), frequency.value, selectedDays.value)

  if (!taskStore.error) {
    newTaskTitle.value = ''
    frequency.value = 'daily'
    selectedDays.value = []
    uiStore.addToast(t('periodicTasks.added') || 'Rutin başarıyla eklendi', 'success')
  } else {
    uiStore.addToast(taskStore.error, 'error')
  }
}

const toggleTask = async (taskId: string) => {
  await taskStore.toggleTask(taskId)
}

const deleteTask = async (taskId: string) => {
  const isConfirmed = await uiStore.showConfirm(
    t('periodicTasks.deleteConfirmTitle') || 'Rutini Sil', 
    t('periodicTasks.deleteConfirmDesc') || 'Bu rutini kalıcı olarak silmek istediğinize emin misiniz? (Haftalık planlayıcıdan da tamamen silinecektir)', 
    t('common.delete') || 'Sil', 
    t('common.cancel') || 'İptal'
  )
  
  if (isConfirmed) {
    await taskStore.deleteTask(taskId)
    if (!taskStore.error) {
      uiStore.addToast(t('periodicTasks.deleted') || 'Rutin silindi', 'info')
    }
  }
}
</script>

<style scoped>
/* İç panellerdeki scroll çubuğunu gizlemek ve daha şık yapmak için */
.custom-scrollbar::-webkit-scrollbar {
  width: 3px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.5);
}
</style>