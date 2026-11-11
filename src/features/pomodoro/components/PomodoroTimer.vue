<template>
  <transition name="teleportLift">
    <div v-if="!isExpanded" key="compact" data-teleport="compact" class="pomodoro-card bg-card/50 backdrop-blur-xl text-card-foreground p-4 rounded-3xl shadow-[0_6px_24px_rgb(0,0,0,0.025)] border border-border/50 relative max-w-sm mx-auto w-full transition-all duration-300 group/pomodoro flex flex-col items-center">
      <div class="pomodoro-card-header w-full flex items-center justify-center mb-4">
        <div role="group" :aria-label="$t('pomodoro.modeSelect')" class="compact-mode-tabs flex min-w-0 gap-0.5 p-1 bg-muted/40 rounded-full items-center justify-center">
          <button v-for="mode in modes" :key="mode.key" type="button" @click="setMode(mode)" :aria-pressed="currentMode.key===mode.key" class="min-w-0 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap rounded-full transition-all duration-300 tabular-nums">{{ mode.name }}</button>
        </div>
      </div>
      <button type="button" class="timer-options-trigger timer-card-options" :aria-label="$t('pomodoro.controls')" :title="$t('pomodoro.controls')" aria-haspopup="menu" aria-controls="pomodoro-options" :aria-expanded="menuOpen" @click="toggleOptions" @keydown.down.prevent="toggleOptions"><MoreHorizontal :size="18" :stroke-width="1.7" /></button>
      <div class="pomodoro-card-body flex flex-col items-center justify-center py-2 w-full mb-4">
        <button v-if="currentTarget" type="button" class="mb-2 max-w-full truncate px-2 text-xs text-muted-foreground hover:text-foreground" :title="currentTarget.title" @click="emit('focus-task',currentTarget.workspace_id)">{{ currentTarget.title || t('pomoNotes.unavailableTask') }}</button>
        <div class="pomodoro-card-time text-foreground select-none" role="timer" aria-live="off" :aria-label="formattedTime"><span>{{ clockParts[0] }}</span><span class="pomodoro-card-colon">:</span><span>{{ clockParts[1] }}</span></div>
      </div>
      <div class="pomodoro-card-actions flex justify-center gap-2 w-full">
        <button type="button" @click="toggleTimer" :disabled="starting||timer.clearing" class="flex-1 py-2.5 rounded-xl font-semibold transition-all duration-300 shadow-sm flex items-center justify-center gap-2 text-xs" :class="isRunning?'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 ring-1 ring-amber-500/30':'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md'">{{ remote?$t('pomoNotes.continueHere'):isRunning?$t('pomodoro.pause'):$t('pomodoro.start') }}</button>
        <button type="button" @click="resetTimer" :disabled="!canReset" class="flex-1 py-2.5 rounded-xl border border-input bg-background/50 text-foreground hover:bg-muted transition-all duration-300 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed">{{ $t('pomodoro.reset') }}</button>
      </div>
      <p v-if="timer.error&&timer.error!=='REMOTE_ACTIVE'" class="mt-2 text-center text-xs text-muted-foreground" role="status">{{ t(timer.errorMessageKey) }}</p>
    </div>
    <div v-else key="expanded" data-teleport="expanded" data-pomodoro-navigation :inert="!navbarVisible" :style="{top:attached?`${(headerOffset??workspaceHeaderHeight)-workspaceHeaderHeight}px`:'14px',height:`${workspaceHeaderHeight}px`}" class="pomodoro-dock fixed z-40" :class="[navbarVisible?'translate-y-0 opacity-100':'-translate-y-full opacity-0 pointer-events-none',{'is-workspace-attached':attached}]">
      <div class="dock-layout">
        <div class="dock-balance" aria-hidden="true"></div>
        <div class="dock-session-controls" data-pomodoro-controls>
          <Timer class="dock-timer-icon" :size="17" :stroke-width="1.6" />
          <div class="dock-clock"><span class="dock-time" role="timer" aria-live="off" :aria-label="formattedTime">{{ formattedTime }}</span><button v-if="currentTarget" type="button" class="dock-target" :title="currentTarget.title" @click="emit('focus-task',currentTarget.workspace_id)">{{ currentTarget.title||t('pomoNotes.unavailableTask') }}</button></div>
          <div class="dock-modes" data-pomodoro-modes role="group" :aria-label="$t('pomodoro.modeSelect')"><button v-for="mode in modes" :key="mode.key" type="button" :aria-pressed="currentMode.key===mode.key" @click="setMode(mode)">{{ mode.name }}</button></div>
          <div class="dock-action-group">
            <button type="button" class="dock-toggle" :class="{'is-running':isRunning}" :disabled="starting||timer.clearing" :aria-label="remote?$t('pomoNotes.continueHere'):isRunning?$t('pomodoro.pause'):$t('pomodoro.start')" @click="toggleTimer"><Pause v-if="isRunning&&!remote" :size="14" /><Play v-else :size="14" /><span>{{ remote?$t('pomoNotes.continueHere'):isRunning?$t('pomodoro.pause'):$t('pomodoro.start') }}</span></button>
            <button type="button" class="dock-reset" :disabled="!canReset" :title="$t('pomodoro.reset')" :aria-label="$t('pomodoro.reset')" @click="resetTimer"><RotateCcw :size="15" :stroke-width="1.6" /></button>
            <button type="button" class="timer-options-trigger" :aria-label="$t('pomodoro.controls')" :title="$t('pomodoro.controls')" aria-haspopup="menu" aria-controls="pomodoro-options" :aria-expanded="menuOpen" @click="toggleOptions" @keydown.down.prevent="toggleOptions"><MoreHorizontal :size="18" :stroke-width="1.7" /></button>
          </div>
      <div class="dock-progress absolute bottom-0 left-3 right-3 h-px bg-transparent overflow-hidden"><div class="h-full transition-all duration-1000 ease-linear" :class="isRunning?'bg-primary':'bg-muted-foreground/30'" :style="{width:`${progressPercentage}%`}"></div></div>
        </div>
        <div class="dock-profile"><slot name="profile" /></div>
      </div>
    </div>
  </transition>

  <div ref="optionsMenu" id="pomodoro-options" popover="auto" role="menu" :aria-label="$t('pomodoro.controls')" class="timer-options-menu" tabindex="-1" :style="menuPosition" @toggle="handleMenuToggle" @keydown="menuKeydown">
    <div v-if="isExpanded" class="timer-menu-modes" role="group" :aria-label="$t('pomodoro.modeSelect')"><button v-for="mode in modes" :key="mode.key" type="button" role="menuitemradio" :aria-checked="currentMode.key===mode.key" @click="setMode(mode);closeOptions()"><Timer :size="15" /><span>{{ mode.name }}</span><Check v-if="currentMode.key===mode.key" :size="13" /></button><div class="timer-menu-divider" role="separator"></div></div>
    <button type="button" role="menuitem" :aria-label="$t(isExpanded?'pomodoro.collapse':'pomodoro.expandToNavbar')" @click="setExpanded(!isExpanded)"><ArrowDown v-if="isExpanded" :size="15" /><ArrowUp v-else :size="15" /><span>{{ $t(isExpanded?'pomodoro.collapse':'pomodoro.expandToNavbar') }}</span></button>
    <button type="button" role="menuitem" @click="openFocus"><PomodoroViewIcon class="h-3.5 w-3.5" /><span>{{ $t('pomodoro.fullscreen') }}</span></button>
    <div class="timer-menu-divider" role="separator"></div>
    <button type="button" role="menuitem" :disabled="starting||timer.clearing" @click="openCustomizeDialog"><Timer :size="15" /><span>{{ $t('pomodoro.durationSettings') }}</span></button>
    <button v-if="currentTarget" type="button" role="menuitem" :disabled="starting||timer.clearing" @click="openTargetSettings"><Link2 :size="15" /><span>{{ $t('pomodoro.linkedSessionSettings') }}</span></button>
    <button type="button" role="menuitem" @click="openEnvironment"><SlidersHorizontal :size="15" /><span>{{ $t('pomodoro.environmentSettings') }}</span></button>
    <button v-if="musicStarted" type="button" role="menuitemcheckbox" class="timer-music-button" :aria-checked="musicPlaying" :aria-label="musicLabel" @click="toggleMusic"><Pause v-if="musicPlaying" :size="15" /><Music2 v-else :size="15" /><span>{{ musicLabel }}</span></button>
  </div>

  <PlanFocusSettings />
  <PomodoroFocus ref="focusView" :time="formattedTime" :mode="currentMode.name" :next-label="nextModeLabel" :durations="timer.durations" :target-duration="Boolean(currentTarget)" :target-title="timer.modeKey === 'focus' ? currentTarget?.title : undefined" :running="isRunning" :remote="remote" :progress="progressPercentage" :busy="starting || timer.clearing" :can-reset="canReset" :error="timer.error && timer.error !== 'REMOTE_ACTIVE' ? t(timer.errorMessageKey) : undefined" @toggle="toggleTimer" @reset="resetTimer" @next="advanceMode" @configure="configureFocusDurations" @target-settings="openTargetSettings" />

  <dialog
    ref="customizeDialog"
    @dblclick="event=>{if(isDialogBackdropDoubleClick(event))customizeDialog?.close()}"
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
          :disabled="starting || timer.clearing"
          class="px-5 py-2 rounded-full bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-sm"
        >
          {{ $t('pomodoro.apply') }}
        </button>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { isDialogBackdropDoubleClick } from '@/lib/utils'
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ArrowDown, ArrowUp, Check, MoreHorizontal, Music2, Pause, Play, Timer, X, RotateCcw, Link2, SlidersHorizontal } from 'lucide-vue-next'
import PomodoroFocus from './PomodoroFocus.vue'
import PlanFocusSettings from './PlanFocusSettings.vue'
import PomodoroViewIcon from './PomodoroViewIcon.vue'
import { focusDurationPresets } from '../lib/focusEnvironment'
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
const nextModeLabel=computed(()=>t('pomodoro.nextSession',{mode:t(`pomodoro.${timer.nextMode}`)}))
const isExpanded = ref(props.docked)
const optionsMenu=ref<HTMLElement>(),menuOpen=ref(false),menuPosition=ref({left:'0px',top:'0px'})
let optionsTrigger:HTMLButtonElement|undefined,trackingOptions=false
function stopOptionsTracking(){if(!trackingOptions)return;trackingOptions=false;window.removeEventListener('resize',closeOptions);window.removeEventListener('scroll',handleOptionsScroll,true)}
function closeOptions(){optionsMenu.value?.hidePopover?.();menuOpen.value=false;stopOptionsTracking()}
function positionOptions(){
  if(!optionsTrigger||!optionsMenu.value)return
  const rect=optionsTrigger.getBoundingClientRect(),width=240,height=optionsMenu.value.offsetHeight||300
  menuPosition.value={left:Math.max(8,Math.min(window.innerWidth-width-8,rect.right-width))+'px',top:Math.max(8,Math.min(window.innerHeight-height-8,rect.bottom+8))+'px'}
  Object.assign(optionsMenu.value.style,menuPosition.value)
}
function visibleMenuItems(){return Array.from(optionsMenu.value?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')||[]).filter(item=>item.getClientRects().length)}
async function toggleOptions(event:MouseEvent|KeyboardEvent){
  if(menuOpen.value){closeOptions();return}
  optionsTrigger=event.currentTarget as HTMLButtonElement
  positionOptions();optionsMenu.value?.showPopover?.();positionOptions();menuOpen.value=true;trackingOptions=true;window.addEventListener('resize',closeOptions);window.addEventListener('scroll',handleOptionsScroll,true)
  await nextTick();positionOptions();(visibleMenuItems()[0]||optionsMenu.value)?.focus({preventScroll:true})
}
function handleMenuToggle(event:Event){menuOpen.value=(event as ToggleEvent).newState==='open';if(!menuOpen.value)stopOptionsTracking()}
function menuKeydown(event:KeyboardEvent){
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeOptions();optionsTrigger?.focus();return}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return
  const items=visibleMenuItems()
  if(!items.length)return
  event.preventDefault()
  const index=items.indexOf(document.activeElement as HTMLButtonElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length
  items[next]?.focus()
}
function handleOptionsScroll(event:Event){if(menuOpen.value&&!(event.target instanceof Node&&optionsMenu.value?.contains(event.target)))closeOptions()}

const customizeDialog = ref<HTMLDialogElement|null>(null)
const focusView=ref<InstanceType<typeof PomodoroFocus>>()
const clockParts=computed(()=>formattedTime.value.split(':'))
const musicStarted=computed(()=>Boolean(focusView.value?.musicStarted))
const musicPlaying=computed(()=>focusView.value?.soundStatus==='playing'||focusView.value?.soundStatus==='loading')
const musicLabel=computed(()=>t(musicPlaying.value?'pomodoro.pauseMusic':'pomodoro.playMusic'))
function toggleMusic(){focusView.value?.toggleMusic();closeOptions()}
function openFocus(){closeOptions();void focusView.value?.open()}
function openEnvironment(){closeOptions();void focusView.value?.openSettings()}
function openTargetSettings(){closeOptions();timer.openPlanSettings()}
watch(()=>props.navbarVisible,visible=>{if(!visible)closeOptions()})
watch(()=>props.docked,value=>{closeOptions();isExpanded.value=value})
function setExpanded(value:boolean) { closeOptions();isExpanded.value=value;if(value)emit('expand');else emit('collapse') }
const timerPresets=focusDurationPresets
const customDurations = ref<TimerDurations>({...timer.durations})
const draftCustomDurations = ref<TimerDurations>({...customDurations.value})
const draftPreset = ref<TimerPresetId>('popular')
const findPresetId=(value:TimerDurations):TimerPresetId=>timerPresets.find(preset=>preset.focus===value.focus&&preset.shortBreak===value.shortBreak&&preset.longBreak===value.longBreak)?.id||'custom'
const formatDurationTriplet=(value:TimerDurations)=>`${value.focus}m / ${value.shortBreak}m / ${value.longBreak}m`
const customPreviewDurations=computed(()=>draftPreset.value==='custom'?normalizeDurations(draftCustomDurations.value):customDurations.value)
const presetCards=computed(()=>[...timerPresets.map(preset=>({id:preset.id as TimerPresetId,name:t(`pomodoro.presets.${preset.id}`),summary:formatDurationTriplet(preset)})),
  {id:'custom' as TimerPresetId,name:t('pomodoro.custom'),summary:formatDurationTriplet(customPreviewDurations.value)}])
const openCustomizeDialog=()=>{closeOptions();draftPreset.value=findPresetId(timer.durations);draftCustomDurations.value={...timer.durations};customizeDialog.value?.showModal()}
const selectDraftPreset=(id:TimerPresetId)=>{draftPreset.value=id;draftCustomDurations.value={...(timerPresets.find(preset=>preset.id===id)||customDurations.value)}}
const configureFocusDurations=(value:TimerDurations)=>{if(!starting.value&&!timer.clearing)timer.configure(value)}
const saveTimerConfiguration=()=>{if(starting.value||timer.clearing)return;const value=normalizeDurations(draftCustomDurations.value);if(draftPreset.value==='custom')customDurations.value=value;configureFocusDurations(value);customizeDialog.value?.close()}
const setMode=async(mode:TimerMode)=>{await timer.setMode(mode.key);notifyFailure()}
const notifyFailure=()=>{if(timer.error&&timer.error!=='REMOTE_ACTIVE')ui.addToast(t(timer.errorMessageKey),'error')}
const toggleTimer=async()=>{await timer.toggleTimer();notifyFailure()}
const resetTimer=async()=>{await timer.resetTimer();notifyFailure()}
const advanceMode=async()=>{await timer.advanceMode();notifyFailure()}
watch(()=>timer.completionSequence,()=>{
  if(typeof Audio!=='undefined'){const audio=new Audio('/notification.mp3');void audio.play().catch(()=>{})}
  if('Notification' in window&&Notification.permission==='granted'){
    try{new Notification(t('pomodoro.timerComplete'),{body:t('pomodoro.sessionCompleted',{mode:t(`pomodoro.${timer.lastCompletedMode}`)})})}catch{}
  }
})
onMounted(()=>timer.init())
onUnmounted(()=>{closeOptions();timer.shutdown()})
</script>

<style scoped>
.pomodoro-card-header{padding-inline:24px}
.compact-mode-tabs{max-width:100%}
.pomodoro-card-time{display:inline-flex;align-items:baseline;max-width:100%;border-radius:12px;font-family:'Segoe UI Variable Display','SF Pro Display','Helvetica Neue',sans-serif;font-size:64px;font-weight:300;line-height:1.05;letter-spacing:-.055em;font-variant-numeric:tabular-nums;white-space:nowrap}
.pomodoro-card-colon{color:inherit;letter-spacing:0;transform:translateY(-.08em)}
.timer-options-trigger{display:inline-flex;flex-shrink:0;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9px;color:hsl(var(--muted-foreground));opacity:0;pointer-events:none;transform:translateY(-2px);transition:opacity 180ms,transform 180ms,background 160ms,color 160ms}
.timer-card-options{position:absolute;top:14px;right:10px}
.pomodoro-card:hover .timer-options-trigger,.pomodoro-card:focus-within .timer-options-trigger,.dock-session-controls .timer-options-trigger,.timer-options-trigger[aria-expanded=true],.timer-options-trigger:focus-visible{opacity:1;pointer-events:auto;transform:none}
.timer-options-trigger:hover{background:hsl(var(--muted)/.65);color:hsl(var(--foreground))}
@media(hover:none){.timer-options-trigger{opacity:1;pointer-events:auto;transform:none}}
@media(max-width:400px){.compact-mode-tabs button{padding-inline:5px;font-size:10px}}
.pomodoro-dock{left:76px;right:12px;pointer-events:none;transition:transform 240ms cubic-bezier(.22,1,.36,1),opacity 180ms ease}
.dock-layout{display:grid;grid-template-columns:minmax(48px,1fr) auto minmax(48px,1fr);height:100%;align-items:center;gap:10px;padding:0 12px}
.dock-session-controls{position:relative;display:flex;align-items:center;justify-content:center;min-width:0;height:100%;gap:12px;padding:0 16px;overflow:hidden;pointer-events:auto;border:1px solid hsl(var(--border)/.6);border-radius:18px;background:hsl(var(--card)/.9);backdrop-filter:blur(24px);box-shadow:0 6px 24px rgb(0 0 0/.04)}
.dock-timer-icon{flex-shrink:0;color:hsl(var(--muted-foreground))}
.dock-clock{display:flex;flex-direction:column;align-items:flex-start;min-width:66px;max-width:136px}
.dock-time{font-size:21px;font-weight:500;font-variant-numeric:tabular-nums;letter-spacing:-.035em;line-height:1.15;color:hsl(var(--foreground))}
.dock-target{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;margin-top:2px;font-size:9px;line-height:1.2;text-align:left;color:hsl(var(--muted-foreground))}
.dock-target:hover{color:hsl(var(--foreground))}
.dock-modes{display:flex;align-items:center;gap:2px;padding:3px;border:1px solid hsl(var(--border)/.4);border-radius:999px;background:hsl(var(--muted)/.3)}
.dock-modes button{padding:5px 10px;border-radius:999px;white-space:nowrap;font-size:10px;color:hsl(var(--muted-foreground));transition:background 160ms,color 160ms}
.compact-mode-tabs button,.dock-modes button{color:hsl(var(--muted-foreground));font-weight:500;transition:background 160ms,color 160ms,box-shadow 160ms}
.compact-mode-tabs button:hover:not([aria-pressed=true]),.dock-modes button:hover:not([aria-pressed=true]){background:hsl(var(--primary)/.055);color:hsl(var(--foreground))}
.compact-mode-tabs button[aria-pressed=true],.dock-modes button[aria-pressed=true]{background:hsl(var(--primary)/.12);color:hsl(var(--foreground));font-weight:600;box-shadow:inset 0 0 0 .5px hsl(var(--primary)/.16),0 1px 2px rgb(0 0 0/.025)}
.dock-action-group{display:flex;align-items:center;gap:4px;padding-left:10px;border-left:1px solid hsl(var(--border)/.5)}
.dock-toggle{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:30px;padding:6px 13px;border-radius:999px;background:hsl(var(--primary));color:hsl(var(--primary-foreground));font-size:11px;font-weight:500;white-space:nowrap}
.dock-toggle.is-running{background:hsl(var(--primary)/.09);color:hsl(var(--foreground))}
.dock-reset{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9px;color:hsl(var(--muted-foreground))}.dock-reset:hover:not(:disabled){background:hsl(var(--muted)/.5);color:hsl(var(--foreground))}
.dock-profile{pointer-events:auto;display:flex;justify-content:flex-end;align-items:center;min-width:0}
.pomodoro-dock.is-workspace-attached{transform:none;transition:opacity 180ms ease}.dock-progress{opacity:.65}
@media(min-width:640px){.pomodoro-dock{right:24px;left:76px}}
@media(min-width:1024px){.pomodoro-dock{left:var(--workspace-sidebar-inset,24px)}}
@media(max-width:799px){.dock-modes{display:none}.dock-timer-icon{display:none}.dock-session-controls{gap:10px}.dock-clock{max-width:110px}}
@media(max-width:639px){.dock-layout{grid-template-columns:minmax(0,1fr) auto;gap:6px;padding-inline:8px}.dock-balance{display:none}.dock-session-controls{gap:6px;padding-inline:8px}.dock-action-group{gap:0;padding-left:4px}.dock-toggle{width:30px;padding:6px}.dock-toggle>span{display:none}.dock-clock{min-width:48px;max-width:100px}.dock-time{font-size:20px}}
.timer-options-menu{position:fixed;inset:auto;margin:0;width:240px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;padding:5px;border:1px solid hsl(var(--border)/.65);border-radius:14px;background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 12px 36px rgb(0 0 0/.1);opacity:0;transform:translateY(-4px);transition:opacity 140ms,transform 180ms cubic-bezier(.22,1,.36,1),display 180ms allow-discrete,overlay 180ms allow-discrete}
.timer-options-menu:popover-open{opacity:1;transform:none}
.timer-options-menu button{display:flex;width:100%;align-items:center;gap:10px;padding:10px;border-radius:9px;text-align:left;font-size:12px;color:hsl(var(--muted-foreground));transition:background 150ms,color 150ms}
.timer-options-menu button>svg{flex-shrink:0}.timer-options-menu button>span{flex:1}
.timer-options-menu button:hover:not(:disabled),.timer-options-menu button:focus-visible{background:hsl(var(--primary)/.06);color:hsl(var(--foreground));outline:none}
.timer-menu-divider{height:1px;margin:4px 7px;background:hsl(var(--border)/.45)}
@media(min-width:800px){.timer-menu-modes{display:none}}
@starting-style{.timer-options-menu:popover-open{opacity:0;transform:translateY(-4px)}}
.teleportLift-enter-active, .teleportLift-leave-active { transition: opacity 180ms ease, transform 220ms cubic-bezier(.22,1,.36,1); }
.teleportLift-enter-from[data-teleport='compact'], .teleportLift-leave-to[data-teleport='compact'] { opacity: 0; transform: translateY(-8px) scale(.98); }
.teleportLift-enter-from[data-teleport='expanded'], .teleportLift-leave-to[data-teleport='expanded'] { opacity: 0; transform: translateY(-100%); }
button:focus-visible { outline: 2px solid hsl(var(--primary) / .45); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .pomodoro-dock, .timer-options-menu, .timer-options-trigger, .teleportLift-enter-active, .teleportLift-leave-active, .customPanel-enter-active, .customPanel-leave-active { transition: none !important; }
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
