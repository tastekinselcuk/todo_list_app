<template>
  <div class="max-w-5xl mx-auto space-y-10 p-4 sm:p-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
    
    <div class="space-y-2 mb-8">
      <h1 class="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight flex items-center gap-3">
        {{ $t('workspace.title') }}
      </h1>
      <p class="text-base text-muted-foreground/80 max-w-2xl font-medium">
        {{ $t('workspace.subtitle') }}
      </p>
    </div>

    <section class="space-y-5 relative">
      <h2 class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2.5">
        <Settings class="w-4 h-4" /> {{ $t('workspace.general') }}
      </h2>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        
        <div class="group flex items-center justify-between p-5 rounded-[1.5rem] border border-border/40 bg-card/40 backdrop-blur-xl hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:bg-card/60 transition-all duration-500">
          <div class="flex items-center gap-4">
            <div class="flex items-center justify-center w-11 h-11 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
              <Monitor class="w-5 h-5" />
            </div>
            <div>
              <h3 class="font-bold text-foreground tracking-tight">{{ $t('workspace.wideWorkspace') }}</h3>
              <p class="text-xs text-muted-foreground/80 mt-0.5">{{ $t('workspace.wideWorkspaceDesc') }}</p>
            </div>
          </div>
          
          <button
            type="button"
            @click="settingsStore.isFullScreen = !settingsStore.isFullScreen"
            class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            :class="settingsStore.isFullScreen ? 'bg-primary' : 'bg-muted-foreground/30'"
            role="switch"
          >
            <span
              aria-hidden="true"
              class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-300 ease-in-out"
              :class="settingsStore.isFullScreen ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>
        </div>

        <div class="group flex items-center justify-between p-5 rounded-[1.5rem] border border-border/40 bg-card/40 backdrop-blur-xl hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:bg-card/60 transition-all duration-500">
          <div class="flex items-center gap-4">
            <div class="flex items-center justify-center w-11 h-11 rounded-2xl bg-blue-500/10 text-blue-500 dark:text-blue-400 border border-blue-500/20 shadow-inner">
              <Globe class="w-5 h-5" />
            </div>
            <div>
              <h3 class="font-bold text-foreground tracking-tight">{{ $t('workspace.language') }}</h3>
              <p class="text-xs text-muted-foreground/80 mt-0.5">{{ $t('workspace.languageDesc') }}</p>
            </div>
          </div>
          
          <CustomSelect
            :modelValue="locale"
            @update:modelValue="handleLanguageChange"
            :options="languageOptions"
          />
        </div>

      </div>
    </section>

    <section class="space-y-5">
      <h2 class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2.5">
        <LayoutGrid class="w-4 h-4" /> {{ $t('workspace.activeModules') }}
      </h2>
      
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
        
        <div
          v-for="module in availableModules"
          :key="module.id"
          class="group relative flex flex-col justify-between p-6 rounded-[2rem] border transition-all duration-500 ease-out overflow-hidden cursor-pointer"
          :class="[
            settingsStore.isModuleActive(module.id) 
              ? `bg-card/60 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 ${module.theme.border}` 
              : 'bg-card/20 backdrop-blur-sm border-border/40 opacity-75 hover:opacity-100 grayscale-[0.3] hover:grayscale-0'
          ]"
          @click="settingsStore.toggleModule(module.id, module.isRequired)"
        >
          <div 
            v-if="settingsStore.isModuleActive(module.id)"
            class="absolute top-0 right-0 w-32 h-32 rounded-full blur-[60px] -mr-10 -mt-10 transition-all opacity-20 pointer-events-none"
            :class="module.theme.glow"
          ></div>

          <div class="space-y-5 relative z-10">
            <div class="flex items-start justify-between">
              
              <div 
                class="flex items-center justify-center w-12 h-12 rounded-2xl transition-all duration-500 shadow-inner"
                :class="settingsStore.isModuleActive(module.id) ? module.theme.iconBg : 'bg-muted/50 border border-border/50 text-muted-foreground'"
              >
                <component 
                  :is="module.icon" 
                  class="w-6 h-6 transition-colors duration-300"
                />
              </div>
              
              <button
                type="button"
                @click.stop="settingsStore.toggleModule(module.id, module.isRequired)"
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none"
                :class="settingsStore.isModuleActive(module.id) ? module.theme.switch : 'bg-muted-foreground/30'"
                role="switch"
                :aria-checked="settingsStore.isModuleActive(module.id)"
              >
                <span
                  aria-hidden="true"
                  class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-300 ease-in-out"
                  :class="settingsStore.isModuleActive(module.id) ? 'translate-x-5' : 'translate-x-0'"
                />
              </button>
            </div>

            <div class="space-y-1.5 pt-1">
              <h3 class="font-bold text-lg text-foreground tracking-tight flex items-center gap-2">
                {{ $t(`workspace.modules.${module.id}Name`) }}
                <span 
                  v-if="module.isRequired" 
                  class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-primary/10 text-primary uppercase tracking-widest border border-primary/20"
                >
                  {{ $t('workspace.core') }}
                </span>
              </h3>
              <p class="text-[13px] text-muted-foreground/80 leading-relaxed font-medium">
                {{ $t(`workspace.modules.${module.id}Desc`) }}
              </p>
            </div>
          </div>
          
          <div class="pt-6 mt-auto relative z-10">
            <div 
              class="flex items-center gap-2 text-xs font-semibold" 
              :class="settingsStore.isModuleActive(module.id) ? module.theme.text : 'text-muted-foreground/60'"
            >
              <div 
                class="w-1.5 h-1.5 rounded-full"
                :class="settingsStore.isModuleActive(module.id) ? `${module.theme.glow} animate-pulse shadow-[0_0_8px_currentColor]` : 'bg-muted-foreground/30'"
              ></div>
              {{ settingsStore.isModuleActive(module.id) ? $t('workspace.activeInWorkspace') : $t('workspace.inactive') }}
            </div>
          </div>
        </div>

      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { 
  CheckSquare, 
  Zap, 
  ShieldCheck, 
  Code2, 
  Timer,
  Target,
  Layers,
  Dumbbell,
  Monitor,
  Globe,
  Settings,
  LayoutGrid,
  Repeat // YENİ EKLENDİ
} from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { useI18n } from 'vue-i18n'
import CustomSelect from '@/components/ui/CustomSelect.vue'

const settingsStore = useSettingsStore()
const { locale } = useI18n()

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'tr', label: 'Türkçe' }
]

const handleLanguageChange = (newLang: string) => {
  locale.value = newLang
  settingsStore.language = newLang
}

const availableModules = [
  {
    id: 'detailed',
    icon: CheckSquare,
    isRequired: true,
    theme: {
      border: 'border-blue-500/30',
      glow: 'bg-blue-500',
      iconBg: 'bg-blue-500/15 border-blue-500/20 text-blue-500',
      switch: 'bg-blue-500',
      text: 'text-blue-500'
    }
  },
  {
    id: 'quick',
    icon: Zap,
    isRequired: false,
    theme: {
      border: 'border-amber-500/30',
      glow: 'bg-amber-500',
      iconBg: 'bg-amber-500/15 border-amber-500/20 text-amber-500',
      switch: 'bg-amber-500',
      text: 'text-amber-500'
    }
  },
  {
    id: 'secure',
    icon: ShieldCheck,
    isRequired: false,
    theme: {
      border: 'border-emerald-500/30',
      glow: 'bg-emerald-500',
      iconBg: 'bg-emerald-500/15 border-emerald-500/20 text-emerald-500',
      switch: 'bg-emerald-500',
      text: 'text-emerald-500'
    }
  },
  {
    id: 'code',
    icon: Code2,
    isRequired: false,
    theme: {
      border: 'border-violet-500/30',
      glow: 'bg-violet-500',
      iconBg: 'bg-violet-500/15 border-violet-500/20 text-violet-500',
      switch: 'bg-violet-500',
      text: 'text-violet-500'
    }
  },
  {
    id: 'pomodoro',
    icon: Timer,
    isRequired: false,
    theme: {
      border: 'border-rose-500/30',
      glow: 'bg-rose-500',
      iconBg: 'bg-rose-500/15 border-rose-500/20 text-rose-500',
      switch: 'bg-rose-500',
      text: 'text-rose-500'
    }
  },
  {
    id: 'learning',
    icon: Target,
    isRequired: false,
    theme: {
      border: 'border-indigo-500/30',
      glow: 'bg-indigo-500',
      iconBg: 'bg-indigo-500/15 border-indigo-500/20 text-indigo-500',
      switch: 'bg-indigo-500',
      text: 'text-indigo-500'
    }
  },
  {
    id: 'flashcards',
    icon: Layers,
    isRequired: false,
    theme: {
      border: 'border-orange-500/30',
      glow: 'bg-orange-500',
      iconBg: 'bg-orange-500/15 border-orange-500/20 text-orange-500',
      switch: 'bg-orange-500',
      text: 'text-orange-500'
    }
  },
  {
    id: 'workout',
    icon: Dumbbell,
    isRequired: false,
    theme: {
      border: 'border-teal-500/30',
      glow: 'bg-teal-500',
      iconBg: 'bg-teal-500/15 border-teal-500/20 text-teal-500',
      switch: 'bg-teal-500',
      text: 'text-teal-500'
    }
  },
  // YENİ EKLENEN MODÜL TEMASI
  {
    id: 'periodic',
    icon: Repeat,
    isRequired: false,
    theme: {
      border: 'border-pink-500/30',
      glow: 'bg-pink-500',
      iconBg: 'bg-pink-500/15 border-pink-500/20 text-pink-500',
      switch: 'bg-pink-500',
      text: 'text-pink-500'
    }
  }
]
</script>

<style scoped>
button[role="switch"] span {
  will-change: transform;
}
</style>