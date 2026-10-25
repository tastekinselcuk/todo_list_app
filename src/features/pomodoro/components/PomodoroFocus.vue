<template>
  <Teleport to="body" v-if="isOpen">
    <section ref="screen" class="pomodoro-focus" :class="{'has-background':Boolean(renderedBackground)}" :data-counter="counterStyle" :data-running="running && !remote" role="dialog" aria-modal="true" :aria-label="t('pomodoro.focusView')" tabindex="-1" @pointerdown="dismissAppearance">
      <Transition name="focus-backdrop"><img v-if="renderedBackground" :key="renderedBackground.id" class="focus-scene" :src="renderedBackground.src" alt="" aria-hidden="true" /></Transition>
      <div v-if="renderedBackground" class="focus-scene-scrim" aria-hidden="true"></div>
      <button ref="appearanceButton" type="button" class="focus-appearance focus-icon" data-focus-control :aria-label="t('pomodoro.appearance')" :title="t('pomodoro.appearance')" :aria-expanded="appearanceOpen" aria-controls="pomodoro-focus-appearance" @click="appearanceOpen=!appearanceOpen"><SlidersHorizontal :size="18" :stroke-width="1.5" /></button>
      <button type="button" class="focus-exit focus-icon" data-focus-control :aria-label="t('pomodoro.exitFullscreen')" :title="t('pomodoro.exitFullscreen')" @click="close">
        <PomodoroViewIcon inward class="focus-view-symbol" />
      </button>
      <Transition name="focus-options">
        <div v-if="appearanceOpen" id="pomodoro-focus-appearance" ref="appearancePanel" class="focus-appearance-panel" role="group" :aria-label="t('pomodoro.appearance')">
          <div class="focus-settings-title">{{ t('pomodoro.focusSettings') }}</div>
          <div class="focus-settings-tabs" role="group" :aria-label="t('pomodoro.focusSettings')"><button v-for="tab in ['appearance','sound','duration'] as const" :key="tab" type="button" data-focus-control :data-settings-tab="tab" :aria-pressed="settingsTab===tab" @click="settingsTab=tab">{{ t('pomodoro.settingsTabs.'+tab) }}</button></div>
          <div v-if="settingsTab==='appearance'">
          <div class="focus-option-heading">{{ t('pomodoro.background') }}</div>
          <div class="focus-backgrounds" role="group" :aria-label="t('pomodoro.background')">
            <button v-for="scene in focusBackgrounds" :key="scene.id" type="button" class="focus-background-choice" :class="{'is-plain':scene.id==='none'}" :data-background="scene.id" data-focus-control :aria-pressed="background===scene.id" @click="chooseBackground(scene.id)"><img v-if="scene.thumbnail" :src="scene.thumbnail" alt="" loading="lazy" decoding="async" /><span>{{ t('pomodoro.backgrounds.'+scene.id) }}</span><Check v-if="background===scene.id" :size="12" aria-hidden="true" /></button>
          </div>
          <p v-if="backgroundLoading||backgroundError" class="focus-setting-hint" role="status">{{ t(backgroundError?'pomodoro.backgroundFailed':'pomodoro.backgroundLoading') }}</p>
          <p v-if="selectedBackground.source" class="focus-media-credit"><a :href="selectedBackground.source" data-focus-control target="_blank" rel="noopener noreferrer">{{ selectedBackground.author }} · Unsplash</a></p>
          <div class="focus-counter-row">
            <div class="focus-option-heading">{{ t('pomodoro.counterStyle') }}</div>
            <div class="focus-counter-styles" role="group" :aria-label="t('pomodoro.counterStyle')"><button v-for="counter in counters" :key="counter" type="button" data-focus-control :aria-pressed="counterStyle===counter" @click="chooseCounter(counter)"><Hash v-if="counter==='digital'" :size="14" /><Circle v-else :size="14" />{{ t('pomodoro.counters.'+counter) }}</button></div>
          </div>
          </div>
          <div v-else-if="settingsTab==='sound'">
            <div class="focus-option-heading">{{ t('pomodoro.backgroundMusic') }}</div>
            <div class="focus-tracks" role="group" :aria-label="t('pomodoro.backgroundMusic')">
              <div v-for="song in focusTracks" :key="song.id" class="focus-track" :class="{'is-selected':track===song.id}">
                <button type="button" class="focus-track-choice" :data-track="song.id" data-focus-control :aria-pressed="track===song.id" @click="chooseTrack(song.id)"><CloudRain v-if="song.id==='rain'" :size="15" /><Flame v-else-if="song.id==='fireplace'" :size="15" /><Music2 v-else :size="15" /><span><strong>{{ t('pomodoro.tracks.'+song.id) }}</strong><small>{{ song.title }}</small></span><Check v-if="track===song.id" :size="13" class="track-check" /><small v-else class="track-duration">{{ formatAudioTime(song.duration) }}</small></button>
                <div v-if="track===song.id" class="focus-track-timeline">
                  <input class="focus-seek" type="range" min="0" :max="audioDuration" step="1" :value="audioTime" :style="{'--seek-progress':(audioDuration ? audioTime/audioDuration*100 : 0)+'%'}" data-focus-control :aria-label="t('pomodoro.seekAudio')" :aria-valuetext="t('pomodoro.audioPosition',{current:formatAudioTime(audioTime),duration:formatAudioTime(audioDuration)})" @pointerdown="beginSeeking" @input="seekAudio(Number(($event.target as HTMLInputElement).value))" @change="endSeeking" @pointerup="endSeeking" @pointercancel="endSeeking" @blur="endSeeking" />
                  <div class="focus-audio-times" aria-hidden="true"><span>{{ formatAudioTime(audioTime) }}</span><span>{{ formatAudioTime(audioDuration) }}</span></div>
                </div>
              </div>
            </div>
            <button type="button" class="focus-music-toggle" data-focus-control :aria-pressed="soundStatus==='playing'||soundStatus==='loading'" @click="toggleMusic"><Pause v-if="soundStatus==='playing'||soundStatus==='loading'" :size="14" /><Play v-else :size="14" />{{ t(soundStatus==='loading'?'pomodoro.musicLoading':soundStatus==='playing'?'pomodoro.pauseMusic':'pomodoro.playMusic') }}</button>
            <label class="focus-volume"><span><Volume2 v-if="volume>0" :size="14" /><VolumeX v-else :size="14" />{{ t('pomodoro.volume') }}</span><input type="range" min="0" max="100" step="1" :value="Math.round(volume*100)" data-focus-control :aria-label="t('pomodoro.volume')" @input="changeVolume(Number(($event.target as HTMLInputElement).value)/100)" /><output>{{ Math.round(volume*100) }}%</output></label>
            <p v-if="soundStatus==='error'" class="focus-setting-hint" role="status">{{ t('pomodoro.musicFailed') }}</p>
            <div class="focus-media-credit"><a :href="selectedTrack.source" data-focus-control target="_blank" rel="noopener noreferrer">{{ selectedTrack.title }} — {{ selectedTrack.author }}</a><a :href="selectedTrack.licenseUrl" data-focus-control target="_blank" rel="noopener noreferrer">{{ selectedTrack.license }}</a><span>{{ t('pomodoro.audioAdapted') }}</span></div>
          </div>
          <div v-else class="focus-duration-settings">
            <div class="focus-duration-presets" role="group" :aria-label="t('pomodoro.timerPresets')"><button v-for="preset in focusDurationPresets" :key="preset.id" type="button" data-focus-control :data-duration-preset="preset.id" :aria-pressed="focusDurationFields.every(field=>durationDraft[field.key]===preset[field.key])" @click="chooseDurationPreset(preset)"><strong>{{ t('pomodoro.presets.'+preset.id) }}</strong><span>{{ preset.focus }} / {{ preset.shortBreak }} / {{ preset.longBreak }} {{ t('pomodoro.minutesShort') }}</span></button></div>
            <div class="focus-duration-fields"><label v-for="field in focusDurationFields" :key="field.key"><span>{{ t('pomodoro.'+field.key) }}</span><span class="focus-duration-input"><input type="number" inputmode="numeric" :min="field.min" :max="field.max" step="1" :value="Number.isFinite(durationDraft[field.key])?durationDraft[field.key]:''" data-focus-control :data-duration-field="field.key" :aria-label="t('pomodoro.'+field.key)" :aria-invalid="durationInvalid?.key===field.key" :aria-describedby="durationInvalid?.key===field.key?'focus-duration-error':undefined" @input="changeDuration(field.key,($event.target as HTMLInputElement).valueAsNumber)" /><span aria-hidden="true">{{ t('pomodoro.minutesShort') }}</span></span></label></div>
            <p v-if="durationInvalid" id="focus-duration-error" class="focus-setting-hint focus-duration-error" role="alert">{{ t('pomodoro.durationRange',{mode:t('pomodoro.'+durationInvalid.key),min:durationInvalid.min,max:durationInvalid.max}) }}</p>
            <p class="focus-setting-hint">{{ t(targetDuration?'pomodoro.targetDurationHint':running||canReset||remote?'pomodoro.durationRunningHint':'pomodoro.durationHint') }}</p>
            <button type="button" class="focus-duration-apply" data-focus-control :disabled="busy || Boolean(durationInvalid) || !durationChanged" @click="applyDurations"><Check v-if="durationApplied" :size="13" />{{ t(durationApplied?'pomodoro.durationApplied':'pomodoro.apply') }}</button>
          </div>
        </div>
      </Transition>
      <div class="focus-content">
        <p class="focus-mode" :class="{'has-target':Boolean(targetLabel)}" :title="targetLabel ? targetTitle : undefined"><span class="focus-status-dot" aria-hidden="true"></span><span class="focus-mode-label">{{ targetLabel || mode }}</span></p>
        <div class="focus-dial">
          <svg v-if="counterStyle==='ring'" class="focus-ring" viewBox="0 0 200 200" fill="none" aria-hidden="true"><circle class="focus-ring-track" cx="100" cy="100" r="94" /><circle class="focus-ring-progress" cx="100" cy="100" r="94" pathLength="100" stroke-dasharray="100" :stroke-dashoffset="-elapsed" /></svg>
          <div class="focus-time" role="timer" aria-live="off" aria-atomic="true" :aria-label="time"><span class="focus-time-pair">{{ clockParts[0] }}</span><span class="focus-colon">:</span><span class="focus-time-pair">{{ clockParts[1] }}</span></div>
        </div>
        <div class="focus-actions">
          <button ref="toggle" type="button" class="focus-toggle" data-focus-control :disabled="busy" @click="emit('toggle')">
            <Pause v-if="running && !remote" :size="17" :stroke-width="1.7" /><Play v-else :size="17" :stroke-width="1.7" />
            <span>{{ remote ? t('pomoNotes.continueHere') : running ? t('pomodoro.pause') : t('pomodoro.start') }}</span>
          </button>
          <button type="button" class="focus-icon focus-reset" data-focus-control :disabled="!canReset || busy" :aria-label="t('pomodoro.reset')" :title="t('pomodoro.reset')" @click="emit('reset')"><RotateCcw :size="18" :stroke-width="1.5" /></button>
          <button type="button" class="focus-icon focus-next" data-focus-control :disabled="busy || remote" :aria-label="nextLabel" :title="nextLabel" @click="emit('next')"><ChevronsRight :size="20" :stroke-width="1.7" /></button>
        </div>
        <p v-if="error" class="focus-error" role="status">{{ error }}</p>
      </div>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, ChevronsRight, Circle, CloudRain, Flame, Hash, Music2, Pause, Play, RotateCcw, SlidersHorizontal, Volume2, VolumeX } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { readStoredJSON, writeStoredJSON } from '@/lib/storage'
import PomodoroViewIcon from './PomodoroViewIcon.vue'
import { focusCounters,focusBackgrounds,focusTracks,focusDurationFields,focusDurationPresets,invalidFocusDuration,normalizeFocusAppearance,FocusSoundPlayer,type CounterStyle,type BackgroundId,type TrackId,type FocusSoundStatus,type FocusSoundPosition } from '../lib/focusEnvironment'
import type { ModeKey,TimerDurations } from '../stores/pomodoro'

const props=withDefaults(defineProps<{time:string;mode:string;nextLabel:string;durations:{focus:number;shortBreak:number;longBreak:number};targetTitle?:string;targetDuration?:boolean;running:boolean;remote:boolean;busy:boolean;canReset:boolean;progress?:number;error?:string}>(),{progress:0})
const emit=defineEmits<{toggle:[];reset:[];next:[];configure:[durations:TimerDurations]}>(),{t}=useI18n()
const isOpen=ref(false),screen=ref<HTMLElement>(),toggle=ref<HTMLButtonElement>()
const appearanceOpen=ref(false),appearanceButton=ref<HTMLButtonElement>(),appearancePanel=ref<HTMLElement>()
const counters=focusCounters,settingsTab=ref<'appearance'|'sound'|'duration'>('appearance')
const durationDraft=ref<TimerDurations>({...props.durations}),durationEdited=ref(false),durationApplied=ref(false)
const durationInvalid=computed(()=>invalidFocusDuration(durationDraft.value))
const durationChanged=computed(()=>focusDurationFields.some(field=>durationDraft.value[field.key]!==props.durations[field.key]))
const appearanceKey='pomodoro-focus-appearance-v1'
const saved=normalizeFocusAppearance(readStoredJSON<unknown>(appearanceKey,null,()=>true))
const counterStyle=ref<CounterStyle>(saved.counter)
const background=ref<BackgroundId>(saved.background),track=ref<TrackId>(saved.track),volume=ref(saved.volume),soundStatus=ref<FocusSoundStatus>('idle')
const soundPosition=ref<FocusSoundPosition>({track:null,currentTime:0,duration:0}),seekDraft=ref<number|null>(null)
const player=new FocusSoundPlayer(status=>{soundStatus.value=status},()=>new Audio(),position=>{soundPosition.value=position})
const musicStarted=ref(false)
const selectedBackground=computed(()=>focusBackgrounds.find(scene=>scene.id===background.value)!),selectedTrack=computed(()=>focusTracks.find(song=>song.id===track.value)!)
const audioDuration=computed(()=>soundPosition.value.track===track.value?soundPosition.value.duration:selectedTrack.value.duration)
const audioTime=computed(()=>Math.min(audioDuration.value,seekDraft.value??(soundPosition.value.track===track.value?soundPosition.value.currentTime:0)))
const renderedBackground=ref<typeof focusBackgrounds[number]|null>(null),backgroundLoading=ref(false),backgroundError=ref(false),backgroundAttempt=ref(0)
const targetLabel=computed(()=>{const title=props.targetTitle?.replace(/\s+/g,' ').trim()||'',letters=Array.from(title);return letters.length>84?letters.slice(0,83).join('').trimEnd()+'…':title})
const clockParts=computed(()=>props.time.split(':')),elapsed=computed(()=>Number.isFinite(props.progress)?Math.min(100,Math.max(0,props.progress)):0)
let previous:HTMLElement|null=null,release:()=>void=()=>{},native=false,generation=0

function saveAppearance(){writeStoredJSON(appearanceKey,{counter:counterStyle.value,background:background.value,track:track.value,volume:volume.value})}
function chooseCounter(counter:CounterStyle){counterStyle.value=counter;saveAppearance()}
function chooseBackground(id:BackgroundId){background.value=id;backgroundAttempt.value++;saveAppearance()}
function chooseTrack(id:TrackId){if(id===track.value)return;const resume=soundStatus.value==='playing'||soundStatus.value==='loading';seekDraft.value=null;track.value=id;player.select(selectedTrack.value);saveAppearance();if(resume)void player.play(selectedTrack.value,volume.value)}
function toggleMusic(){if(soundStatus.value==='playing'||soundStatus.value==='loading')player.pause();else{musicStarted.value=true;void player.play(selectedTrack.value,volume.value)}}
function formatAudioTime(seconds:number){const value=Math.max(0,Math.floor(seconds));return Math.floor(value/60)+':'+String(value%60).padStart(2,'0')}
function beginSeeking(event:PointerEvent){seekDraft.value=audioTime.value;try{(event.currentTarget as HTMLInputElement).setPointerCapture(event.pointerId)}catch{}}
function seekAudio(seconds:number){if(seekDraft.value!==null)seekDraft.value=seconds;player.select(selectedTrack.value);player.seek(seconds)}
function endSeeking(){seekDraft.value=null}
function changeVolume(value:number){volume.value=Number.isFinite(value)?Math.min(1,Math.max(0,value)):.25;player.setVolume(volume.value);saveAppearance()}
function stopMusic(){player.pause()}
function chooseDurationPreset(preset:typeof focusDurationPresets[number]){durationDraft.value={focus:preset.focus,shortBreak:preset.shortBreak,longBreak:preset.longBreak};durationEdited.value=true;durationApplied.value=false}
function changeDuration(key:ModeKey,value:number){durationDraft.value[key]=value;durationEdited.value=true;durationApplied.value=false}
function applyDurations(){if(props.busy||durationInvalid.value||!durationChanged.value)return;emit('configure',{...durationDraft.value});durationEdited.value=false;durationApplied.value=true}
watch(()=>props.durations,value=>{if(!durationEdited.value)durationDraft.value={...value}},{deep:true})
watch(isOpen,opened=>{if(opened){durationDraft.value={...props.durations};durationEdited.value=false;durationApplied.value=false}})
watch([isOpen,background,backgroundAttempt],([opened],_,cleanup)=>{
 backgroundLoading.value=false;backgroundError.value=false
 if(!opened||!selectedBackground.value.src){renderedBackground.value=null;return}
 const scene=selectedBackground.value,image=new Image();let stale=false
 backgroundLoading.value=true;image.decoding='async'
 image.onload=()=>{if(!stale){renderedBackground.value=scene;backgroundLoading.value=false}}
 image.onerror=()=>{if(!stale){backgroundError.value=true;backgroundLoading.value=false}}
 image.src=scene.src
 cleanup(()=>{stale=true;image.onload=null;image.onerror=null;image.removeAttribute('src')})
})
function dismissAppearance(event:PointerEvent){if(appearanceOpen.value&&event.target instanceof Node&&!appearancePanel.value?.contains(event.target)&&!appearanceButton.value?.contains(event.target))appearanceOpen.value=false}
function trap(event:KeyboardEvent){
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(appearanceOpen.value){appearanceOpen.value=false;appearanceButton.value?.focus()}else close();return}
  if(event.key!=='Tab'||!screen.value)return
  const controls=[...screen.value.querySelectorAll<HTMLElement>('[data-focus-control]:not(:disabled)')].filter(control=>appearanceOpen.value||!control.closest('#pomodoro-focus-appearance'))
  const first=controls[0],last=controls[controls.length-1]
  if(!first){event.preventDefault();screen.value.focus();return}
  if(!controls.includes(document.activeElement as HTMLElement)){event.preventDefault();(event.shiftKey?last:first)?.focus();return}
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
}
function fullscreenChanged(){
  if(document.fullscreenElement===screen.value)native=true
  else if(native)close()
}
function restoreFocus(element:HTMLElement|null){if(element?.isConnected)element.focus({preventScroll:true})}
async function open(){
  if(isOpen.value)return
  const opening=++generation
  previous=document.activeElement instanceof HTMLElement?document.activeElement:null
  isOpen.value=true
  await nextTick()
  const element=screen.value
  if(!isOpen.value||opening!==generation||!element)return
  const bodyOverflow=document.body.style.overflow,rootOverflow=document.documentElement.style.overflow
  const siblings=[...document.body.children].filter((node):node is HTMLElement=>node instanceof HTMLElement&&node!==element&&!node.contains(element))
  const inert=siblings.map(node=>[node,node.getAttribute('inert')] as const)
  siblings.forEach(node=>node.setAttribute('inert',''))
  document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden'
  document.addEventListener('keydown',trap,true)
  document.addEventListener('fullscreenchange',fullscreenChanged)
  release=()=>{
    document.removeEventListener('keydown',trap,true);document.removeEventListener('fullscreenchange',fullscreenChanged)
    document.body.style.overflow=bodyOverflow;document.documentElement.style.overflow=rootOverflow
    inert.forEach(([node,value])=>{if(value===null)node.removeAttribute('inert');else node.setAttribute('inert',value)})
    release=()=>{}
  }
  toggle.value?.focus({preventScroll:true})
  // Keep the viewport view usable when fullscreen is unavailable or denied.
  if(!element.requestFullscreen||document.fullscreenElement)return
  try{
    await element.requestFullscreen({navigationUI:'hide'})
    if(opening!==generation){if(document.fullscreenElement===element)await document.exitFullscreen();return}
    native=document.fullscreenElement===element
  }catch{}
}
function close(){
  if(!isOpen.value)return
  generation++;isOpen.value=false;native=false;appearanceOpen.value=false;seekDraft.value=null
  const element=screen.value,origin=previous;previous=null
  release()
  if(element&&document.fullscreenElement===element){
    void document.exitFullscreen().catch(()=>{}).finally(()=>{if(!isOpen.value)restoreFocus(origin)})
  }else restoreFocus(origin)
}
onMounted(()=>window.addEventListener('pagehide',stopMusic))
onBeforeUnmount(()=>{close();player.dispose();window.removeEventListener('pagehide',stopMusic)})
defineExpose({open,close,toggleMusic,musicStarted,soundStatus})
</script>

<style scoped>
.pomodoro-focus{position:fixed;inset:0;z-index:100;display:grid;place-items:center;width:100%;height:100%;height:100dvh;max-width:none;max-height:none;margin:0;padding:24px;overflow:hidden;overscroll-behavior:none;background:hsl(var(--background));color:hsl(var(--foreground));isolation:isolate;animation:focus-in 320ms cubic-bezier(.22,1,.36,1);-webkit-font-smoothing:antialiased}
.pomodoro-focus::before{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(ellipse at 50% 43%,hsl(var(--primary)/.065),transparent 62%),linear-gradient(180deg,hsl(var(--card)/.3),transparent 70%)}
.focus-scene,.focus-scene-scrim{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.focus-scene{z-index:-3;object-fit:cover}.focus-scene-scrim{z-index:-2;background:radial-gradient(ellipse at center,rgb(5 12 18/.06),rgb(5 12 18/.18)),linear-gradient(rgb(5 12 18/.58),rgb(5 12 18/.66))}.has-background{background:#10201d}.has-background::before{opacity:0}.has-background .focus-content,.has-background>.focus-icon{--foreground:0 0% 100%;--muted-foreground:210 20% 88%;--primary:0 0% 100%;--primary-foreground:222 30% 12%;--border:210 30% 78%;--muted:210 30% 30%}.has-background .focus-time{text-shadow:0 3px 24px rgb(0 0 0/.14)}
.focus-backdrop-enter-active,.focus-backdrop-leave-active{transition:opacity 440ms ease}.focus-backdrop-enter-from,.focus-backdrop-leave-to{opacity:0}
.focus-content{display:flex;flex-direction:column;align-items:center;max-width:100%;transform:translateY(-2vh);animation:focus-content-in 420ms cubic-bezier(.22,1,.36,1)}
.focus-mode{display:flex;align-items:center;gap:9px;margin:0 0 clamp(20px,4vh,42px);padding:6px 11px;font-size:11px;font-weight:500;letter-spacing:.07em;color:hsl(var(--muted-foreground))}
.focus-mode.has-target{max-width:min(74vw,580px);font-size:14px;letter-spacing:0;font-weight:450;justify-content:center;color:hsl(var(--foreground)/.85)}.focus-mode-label{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:center}
.focus-status-dot{flex:0 0 5px;width:5px;height:5px;border-radius:50%;background:hsl(var(--muted-foreground)/.45)}[data-running='true'] .focus-status-dot{background:hsl(var(--primary));box-shadow:0 0 0 4px hsl(var(--primary)/.07)}
.focus-dial{position:relative;display:grid;place-items:center;max-width:100%}
.focus-time{display:flex;align-items:center;font-family:'Segoe UI Variable Display','SF Pro Display','Helvetica Neue',sans-serif;font-size:clamp(72px,min(22vw,30dvh),280px);font-weight:300;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum','lnum';font-synthesis:none;letter-spacing:-.055em;line-height:1;white-space:nowrap;user-select:none;text-rendering:optimizeLegibility}
.focus-time-pair{min-width:2ch;text-align:center}.focus-colon{width:.32em;padding-bottom:.12em;text-align:center;font-size:.72em;font-weight:300;letter-spacing:0;color:inherit}
[data-counter='ring'] .focus-dial{width:min(68vw,54dvh,560px);aspect-ratio:1}[data-counter='ring'] .focus-time{font-size:clamp(46px,min(12vw,14dvh),124px)}
.focus-ring{position:absolute;inset:0;width:100%;height:100%;overflow:visible;transform:rotate(-90deg);pointer-events:none}.focus-ring-track{stroke:hsl(var(--border)/.65);stroke-width:.7}.focus-ring-progress{stroke:hsl(var(--primary)/.7);stroke-width:1.2;stroke-linecap:round;transition:stroke-dashoffset 1s linear}
.focus-actions{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:clamp(30px,6vh,58px)}
.focus-toggle{display:inline-flex;align-items:center;justify-content:center;gap:11px;min-width:156px;min-height:48px;padding:12px 24px;border:1px solid hsl(var(--primary)/.08);border-radius:999px;background:hsl(var(--primary));color:hsl(var(--primary-foreground));box-shadow:0 4px 14px hsl(var(--primary)/.1),inset 0 1px 0 hsl(var(--primary-foreground)/.08);font-size:13px;font-weight:500;transition:background 180ms,transform 180ms,box-shadow 180ms}
.focus-toggle:hover{background:hsl(var(--primary)/.9);box-shadow:0 6px 20px hsl(var(--primary)/.15)}.focus-toggle:active{transform:scale(.98)}
.focus-icon{display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:50%;border:1px solid transparent;color:hsl(var(--muted-foreground));transition:background 180ms,color 180ms,border-color 180ms}
.focus-icon:hover,.focus-icon[aria-expanded='true']{background:hsl(var(--muted)/.6);border-color:hsl(var(--border)/.6);color:hsl(var(--foreground))}
.focus-exit,.focus-appearance{position:absolute;top:max(24px,env(safe-area-inset-top));width:42px;height:42px}.focus-exit{right:max(24px,env(safe-area-inset-right))}.focus-appearance{left:max(24px,env(safe-area-inset-left))}.focus-view-symbol{width:20px;height:20px}
.focus-appearance-panel{position:absolute;top:max(76px,calc(env(safe-area-inset-top) + 56px));left:max(24px,env(safe-area-inset-left));z-index:2;width:min(344px,calc(100vw - 48px));max-height:calc(100dvh - 100px);overflow-y:auto;overscroll-behavior:contain;padding:18px;border:1px solid hsl(var(--border)/.75);border-radius:18px;background:hsl(var(--card)/.97);box-shadow:0 12px 40px hsl(var(--foreground)/.08);backdrop-filter:blur(20px);scrollbar-width:thin}
.focus-settings-title{margin-bottom:12px;font-size:12px;font-weight:550;color:hsl(var(--foreground))}.focus-settings-tabs{display:flex;gap:4px;margin-bottom:18px;padding:4px;border-radius:11px;background:hsl(var(--muted)/.55)}.focus-settings-tabs button{flex:1;padding:7px 8px;border:1px solid transparent;border-radius:8px;font-size:11px;color:hsl(var(--muted-foreground));transition:background 160ms,color 160ms}.focus-settings-tabs button[aria-pressed='true']{border-color:hsl(var(--border)/.5);background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 1px 3px hsl(var(--foreground)/.03)}
.focus-option-heading{margin-bottom:10px;font-size:11px;font-weight:500;color:hsl(var(--muted-foreground))}.focus-option-heading:not(:first-child){margin-top:18px}
.focus-counter-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;padding-top:16px;border-top:1px solid hsl(var(--border)/.55)}.focus-counter-row .focus-option-heading{margin:0}.focus-counter-styles{display:flex;gap:5px}.focus-counter-styles button{display:flex;align-items:center;justify-content:center;gap:6px;padding:7px 9px;border:1px solid hsl(var(--border)/.6);border-radius:8px;font-size:11px;color:hsl(var(--muted-foreground));transition:background 160ms,color 160ms,border-color 160ms}
.focus-counter-styles button[aria-pressed='true']{background:hsl(var(--primary)/.055);border-color:hsl(var(--primary)/.25);color:hsl(var(--foreground))}
.focus-duration-presets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.focus-duration-presets button{padding:9px 10px;border:1px solid hsl(var(--border)/.6);border-radius:10px;text-align:left;transition:background 160ms,border-color 160ms}.focus-duration-presets button strong,.focus-duration-presets button span{display:block;font-weight:400}.focus-duration-presets button strong{font-size:11px;color:hsl(var(--foreground))}.focus-duration-presets button span{margin-top:4px;font-size:10px;font-variant-numeric:tabular-nums;color:hsl(var(--muted-foreground))}.focus-duration-presets button[aria-pressed='true']{background:hsl(var(--primary)/.055);border-color:hsl(var(--primary)/.25)}.focus-duration-presets button:hover{background:hsl(var(--muted)/.4)}
.focus-duration-fields{margin-top:14px}.focus-duration-fields>label{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;font-size:12px;color:hsl(var(--foreground))}.focus-duration-fields>label+label{border-top:1px solid hsl(var(--border)/.4)}.focus-duration-input{display:flex;align-items:center;gap:3px;padding:0 10px 0 2px;border:1px solid hsl(var(--border)/.7);border-radius:9px;background:hsl(var(--background)/.4);transition:border-color 160ms,box-shadow 160ms}.focus-duration-input:focus-within{border-color:hsl(var(--primary)/.45);box-shadow:0 0 0 2px hsl(var(--primary)/.06)}.focus-duration-input input{appearance:textfield;-moz-appearance:textfield;width:48px;padding:8px 3px;border:0;outline:none;background:transparent;text-align:center;font-size:13px;font-variant-numeric:tabular-nums;color:hsl(var(--foreground))}.focus-duration-input input::-webkit-inner-spin-button,.focus-duration-input input::-webkit-outer-spin-button{appearance:none;-webkit-appearance:none;margin:0}.focus-duration-input>span{font-size:10px;color:hsl(var(--muted-foreground))}.focus-duration-error{color:hsl(var(--destructive))}.focus-duration-apply{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:15px;padding:10px;border-radius:10px;background:hsl(var(--primary));color:hsl(var(--primary-foreground));font-size:11px;font-weight:500}
.focus-backgrounds{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.focus-background-choice{position:relative;min-width:0;aspect-ratio:1.45;overflow:hidden;border:2px solid transparent;border-radius:10px;background:hsl(var(--muted));color:white;transition:border-color 160ms,box-shadow 160ms}.focus-background-choice img{width:100%;height:100%;object-fit:cover;transition:transform 250ms ease}.focus-background-choice::after{content:'';position:absolute;inset:0;background:linear-gradient(transparent 30%,rgb(0 0 0/.6))}.focus-background-choice>span{position:absolute;bottom:7px;inset-inline:5px;z-index:1;font-size:10px;text-align:center;white-space:nowrap}.focus-background-choice>svg{position:absolute;top:5px;right:5px;z-index:1;padding:1px;border-radius:50%;background:hsl(var(--primary));color:hsl(var(--primary-foreground));width:15px;height:15px}.focus-background-choice[aria-pressed='true']{border-color:hsl(var(--primary)/.7);box-shadow:0 0 0 2px hsl(var(--primary)/.08)}.focus-background-choice:hover img{transform:scale(1.035)}.focus-background-choice.is-plain{background:linear-gradient(145deg,hsl(var(--background)),hsl(var(--primary)/.1));color:hsl(var(--foreground))}.focus-background-choice.is-plain::after{display:none}
.focus-tracks{display:flex;flex-direction:column;gap:6px}.focus-track{border:1px solid hsl(var(--border)/.6);border-radius:11px;transition:background 160ms,border-color 160ms}.focus-track.is-selected{border-color:hsl(var(--primary)/.25);background:hsl(var(--primary)/.045)}.focus-track-choice{display:flex;align-items:center;gap:11px;width:100%;padding:10px 11px;border-radius:10px;color:hsl(var(--muted-foreground));text-align:left;transition:background 160ms}.focus-track-choice>svg{flex-shrink:0}.focus-track-choice>span{flex:1;min-width:0}.focus-track-choice strong,.focus-track-choice small{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:400}.focus-track-choice strong{font-size:12px;color:hsl(var(--foreground))}.focus-track-choice small{margin-top:3px;font-size:10px}.focus-track-choice .track-duration{margin:0;font-variant-numeric:tabular-nums}.focus-track-choice:hover{background:hsl(var(--muted)/.4)}.track-check{color:hsl(var(--primary))}.focus-music-toggle{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:12px;padding:10px;border-radius:10px;background:hsl(var(--primary));color:hsl(var(--primary-foreground));font-size:11px;font-weight:500}
.focus-track-timeline{padding:0 12px 10px}.focus-seek{display:block;appearance:none;-webkit-appearance:none;width:100%;height:20px;margin:0;cursor:pointer;background:transparent;accent-color:hsl(var(--primary))}.focus-seek::-webkit-slider-runnable-track{height:3px;border-radius:3px;background:linear-gradient(to right,hsl(var(--primary)/.75) var(--seek-progress),hsl(var(--border)) var(--seek-progress))}.focus-seek::-moz-range-track{height:3px;border-radius:3px;background:hsl(var(--border))}.focus-seek::-moz-range-progress{height:3px;border-radius:3px;background:hsl(var(--primary)/.75)}.focus-seek::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:9px;height:9px;margin-top:-3px;border:2px solid hsl(var(--card));border-radius:50%;background:hsl(var(--primary));box-shadow:0 0 0 1px hsl(var(--primary)/.2)}.focus-seek::-moz-range-thumb{width:6px;height:6px;border:2px solid hsl(var(--card));border-radius:50%;background:hsl(var(--primary));box-shadow:0 0 0 1px hsl(var(--primary)/.2)}.focus-audio-times{display:flex;justify-content:space-between;font-size:10px;line-height:1.3;font-variant-numeric:tabular-nums;color:hsl(var(--muted-foreground))}.focus-seek:focus-visible{outline:2px solid hsl(var(--primary)/.4);outline-offset:2px;border-radius:4px}
.focus-volume{display:flex;align-items:center;gap:9px;margin-top:17px;color:hsl(var(--muted-foreground));font-size:10px}.focus-volume>span{display:flex;align-items:center;gap:5px;white-space:nowrap}.focus-volume input{flex:1;min-width:0;height:4px;accent-color:hsl(var(--primary));cursor:pointer}.focus-volume output{width:30px;text-align:right;font-variant-numeric:tabular-nums}.focus-setting-hint{margin-top:10px;font-size:10px;line-height:1.6;color:hsl(var(--muted-foreground))}.focus-media-credit{display:flex;flex-wrap:wrap;gap:3px 7px;margin-top:13px;font-size:9px;line-height:1.5;color:hsl(var(--muted-foreground))}.focus-media-credit a:hover{text-decoration:underline}.focus-media-credit>span{width:100%}
.focus-error{max-width:360px;margin:18px 0 0;text-align:center;font-size:12px;line-height:1.6;color:hsl(var(--muted-foreground))}
button:disabled{opacity:.35;cursor:default}button:focus-visible{outline:2px solid hsl(var(--primary)/.5);outline-offset:4px}
.focus-options-enter-active,.focus-options-leave-active{transition:opacity 140ms ease,transform 180ms cubic-bezier(.22,1,.36,1);transform-origin:top left}.focus-options-enter-from,.focus-options-leave-to{opacity:0;transform:translateY(-5px) scale(.97)}
@keyframes focus-in{from{opacity:0}to{opacity:1}}@keyframes focus-content-in{from{opacity:0;transform:translateY(calc(-2vh + 7px))}to{opacity:1;transform:translateY(-2vh)}}
@media(max-height:420px){.focus-mode{margin-bottom:10px}.focus-actions{margin-top:18px}.focus-content{transform:none}[data-counter='ring'] .focus-dial{width:min(48vw,50dvh)}[data-counter='ring'] .focus-time{font-size:clamp(32px,12dvh,68px)}.focus-appearance-panel{top:68px;max-height:calc(100dvh - 84px);overflow:auto}}
@media(prefers-reduced-motion:reduce){.pomodoro-focus,.focus-content{animation:none}.focus-toggle,.focus-icon,.focus-status-dot,.focus-ring-progress,.focus-counter-styles button,.focus-duration-presets button,.focus-duration-input,.focus-settings-tabs button,.focus-track,.focus-track-choice,.focus-background-choice,.focus-background-choice img,.focus-backdrop-enter-active,.focus-backdrop-leave-active,.focus-options-enter-active,.focus-options-leave-active{transition:none}}
</style>
