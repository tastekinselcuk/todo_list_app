import type { TimerDurations } from '../stores/pomodoro'

export const focusDurationFields=[{key:'focus',min:10,max:90},{key:'shortBreak',min:3,max:30},{key:'longBreak',min:5,max:45}] as const
export const focusDurationPresets=[
 {id:'baby-step',focus:10,shortBreak:5,longBreak:10},
 {id:'popular',focus:25,shortBreak:5,longBreak:15},
 {id:'medium',focus:40,shortBreak:8,longBreak:20},
 {id:'extended',focus:60,shortBreak:10,longBreak:25},
] as const
export function invalidFocusDuration(value:TimerDurations){return focusDurationFields.find(field=>!Number.isInteger(value[field.key])||value[field.key]<field.min||value[field.key]>field.max)}

export const focusCounters=['digital','ring'] as const
export const focusBackgrounds=[
 {id:'none',src:'',thumbnail:'',author:'',source:''},
 {id:'forest',src:'/focus/backgrounds/forest.webp',thumbnail:'/focus/backgrounds/forest-thumb.webp',author:'Annie Spratt',source:'https://unsplash.com/photos/green-leafed-trees-during-mist-l2RieCaZ9CY'},
 {id:'ocean',src:'/focus/backgrounds/ocean.webp',thumbnail:'/focus/backgrounds/ocean-thumb.webp',author:'Stella Mariz Abayhon',source:'https://unsplash.com/photos/St6-y5WjeZk'},
 {id:'mountains',src:'/focus/backgrounds/mountains.webp',thumbnail:'/focus/backgrounds/mountains-thumb.webp',author:'Patrick Robert Doyle',source:'https://unsplash.com/photos/lake-near-snow-covered-mountain-during-daytime-tHbdWa5rR5E'},
 {id:'rain',src:'/focus/backgrounds/rain.webp',thumbnail:'/focus/backgrounds/rain-thumb.webp',author:'Syuhei Inoue',source:'https://unsplash.com/photos/SsfPA_sZ4Wk'},
] as const
export const focusTracks=[
 {id:'piano',src:'/focus/audio/piano.mp3',title:'Meditation Impromptu 02',duration:249.078,author:'Kevin MacLeod',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',source:'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100162'},
 {id:'ambient',src:'/focus/audio/ambient.mp3',title:'Dreams Become Real',duration:410.07,author:'Kevin MacLeod',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',source:'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1500027'},
 {id:'rhythm',src:'/focus/audio/rhythm.mp3',title:'Dream Culture',duration:214.361,author:'Kevin MacLeod',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',source:'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1300046'},
 {id:'rain',src:'/focus/audio/rain.mp3',title:'Rain (loopable)',duration:45.01,author:'Ylmir',license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',source:'https://opengameart.org/content/rain-loopable'},
 {id:'fireplace',src:'/focus/audio/fireplace.mp3',title:'Fireplace Sound loop',duration:29.264,author:'PagDev',license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',source:'https://opengameart.org/content/fireplace-sound-loop'},
] as const
export type CounterStyle=typeof focusCounters[number]
export type BackgroundId=typeof focusBackgrounds[number]['id']
export type TrackId=typeof focusTracks[number]['id']
export interface FocusAppearance {counter:CounterStyle;background:BackgroundId;track:TrackId;volume:number}
export function normalizeFocusAppearance(value:unknown):FocusAppearance {
 const input=value&&typeof value==='object'?value as Partial<FocusAppearance>:{}
 return {
  counter:focusCounters.includes(input.counter!)?input.counter!:'ring',
  background:focusBackgrounds.some(scene=>scene.id===input.background)?input.background!:'none',
  track:focusTracks.some(track=>track.id===input.track)?input.track!:'piano',
  volume:typeof input.volume==='number'&&Number.isFinite(input.volume)?Math.min(1,Math.max(0,input.volume)):.25,
 }
}

export type FocusSoundStatus='idle'|'loading'|'playing'|'error'
export interface FocusSoundPosition {track:TrackId|null;currentTime:number;duration:number}
type FocusTrack=typeof focusTracks[number]
// Media is created only after an explicit play action. Never persist autoplay intent.
export class FocusSoundPlayer {
 private media:HTMLAudioElement|null=null
 private track:FocusTrack|null=null
 private position=0
 private duration=0
 private pendingSeek:number|null=null
 private revision=0
 private wanted=false
 constructor(private report:(status:FocusSoundStatus)=>void,private create:()=>HTMLAudioElement=()=>new Audio(),private reportPosition:(position:FocusSoundPosition)=>void=()=>{}){}
 select(track:FocusTrack){
  if(this.track?.id===track.id)return
  this.pause();this.release();this.track=track;this.position=0;this.duration=track.duration;this.pendingSeek=null;this.publish()
 }
 async play(track:FocusTrack,volume:number){
  this.select(track)
  const revision=++this.revision
  this.wanted=true;this.report('loading')
  try{
   if(!this.media){
    const media=this.create();this.media=media
    this.pendingSeek=this.position>0?this.position:null
    const metadata=()=>{
     if(this.media!==media)return
     if(Number.isFinite(media.duration)&&media.duration>0)this.duration=media.duration
     this.position=Math.min(this.position,this.duration)
     this.applySeek();this.publish()
    }
    const tick=()=>{
     if(this.media!==media||this.pendingSeek!==null)return
     if(Number.isFinite(media.currentTime))this.position=Math.min(this.duration,Math.max(0,media.currentTime))
     this.publish()
    }
    media.onloadedmetadata=metadata;media.ondurationchange=metadata;media.ontimeupdate=tick;media.onseeked=tick
    media.onerror=()=>{if(this.media===media){this.revision++;this.wanted=false;this.release();this.report('error')}}
    media.preload='none';media.loop=true;media.src=track.src
   }
   const media=this.media!
   this.setVolume(volume)
   await media.play()
   if(revision!==this.revision){if(media!==this.media||!this.wanted)media.pause();return}
   this.report('playing')
  }catch{if(revision===this.revision){this.wanted=false;this.media?.pause();this.report('error')}}
 }
 // Seeking before playback only remembers the position; it never downloads or starts audio.
 seek(seconds:number){
  if(!this.track||!Number.isFinite(seconds))return
  this.position=Math.min(this.duration,Math.max(0,seconds));this.pendingSeek=this.position
  this.applySeek();this.publish()
 }
 private applySeek(){
  if(!this.media||this.media.readyState<1||this.pendingSeek===null)return
  const target=Math.min(this.duration,this.pendingSeek)
  try{this.media.currentTime=target;this.position=target;this.pendingSeek=null}catch{/* Metadata may still be loading. Retry on the next metadata event. */}
 }
 private publish(){this.reportPosition({track:this.track?.id??null,currentTime:this.position,duration:this.duration})}
 setVolume(volume:number){if(this.media)this.media.volume=Number.isFinite(volume)?Math.min(1,Math.max(0,volume)):.25}
 pause(){this.revision++;this.wanted=false;this.media?.pause();this.report('idle')}
 private release(){
  const media=this.media;this.media=null
  if(media){media.onerror=null;media.onloadedmetadata=null;media.ondurationchange=null;media.ontimeupdate=null;media.onseeked=null;media.pause();media.removeAttribute('src');media.load()}
 }
 dispose(){this.pause();this.release();this.track=null;this.position=0;this.duration=0;this.pendingSeek=null;this.publish()}
}
