<template>
  <transition name="teleportLift">
    <div
      v-if="!isExpanded"
      key="compact"
      data-teleport="compact"
      class="bg-card/50 backdrop-blur-xl text-card-foreground p-4 rounded-3xl shadow-[0_6px_24px_rgb(0,0,0,0.025)] border border-border/50 relative max-w-sm mx-auto w-full transition-all duration-300 group/pomodoro flex flex-col items-center"
    >
      <div class="w-full flex flex-col items-center gap-4 mb-4">
        <div class="flex gap-1 p-1 bg-muted/40 rounded-full items-center justify-center">
          <button
            v-for="mode in modes"
            :key="mode.name"
            @click="setMode(mode)"
            @context-menu.prevent="openCustomizeDialog"
            :title="$t('pomodoro.rightClickSetup')"
            class="px-3.5 py-1 text-[11px] font-semibold rounded-full transition-all duration-300 tabular-nums"
            :class="[
              currentMode.name === mode.name
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            ]"
          >
            {{ mode.name }}
          </button>
        </div>
      </div>

      <div class="flex flex-col items-center justify-center py-2 w-full mb-4">
        <div v-if="currentTarget" class="mb-2 flex max-w-full items-center gap-1"><button type="button" class="min-w-0 truncate px-2 text-xs text-muted-foreground hover:text-foreground" :title="currentTarget.title" @click="emit('focus-task', currentTarget.workspace_id)">{{ currentTarget.title || t('pomoNotes.unavailableTask') }}</button><button type="button" :disabled="timer.clearing" class="rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground" :aria-label="t('pomoNotes.freeFocus')" :title="t('pomoNotes.freeFocus')" @click="clearFocus()"><X class="h-3 w-3" /></button></div>
        <div
          class="text-6xl font-thin tabular-nums tracking-tighter text-foreground cursor-pointer select-none transition-colors hover:text-primary duration-300"
          @click="clickTimerCustomize"
          :title="$t('pomodoro.clickSetup')"
        >
          {{ formattedTime }}
        </div>
      </div>

      <div class="flex justify-center gap-2 w-full">
        <button
          @click="toggleTimer"
          :disabled="starting || timer.clearing"
          class="flex-1 py-2.5 rounded-xl font-semibold transition-all duration-300 shadow-sm flex items-center justify-center gap-2 text-xs"
          :class="[
            isRunning 
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 ring-1 ring-amber-500/30' 
              : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md'
          ]"
        >
          {{ remote ? $t('pomoNotes.continueHere') : isRunning ? $t('pomodoro.pause') : $t('pomodoro.start') }}
        </button>
        <button
          @click="resetTimer"
          class="flex-1 py-2.5 rounded-xl border border-input bg-background/50 text-foreground hover:bg-muted transition-all duration-300 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="!canReset"
        >
          {{ $t('pomodoro.reset') }}
        </button>
      </div>

      <button
        type="button"
        @click="setExpanded(true)"
        class="absolute top-4 right-4 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full transition-all duration-200 opacity-0 group-hover/pomodoro:opacity-100 scale-90 group-hover/pomodoro:scale-100 focus-visible:opacity-100 focus-visible:scale-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:scale-100"
        :title="$t('pomodoro.expandToNavbar')"
        :aria-label="$t('pomodoro.expandToNavbar')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </button>
      <p v-if="timer.error && timer.error !== 'REMOTE_ACTIVE'" class="mt-2 text-center text-xs text-muted-foreground" role="status">{{ t(timer.errorMessageKey) }}</p>
    </div>

    <div
      v-else
      key="expanded"
      data-teleport="expanded"
      data-pomodoro-navigation
      :inert="!navbarVisible"
      :style="attached ? { top:`${(headerOffset ?? workspaceHeaderHeight) - workspaceHeaderHeight}px` } : undefined"
      :class="[
        'pomodoro-dock fixed top-0 left-0 right-0 bg-card/70 backdrop-blur-2xl border-b border-border/60 shadow-sm z-40',
        navbarVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none',
        { 'is-workspace-attached': attached }
      ]"
    >
      <div class="h-14 max-w-full pl-3 pr-[4.5rem] sm:pl-5 sm:pr-28 flex items-center justify-between gap-2 relative" :style="attached ? { height:`${workspaceHeaderHeight}px` } : undefined">
        <div data-pomodoro-left class="flex shrink-0 items-center gap-3 xl:gap-4">
          <div class="flex items-center gap-2">
            <div class="hidden xl:block p-1.5 bg-primary/10 text-primary rounded-lg ring-1 ring-primary/20">
              <Timer class="h-4 w-4" />
            </div>
            <div class="flex flex-col items-start"><button type="button" @click="clickTimerCustomize" :title="$t('pomodoro.clickSetup')" :aria-label="$t('pomodoro.clickSetup')" class="rounded-lg px-1 text-xl font-medium tracking-tight text-foreground tabular-nums hover:bg-muted/50 transition-colors">{{ formattedTime }}</button><div v-if="currentTarget" class="flex max-w-[6rem] items-center"><button type="button" class="min-w-0 truncate px-1 text-[9px] leading-3 text-muted-foreground hover:text-foreground" :title="currentTarget.title" @click="emit('focus-task', currentTarget.workspace_id)">{{ currentTarget.title || t('pomoNotes.unavailableTask') }}</button><button type="button" :disabled="timer.clearing" class="rounded p-0.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground" :aria-label="t('pomoNotes.freeFocus')" :title="t('pomoNotes.freeFocus')" @click="clearFocus()"><X class="h-2.5 w-2.5" /></button></div></div>
          </div>

        <div data-pomodoro-modes role="group" :aria-label="$t('pomodoro.modeSelect')" class="hidden lg:flex gap-1 p-0.5 bg-muted/40 rounded-full border border-border/50 items-center">
          <button
            v-for="mode in modes"
            :key="mode.name"
            @click="setMode(mode)"
            @context-menu.prevent="openCustomizeDialog"
            :title="$t('pomodoro.rightClickSetup')"
            type="button"
            :aria-pressed="currentMode.key === mode.key"
            class="px-2.5 py-1 text-[10px] font-semibold whitespace-nowrap rounded-full transition-colors duration-200"
            :class="[
              currentMode.name === mode.name
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/30'
            ]"
          >
            {{ mode.name }}
          </button>
        </div>
        <button data-pomodoro-mode-trigger type="button" popovertarget="pomodoro-dock-controls" :aria-label="$t('pomodoro.modeSelect')" :title="$t('pomodoro.modeSelect')" class="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted/40 text-muted-foreground transition-colors hover:bg-background sm:inline-flex lg:hidden"><MoreHorizontal class="h-3.5 w-3.5" /></button>
        </div>

        <div class="hidden sm:flex items-center gap-3 flex-shrink-0">
          <div class="flex items-center gap-1.5 bg-muted/40 rounded-full p-0.5 border border-border/50">
            <button
              @click="toggleTimer"
              :disabled="starting || timer.clearing"
              class="px-3 py-1 rounded-full text-[11px] font-semibold transition-all duration-300"
              :class="[
                isRunning 
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 ring-1 ring-amber-500/30' 
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              ]"
            >
              {{ remote ? $t('pomoNotes.continueHere') : isRunning ? $t('pomodoro.pause') : $t('pomodoro.start') }}
            </button>
            <button
              @click="resetTimer"
              :title="$t('pomodoro.reset')" :aria-label="$t('pomodoro.reset')" class="px-2 py-1 rounded-full text-[11px] font-medium bg-transparent text-foreground hover:bg-background transition-colors disabled:opacity-40"
              :disabled="!canReset"
            >
              <span class="hidden lg:inline">{{ $t('pomodoro.reset') }}</span><RotateCcw class="h-3.5 w-3.5 lg:hidden" />
            </button>
            <button
              type="button"
              @click="setExpanded(false)"
              class="p-1.5 hover:bg-background rounded-full transition-colors text-muted-foreground hover:text-foreground"
              :title="$t('pomodoro.collapse')"
              :aria-label="$t('pomodoro.collapse')"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>
          </div>


        </div>
        <button type="button" popovertarget="pomodoro-dock-controls" :aria-label="$t('pomodoro.controls')" :title="$t('pomodoro.controls')" class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted/40 text-muted-foreground transition-colors hover:bg-background hover:text-foreground sm:hidden">
          <MoreHorizontal class="h-4 w-4" />
        </button>
        <div ref="dockControls" id="pomodoro-dock-controls" popover="auto" :aria-label="$t('pomodoro.controls')" class="dock-controls rounded-2xl border border-border/60 bg-card p-1.5 text-card-foreground shadow-[0_12px_36px_rgb(0,0,0,0.12)]">
          <div role="group" :aria-label="$t('pomodoro.modeSelect')" class="border-b border-border/40 pb-1.5 mb-1.5 sm:border-0 sm:pb-0 sm:mb-0">
            <button v-for="mode in modes" :key="mode.key" type="button" :aria-pressed="currentMode.key === mode.key" class="dock-control" :class="currentMode.key === mode.key ? 'bg-muted text-foreground' : 'text-muted-foreground'" @click="setMode(mode); closeDockControls()">{{ mode.name }}<Check v-if="currentMode.key === mode.key" class="ml-auto h-3.5 w-3.5" /></button>
          </div>
          <button type="button" :disabled="starting || timer.clearing" class="dock-control sm:!hidden" @click="toggleTimer(); closeDockControls()"><Pause v-if="isRunning && !remote" class="h-3.5 w-3.5" /><Play v-else class="h-3.5 w-3.5" />{{ remote ? $t('pomoNotes.continueHere') : isRunning ? $t('pomodoro.pause') : $t('pomodoro.start') }}</button>
          <button type="button" :disabled="!canReset" class="dock-control sm:!hidden" @click="resetTimer(); closeDockControls()"><RotateCcw class="h-3.5 w-3.5" />{{ $t('pomodoro.reset') }}</button>
          <button type="button" class="dock-control text-muted-foreground sm:!hidden" @click="closeDockControls(); setExpanded(false)"><ArrowDown class="h-3.5 w-3.5" />{{ $t('pomodoro.collapse') }}</button>
        </div>
      </div>
      
      <div class="absolute bottom-0 left-0 w-full h-[3px] bg-transparent overflow-hidden">
        <div 
          class="h-full transition-all duration-1000 ease-linear"
          :class="isRunning ? 'bg-primary' : 'bg-muted-foreground/30'"
          :style="{ width: `${progressPercentage}%` }"
        ></div>
      </div>
    </div>
  </transition>

  <dialog
    ref="customizeDialog"
    class="pomodoro-dialog w-[90vw] max-w-sm rounded-3xl border border-border/50 bg-card/80 backdrop-blur-2xl text-card-foreground shadow-2xl overflow-hidden"
  >
    <div class="p-6 space-y-5">
      <div class="flex items-center justify-between gap-3 border-b border-border/50 pb-3">
        <h2 class="text-base font-bold tracking-tight text-foreground">{{ $t('pomodoro.timerPresets') }}</h2>
        <button
          @click="customizeDialog?.close()"
          class="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>

      <div class="space-y-1.5">
        <button
          v-for="preset in presetCards"
          :key="preset.id"
          type="button"
          @click="selectDraftPreset(preset.id)"
          class="w-full text-left rounded-xl border px-3.5 py-2.5 transition-all duration-200 flex items-center gap-3"
          :class="
            draftPreset === preset.id
              ? 'border-primary bg-primary/5 shadow-inner'
              : 'border-border/50 bg-background/30 hover:border-primary/30 hover:bg-background/50'
          "
        >
          <span class="preset-radio" :data-selected="draftPreset === preset.id ? 'true' : 'false'"></span>
          <span class="flex-1 flex items-center justify-between gap-2">
            <span class="text-xs font-semibold text-foreground">{{ preset.name }}</span>
            <span class="text-[10px] font-medium text-muted-foreground tabular-nums bg-muted px-2 py-0.5 rounded">{{ preset.summary }}</span>
          </span>
        </button>
      </div>

      <transition name="customPanel">
        <div
          v-if="draftPreset === 'custom'"
          class="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-4"
        >
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="font-medium text-muted-foreground">{{ $t('pomodoro.focus') }}</span>
              <span class="font-bold text-foreground tabular-nums bg-background px-2 py-0.5 rounded border border-border/50">{{ draftCustomDurations.focus }}m</span>
            </div>
            <input
              id="custom-focus"
              v-model.number="draftCustomDurations.focus"
              type="range"
              min="10"
              max="90"
              step="1"
              class="modern-range"
              :style="`--range-progress: ${(draftCustomDurations.focus - 10) / (90 - 10) * 100}%`"
            />
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="font-medium text-muted-foreground">{{ $t('pomodoro.shortBreak') }}</span>
              <span class="font-bold text-foreground tabular-nums bg-background px-2 py-0.5 rounded border border-border/50">{{ draftCustomDurations.shortBreak }}m</span>
            </div>
            <input
              id="custom-short-break"
              v-model.number="draftCustomDurations.shortBreak"
              type="range"
              min="3"
              max="30"
              step="1"
              class="modern-range"
              :style="`--range-progress: ${(draftCustomDurations.shortBreak - 3) / (30 - 3) * 100}%`"
            />
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="font-medium text-muted-foreground">{{ $t('pomodoro.longBreak') }}</span>
              <span class="font-bold text-foreground tabular-nums bg-background px-2 py-0.5 rounded border border-border/50">{{ draftCustomDurations.longBreak }}m</span>
            </div>
            <input
              id="custom-long-break"
              v-model.number="draftCustomDurations.longBreak"
              type="range"
              min="5"
              max="45"
              step="1"
              class="modern-range"
              :style="`--range-progress: ${(draftCustomDurations.longBreak - 5) / (45 - 5) * 100}%`"
            />
          </div>
        </div>
      </transition>

      <div class="flex items-center justify-end gap-2 pt-3 border-t border-border/50">
        <button
          @click="customizeDialog?.close()"
          class="px-4 py-2 rounded-full text-xs font-medium hover:bg-muted transition-colors"
        >
          {{ $t('pomodoro.cancel') }}
        </button>
        <button
          @click="saveTimerConfiguration"
          class="px-5 py-2 rounded-full bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-sm"
        >
          {{ $t('pomodoro.apply') }}
        </button>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ArrowDown, Check, MoreHorizontal, Pause, Play, Timer, X, RotateCcw } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { workspaceHeaderHeight } from '@/lib/navigationScroll'
import { useUIStore } from '@/stores/ui'
import { usePomodoroStore, normalizeDurations, type TimerDurations, type ModeKey } from '@/features/pomodoro/stores/pomodoro'
interface Props { navbarVisible?: boolean; docked?: boolean; attached?: boolean; headerOffset?: number }
interface Emits { expand: []; collapse: []; 'focus-task': [workspace: string] }
interface TimerMode { key: ModeKey; name: string; label: string; duration: number }
type TimerPresetId = 'baby-step' | 'popular' | 'medium' | 'extended' | 'custom'
const props = withDefaults(defineProps<Props>(), { navbarVisible: true, docked: false })
const emit = defineEmits<Emits>()
const { t } = useI18n()
const timer = usePomodoroStore()
const ui = useUIStore()
const { isRunning, formattedTime, progressPercentage, canReset, currentTarget, remote, starting } = storeToRefs(timer)
const modes = computed<TimerMode[]>(() => [
  { key:'focus',name:t('pomodoro.focus'),label:'Pomodoro',duration:timer.durations.focus*60 },
  { key:'shortBreak',name:t('pomodoro.shortBreak'),label:'Rest',duration:timer.durations.shortBreak*60 },
  { key:'longBreak',name:t('pomodoro.longBreak'),label:'Long Rest',duration:timer.durations.longBreak*60 },
])
const currentMode = computed(() => ({ ...modes.value.find(mode=>mode.key===timer.modeKey)!, duration:timer.sessionSeconds }))
const isExpanded = ref(props.docked)
const dockControls = ref<HTMLElement>()
const customizeDialog = ref<HTMLDialogElement|null>(null)
const closeDockControls = () => dockControls.value?.hidePopover?.()
watch(()=>props.navbarVisible,visible=>{if(!visible)closeDockControls()})
watch(()=>props.docked,value=>{isExpanded.value=value})
function setExpanded(value:boolean) { isExpanded.value=value;if(value)emit('expand');else emit('collapse') }
const timerPresets = [
  { id:'baby-step',focus:10,shortBreak:5,longBreak:10 }, { id:'popular',focus:25,shortBreak:5,longBreak:15 },
  { id:'medium',focus:40,shortBreak:8,longBreak:20 }, { id:'extended',focus:60,shortBreak:10,longBreak:25 },
] as const
const customDurations = ref<TimerDurations>({...timer.durations})
const draftCustomDurations = ref<TimerDurations>({...customDurations.value})
const draftPreset = ref<TimerPresetId>('popular')
const findPresetId=(value:TimerDurations):TimerPresetId=>timerPresets.find(preset=>preset.focus===value.focus&&preset.shortBreak===value.shortBreak&&preset.longBreak===value.longBreak)?.id||'custom'
const formatDurationTriplet=(value:TimerDurations)=>`${value.focus}m / ${value.shortBreak}m / ${value.longBreak}m`
const customPreviewDurations=computed(()=>draftPreset.value==='custom'?normalizeDurations(draftCustomDurations.value):customDurations.value)
const presetCards=computed(()=>[...timerPresets.map(preset=>({id:preset.id as TimerPresetId,name:t(`pomodoro.presets.${preset.id}`),summary:formatDurationTriplet(preset)})),
  {id:'custom' as TimerPresetId,name:t('pomodoro.custom'),summary:formatDurationTriplet(customPreviewDurations.value)}])
const openCustomizeDialog=()=>{draftPreset.value=findPresetId(timer.durations);draftCustomDurations.value={...timer.durations};customizeDialog.value?.showModal()}
const selectDraftPreset=(id:TimerPresetId)=>{draftPreset.value=id;draftCustomDurations.value={...(timerPresets.find(preset=>preset.id===id)||customDurations.value)}}
const saveTimerConfiguration=()=>{const value=normalizeDurations(draftCustomDurations.value);if(draftPreset.value==='custom')customDurations.value=value;timer.configure(value);customizeDialog.value?.close()}
const clickTimerCustomize=()=>openCustomizeDialog()
const setMode=async(mode:TimerMode)=>{await timer.setMode(mode.key);notifyFailure()}
const notifyFailure=()=>{if(timer.error&&timer.error!=='REMOTE_ACTIVE')ui.addToast(t(timer.errorMessageKey),'error')}
const toggleTimer=async()=>{await timer.toggleTimer();notifyFailure()}
const clearFocus=async()=>{await timer.clearFocus();notifyFailure()}
const resetTimer=async()=>{await timer.resetTimer();notifyFailure()}
watch(()=>timer.completionSequence,()=>{
  if(typeof Audio!=='undefined'){const audio=new Audio('/notification.mp3');void audio.play().catch(()=>{})}
  if('Notification' in window&&Notification.permission==='granted'){
    try{new Notification(t('pomodoro.timerComplete'),{body:t('pomodoro.sessionCompleted',{mode:t(`pomodoro.${timer.lastCompletedMode}`)})})}catch{}
  }
})
onMounted(()=>timer.init())
onUnmounted(()=>timer.shutdown())
</script>

<style scoped>
.pomodoro-dock { transition: transform 240ms cubic-bezier(.22,1,.36,1), padding-left 240ms cubic-bezier(.22,1,.36,1), opacity 180ms ease; }
.pomodoro-dock.is-workspace-attached { transform:none; padding-block:0; border-width:0; background:transparent; box-shadow:none; backdrop-filter:none; transition:padding-left 240ms cubic-bezier(.22,1,.36,1),opacity 180ms ease; }
.dock-controls { inset: 3rem 4.5rem auto auto; margin: 0; width: 11rem; opacity: 0; transform: translateY(-4px); transition: opacity 140ms ease, transform 160ms cubic-bezier(.22,1,.36,1), display 160ms allow-discrete, overlay 160ms allow-discrete; }
.dock-controls:popover-open { opacity: 1; transform: translateY(0); }
@media (min-width:640px) { .dock-controls { inset:3rem auto auto 1.25rem; } }
@starting-style { .dock-controls:popover-open { opacity: 0; transform: translateY(-4px); } }
.dock-control { display: flex; width: 100%; align-items: center; gap: .5rem; padding: .6rem .65rem; border-radius: .65rem; font-size: .75rem; transition: background-color 150ms, color 150ms; }
.dock-control:hover { background: hsl(var(--muted) / .6); }
.teleportLift-enter-active, .teleportLift-leave-active { transition: opacity 180ms ease, transform 220ms cubic-bezier(.22,1,.36,1); }
.teleportLift-enter-from[data-teleport='compact'], .teleportLift-leave-to[data-teleport='compact'] { opacity: 0; transform: translateY(-8px) scale(.98); }
.teleportLift-enter-from[data-teleport='expanded'], .teleportLift-leave-to[data-teleport='expanded'] { opacity: 0; transform: translateY(-100%); }
button:focus-visible { outline: 2px solid hsl(var(--primary) / .45); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .pomodoro-dock, .dock-controls, .teleportLift-enter-active, .teleportLift-leave-active, .customPanel-enter-active, .customPanel-leave-active { transition: none !important; }
  .teleportLift-enter-from[data-teleport='compact'], .teleportLift-leave-to[data-teleport='compact'] { transform: none; }
}
.pomodoro-dialog { overflow: hidden; }
.pomodoro-dialog::backdrop { background: rgb(2 6 23 / 0.5); backdrop-filter: blur(8px); }
.preset-radio { width: 1.1rem; height: 1.1rem; border-radius: 9999px; border: 1.5px solid hsl(var(--border)); background: hsl(var(--card)); position: relative; flex-shrink: 0; transition: border-color 160ms ease, box-shadow 160ms ease; }
.preset-radio::after { content: ''; position: absolute; inset: 3px; border-radius: inherit; background: hsl(var(--primary)); transform: scale(0); opacity: 0; transition: transform 160ms ease, opacity 160ms ease; }
.preset-radio[data-selected='true'] { border-color: hsl(var(--primary)); box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1); }
.preset-radio[data-selected='true']::after { transform: scale(1); opacity: 1; }

.modern-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 9999px;
  background: hsl(var(--muted));
  outline: none;
  cursor: pointer;
  background: linear-gradient(
    to right, 
    hsl(var(--primary)) 0%, 
    hsl(var(--primary)) var(--range-progress, 0%), 
    hsl(var(--muted)) var(--range-progress, 0%), 
    hsl(var(--muted)) 100%
  );
}
.modern-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: hsl(var(--card));
  border: 2px solid hsl(var(--primary));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s;
}
.modern-range::-webkit-slider-thumb:hover { transform: scale(1.1); }
.modern-range::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: hsl(var(--card));
  border: 2px solid hsl(var(--primary));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.customPanel-enter-active, .customPanel-leave-active { transition: opacity 150ms ease, transform 150ms ease; }
.customPanel-enter-from, .customPanel-leave-to { opacity: 0; transform: translateY(-5px); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
