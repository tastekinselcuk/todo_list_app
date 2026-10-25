import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useWorkspacesStore } from '@/stores/workspaces'
import { useSettingsStore } from '@/stores/settings'
import { supabase } from '@/lib/supabase'
import { readStoredJSON, writeStoredJSON } from '@/lib/storage'
import { focusJournal } from '@/features/analytics/lib/focusService'
import type { FocusJournal, FocusSession } from '@/features/analytics/lib/focusJournal'

export type ModeKey = 'focus' | 'shortBreak' | 'longBreak'
export interface TimerDurations { focus:number; shortBreak:number; longBreak:number }
export interface FocusTarget { id:string; collection_id:string; workspace_id:string; title:string; estimated_sessions:number; focus_seconds:number; completed?:boolean }
type ServerSession = FocusSession & { task_title?:string | null; task_completed?:boolean; expires_at?:string; segment_started_at?:string|null }
type Snapshot = { client:string; owner:string; updated:number; mode:ModeKey; deadline:number|null; remaining:number; duration:number; running:boolean; target:FocusTarget|null; session:FocusSession|null; released?:boolean }
type PendingStop = { id:string; detach:boolean; remote:boolean }
function validTarget(value:unknown):boolean {
  if(value===null)return true
  if(!value||typeof value!=='object')return false
  const target=value as FocusTarget
  return ['id','collection_id','workspace_id','title'].every(key=>typeof target[key as keyof FocusTarget]==='string')&&Number.isFinite(target.estimated_sessions)&&target.estimated_sessions>=1&&Number.isFinite(target.focus_seconds)&&target.focus_seconds>=60&&target.focus_seconds<=5400
}
function validView(value:unknown):boolean {
  if(!value||typeof value!=='object')return false
  const view=value as Snapshot
  return ['focus','shortBreak','longBreak'].includes(view.mode)&&Number.isFinite(view.remaining)&&view.remaining>=0&&Number.isFinite(view.duration)&&view.duration>=60&&view.duration<=5400&&view.remaining<=view.duration&&(view.deadline===null||Number.isFinite(view.deadline))&&validTarget(view.target)
}
function validSnapshot(value:unknown):value is Snapshot {
  if(!validView(value))return false
  const snapshot=value as Snapshot
  return typeof snapshot.client==='string'&&typeof snapshot.owner==='string'&&Number.isFinite(snapshot.updated)&&typeof snapshot.running==='boolean'&&(snapshot.deadline===null||Number.isFinite(snapshot.deadline))
}
function networkFailure(failure:unknown):boolean {
  if(failure instanceof TypeError)return true
  if(!failure||typeof failure!=='object')return false
  const {code,message}=failure as {code?:string;message?:string}
  return code==='NETWORK_ERROR'||(!code&&/fetch|network|offline|connection|abort/i.test(message||''))
}
export function normalizeDurations(value:TimerDurations):TimerDurations {
  const clamp=(n:number,min:number,max:number,fallback:number)=>Number.isFinite(n)?Math.min(max,Math.max(min,Math.round(n))):fallback
  return {focus:clamp(value.focus,10,90,25),shortBreak:clamp(value.shortBreak,3,30,5),longBreak:clamp(value.longBreak,5,45,15)}
}
export const usePomodoroStore = defineStore('pomodoro',()=>{
  const auth=useAuthStore(),workspaces=useWorkspacesStore(),settings=useSettingsStore()
  const durations=ref<TimerDurations>({...settings.pomodoroDurations})
  const modeKey=ref<ModeKey>('focus'),sessionSeconds=ref(1500),timeLeft=ref(1500),isRunning=ref(false)
  const nextMode=computed<ModeKey>(()=>modeKey.value==='focus'?'shortBreak':modeKey.value==='shortBreak'?'longBreak':'focus')
  const currentTarget=ref<FocusTarget|null>(null),queuedTarget=ref<FocusTarget|null>(null)
  const remote=ref(false),starting=ref(false),error=ref(''),capability=ref<'unknown'|'ready'|'legacy'>('unknown')
  const clearing=ref(false),errorCode=ref('')
  const errorMessageKey=computed(()=>{
    if(error.value.includes('SETUP')||['PGRST202','42883','42P01','42703'].includes(errorCode.value))return 'pomoNotes.setup'
    if(/TARGET_UNAVAILABLE|WORKSPACE_FORBIDDEN|WORKSPACE_ACCESS_DENIED|ACCESS_DENIED/.test(error.value))return 'pomoNotes.targetUnavailable'
    if(error.value.includes('AUTH_REQUIRED')||errorCode.value==='PGRST301')return 'pomoNotes.signInAgain'
    return clearing.value||error.value==='FOCUS_STOP_FAILED'?'pomoNotes.stopFailed':'pomoNotes.startFailed'
  })
  const completionSequence=ref(0),lastCompletedMode=ref<ModeKey>('focus'),syncSequence=ref(0),taskStatsSequence=ref(0)
  const provisional=ref(false)
  const client=typeof crypto!=='undefined'?crypto.randomUUID():'00000000-0000-0000-0000-000000000001'
  let owner='',journal:FocusJournal|undefined,deadline:number|null=null,interval:ReturnType<typeof setInterval>|null=null
  let lastSync=0,syncing=false,initialized=false,epoch=0,ownershipRevision=0,channel:BroadcastChannel|undefined
  let remoteSessionId:string|null=null
  let restoredPauseId:string|null=null
  const savedTaskRevisions=new Map<string,number>()
  const pendingStop=ref<PendingStop|null>(null)
  const closedSessions=new Set<string>()
  function rememberClosed(id:string){closedSessions.add(id);if(closedSessions.size>64)closedSessions.delete(closedSessions.values().next().value!)}
  const originalTitle=typeof document!=='undefined'?document.title:'Todo'
  const activeSession=computed(()=>{syncSequence.value;return journal?.session||null})
  const formattedTime=computed(()=>`${Math.floor(timeLeft.value/60).toString().padStart(2,'0')}:${(timeLeft.value%60).toString().padStart(2,'0')}`)
  const progressPercentage=computed(()=>Math.max(0,Math.min(100,(sessionSeconds.value-timeLeft.value)/sessionSeconds.value*100)))
  const canReset=computed(()=>!clearing.value&&(pendingStop.value!==null||remote.value||isRunning.value||activeSession.value?.status==='paused'||timeLeft.value!==sessionSeconds.value))
  const planned=()=>modeKey.value==='focus'?(currentTarget.value?.focus_seconds||durations.value.focus*60):durations.value[modeKey.value]*60
  const title=()=>{if(typeof document!=='undefined')document.title=isRunning.value?`${formattedTime.value} - ${originalTitle}`:originalTitle}
  const stopClock=()=>{if(interval!==null)clearInterval(interval);interval=null}
  const savedKey=()=>`pomodoro-view:${owner}`
  async function flushJournal(activeJournal=journal) {
    const capturedEpoch=epoch
    const changed=activeJournal?.pending().filter(session=>session.association==='task'&&['paused','ended','completed'].includes(session.status))||[]
    await activeJournal?.flush()
    // A terminal checkpoint may arrive during an older upload. Drain that revision too.
    if(activeJournal?.pending().length&&!activeJournal.lastSyncError)await activeJournal.flush()
    if(capturedEpoch===epoch&&activeJournal===journal){
      syncSequence.value++;provisional.value=Boolean(activeJournal?.pending().length)
      const pending=activeJournal?.pending()||[]
      let changedStats=false
      for(const session of changed){
        if(!pending.some(row=>row.id===session.id&&row.revision>=session.revision)&&(savedTaskRevisions.get(session.id)||0)<session.revision){
          savedTaskRevisions.set(session.id,session.revision);changedStats=true
        }
      }
      if(savedTaskRevisions.size>64)savedTaskRevisions.delete(savedTaskRevisions.keys().next().value!)
      if(changedStats)taskStatsSequence.value++
    }
  }
  function publish(released=false) {
    if(!owner||remote.value)return
    const snapshot:Snapshot={client,owner,updated:Date.now(),mode:modeKey.value,deadline,remaining:timeLeft.value,duration:sessionSeconds.value,
      running:isRunning.value,target:currentTarget.value,session:journal?.session||null,released}
    writeStoredJSON(`focus-owner:${owner}`,snapshot)
    // Vue refs expose reactive proxies. BroadcastChannel's structured clone
    // rejects those, even after the server has successfully claimed a session.
    try { channel?.postMessage(JSON.parse(JSON.stringify(snapshot))) } catch { /* Broadcast is optional; never abort a timer operation. */ }
    writeStoredJSON(savedKey(),{mode:modeKey.value,target:currentTarget.value,queued:queuedTarget.value,remaining:timeLeft.value,duration:sessionSeconds.value,deadline,pendingStop:pendingStop.value})
  }
  function mirror(snapshot:Snapshot) {
    if(clearing.value||starting.value||pendingStop.value)return
    if(!validSnapshot(snapshot)||snapshot.owner!==owner||snapshot.client===client||Date.now()-snapshot.updated>45_000)return
    if(snapshot.session&&closedSessions.has(snapshot.session.id))return
    if(snapshot.session?.id===restoredPauseId)return
    if(!snapshot.running&&snapshot.session?.status!=='paused'){
      if(remote.value){remote.value=false;remoteSessionId=null;isRunning.value=false;deadline=null;stopClock();journal?.abandon();currentTarget.value=null;queuedTarget.value=null;modeKey.value='focus';sessionSeconds.value=planned();timeLeft.value=sessionSeconds.value;syncSequence.value++;publish();title()}
      return
    }
    if(!remote.value&&isRunning.value&&modeKey.value==='focus'){journal?.pause();void flushJournal()}
    remote.value=true;modeKey.value=snapshot.mode;sessionSeconds.value=snapshot.duration;deadline=snapshot.deadline
    remoteSessionId=snapshot.session?.id||null
    currentTarget.value=snapshot.target;isRunning.value=snapshot.running;timeLeft.value=snapshot.remaining
    if(isRunning.value||snapshot.session?.status==='paused')startClock();else stopClock()
    title()
  }
  function fromServer(session:ServerSession) {
    const elapsed=session.segments.reduce((sum,[a,b])=>sum+(Date.parse(b)-Date.parse(a))/1000,0)
    const end=Math.max(Date.parse(session.segments[session.segments.length-1]?.[1]||session.started_at),Date.parse(session.segment_started_at||session.started_at))
    remoteSessionId=session.id
    modeKey.value='focus';sessionSeconds.value=session.planned_seconds
    currentTarget.value=session.association==='task'?{id:session.task_id||'',collection_id:session.collection_id||'',workspace_id:session.workspace_id,
      title:session.task_title||'',estimated_sessions:session.estimated_sessions||1,focus_seconds:session.goal_seconds||session.planned_seconds}:null
    if(currentTarget.value)currentTarget.value.completed=session.task_completed||!session.task_id
    timeLeft.value=Math.max(0,Math.ceil(session.planned_seconds-elapsed))
    isRunning.value=session.status==='running'
    deadline=isRunning.value?end+timeLeft.value*1000:null
    if(session.id===restoredPauseId){
      if(journal?.session?.id===session.id)timeLeft.value=journal.remaining
      isRunning.value=false;deadline=null;stopClock()
    }
    else startClock()
  }
  async function sync() {
    if(syncing||starting.value||clearing.value||!owner)return
    if(pendingStop.value){await finishFocus(pendingStop.value.detach);return}
    const capturedOwner=owner,capturedEpoch=epoch,operation=ownershipRevision,activeJournal=journal
    syncing=true
    try {
      if(workspaces.sharingAvailable!==false&&typeof supabase.rpc==='function') {
        const result=await supabase.rpc('focus_context',{client_id:client})
        if(capturedEpoch!==epoch||operation!==ownershipRevision||auth.user?.id!==capturedOwner)return
        if(!result.error&&result.data?.version===1) {
          capability.value='ready'
          provisional.value=false
          const reported=result.data.active as ServerSession|null
          const session=reported&&closedSessions.has(reported.id)?null:reported
          if(!session&&activeJournal?.session&&['running','paused'].includes(activeJournal.session.status)&&result.data.closed?.includes(activeJournal.session.id)){
            activeJournal.abandon();remote.value=false;isRunning.value=false;deadline=null;stopClock();currentTarget.value=null;queuedTarget.value=null
            modeKey.value='focus';sessionSeconds.value=planned();timeLeft.value=sessionSeconds.value;syncSequence.value++;title()
          }
          if(session&&session.client_id!==client){remote.value=true;fromServer(session)}
          else if(session&&currentTarget.value){currentTarget.value={...currentTarget.value,title:session.task_title||'',id:session.task_id||'',completed:session.task_completed??currentTarget.value.completed??!session.task_id}}
          else if(!session&&remote.value&&modeKey.value==='focus'){
            remote.value=false;isRunning.value=false;deadline=null;stopClock();activeJournal?.abandon()
            currentTarget.value=null;remoteSessionId=null
            sessionSeconds.value=planned();timeLeft.value=sessionSeconds.value;title()
          }
        } else if(['PGRST202','42883'].includes(result.error?.code||''))capability.value='legacy'
        else if(result.error)provisional.value=true
      }
      if(capturedEpoch!==epoch)return
      if(!remote.value&&modeKey.value==='focus')activeJournal?.checkpoint()
      await flushJournal(activeJournal)
      if(capturedEpoch===epoch){syncSequence.value++;provisional.value=Boolean(activeJournal?.pending().length)}
    } catch {if(capturedEpoch===epoch)provisional.value=true}
    finally{if(capturedEpoch===epoch){syncing=false;lastSync=Date.now();publish()}}
  }
  function remoteFinished() {
    remote.value=false;isRunning.value=false;deadline=null;stopClock();journal?.abandon();modeKey.value='shortBreak'
    sessionSeconds.value=planned();timeLeft.value=sessionSeconds.value;syncSequence.value++;publish();title()
  }
  function startClock() {
    if(interval!==null)return
    interval=setInterval(()=>{
      if(Date.now()-lastSync>=15_000)void sync()
      if(!deadline)return
      timeLeft.value=Math.max(0,Math.ceil((deadline-Date.now())/1000));title()
      if(timeLeft.value<=0) {
        stopClock();isRunning.value=false;deadline=null
        if(!remote.value) {
          if(modeKey.value==='focus'){journal?.checkpoint();void flushJournal();syncSequence.value++}
          lastCompletedMode.value=modeKey.value;completionSequence.value++
          modeKey.value=modeKey.value==='focus'?'shortBreak':'focus'
          if(modeKey.value==='focus'&&queuedTarget.value){currentTarget.value=queuedTarget.value;queuedTarget.value=null}
          else if(modeKey.value==='focus'&&currentTarget.value?.completed)currentTarget.value=null
          sessionSeconds.value=planned();timeLeft.value=sessionSeconds.value;publish()
        } else startClock()
        title()
      }
    },500)
  }
  async function reserve(proposal:FocusSession,takeover=false,operation=ownershipRevision) {
    const capturedOwner=owner,capturedEpoch=epoch
    if(capability.value==='legacy'){if(proposal.association==='task')throw Error('SETUP_REQUIRED');return null}
    try {
      const result=await supabase.rpc('claim_focus_session',{client_id:client,payload:proposal,takeover})
      if(capturedEpoch!==epoch||owner!==capturedOwner)return false
      if(operation!==ownershipRevision){if(!result.error&&result.data?.status==='claimed'){await stopServer(result.data.active.id);rememberClosed(result.data.active.id)}return false}
      if(result.error) {
        if(['PGRST202','42883'].includes(result.error.code)) {capability.value='legacy';if(proposal.association==='task')throw Error('SETUP_REQUIRED');return null}
        throw result.error
      }
      capability.value='ready'
      provisional.value=false
      if(result.data?.status==='busy'){remote.value=true;fromServer(result.data.active);error.value='REMOTE_ACTIVE';return false}
      if(result.data?.status==='finished'){remoteFinished();return false}
      return result.data.active as ServerSession|null
    } catch(failure) {
      if(capturedEpoch!==epoch||owner!==capturedOwner||operation!==ownershipRevision)return false
      if(!networkFailure(failure))throw failure
      provisional.value=true
      // An offline session is provisional until server reconciliation, never an optimistic cycle credit.
      return null
    }
  }
  async function startTimer(takeover=false) {
    if(starting.value||clearing.value||(!remote.value&&isRunning.value))return
    if(pendingStop.value){await finishFocus(pendingStop.value.detach);if(pendingStop.value||error.value)return}
    const capturedOwner=auth.user?.id||workspaces.userId
    if(!capturedOwner)return
    starting.value=true;error.value='';errorCode.value='';const operation=++ownershipRevision
    try {
      if(!initialized)init()
      const capturedEpoch=epoch
      // Upload the saved pause before taking over the old writer lease. A refresh
      // must not turn time spent away from the page into a focus segment.
      if(restoredPauseId){
        await flushJournal()
        if(capturedEpoch!==epoch||operation!==ownershipRevision||auth.user?.id!==capturedOwner)return
      }
      if(remote.value&&takeover&&capability.value==='ready'&&modeKey.value==='focus') {
        const result=await supabase.rpc('claim_focus_session',{client_id:client,payload:null,takeover:true})
        if(capturedEpoch!==epoch||auth.user?.id!==capturedOwner)return
        if(operation!==ownershipRevision){if(!result.error&&result.data?.status==='claimed')await stopServer(result.data.active.id);return}
        if(result.error)throw result.error
        if(result.data?.status==='finished'){remoteFinished();return}
        const session=result.data.active as ServerSession|null
        if(session){fromServer(session);journal?.adopt({...session,client_id:client})}
        else journal?.abandon()
        remote.value=false;isRunning.value=false
      }
      const local=readStoredJSON<Snapshot|null>(`focus-owner:${capturedOwner}`,null,validSnapshot)
      if(!takeover&&local&&local.client!==client&&Date.now()-local.updated<45_000&&(local.running||local.session?.status==='paused')){mirror(local);error.value='REMOTE_ACTIVE';return}
      if(takeover&&remote.value&&capability.value==='legacy'&&local?.session){journal?.adopt(local.session);isRunning.value=false}
      if(timeLeft.value<=0){sessionSeconds.value=planned();timeLeft.value=sessionSeconds.value}
      if(modeKey.value==='focus') {
        const saved=journal?.session
        const resumed=saved?.status==='paused'||saved?.status==='running'
        const proposal:FocusSession=resumed?{...saved!,revision:saved!.revision+1,status:'running'}:{id:crypto.randomUUID(),workspace_id:currentTarget.value?.workspace_id||workspaces.activeId,
          started_at:new Date().toISOString(),planned_seconds:sessionSeconds.value,revision:1,status:'running',segments:[],
          association:currentTarget.value?'task':'free',task_id:currentTarget.value?.id||null,collection_id:currentTarget.value?.collection_id||null,
          estimated_sessions:currentTarget.value?.estimated_sessions,goal_seconds:currentTarget.value?.focus_seconds}
        const accepted=await reserve(proposal,takeover,operation)
        if(accepted===false||capturedEpoch!==epoch||operation!==ownershipRevision||auth.user?.id!==capturedOwner)return
        if(accepted)journal?.adopt({...accepted,client_id:client})
        if(!journal)deadline=Date.now()+timeLeft.value*1000
        else deadline=journal.start(proposal.workspace_id,proposal.planned_seconds,accepted||proposal)
      } else deadline=Date.now()+timeLeft.value*1000
      restoredPauseId=null;remote.value=false;isRunning.value=true;syncSequence.value++;lastSync=Date.now();startClock();publish();void flushJournal();title()
    } catch(failure){if(auth.user?.id===capturedOwner&&operation===ownershipRevision){error.value=failure&&typeof failure==='object'&&'message' in failure?String(failure.message):'FOCUS_START_FAILED';errorCode.value=failure&&typeof failure==='object'&&'code' in failure?String(failure.code):''}}
    finally{starting.value=false}
  }
  function pauseTimer() {
    if(remote.value)return
    if(deadline)timeLeft.value=Math.max(0,Math.ceil((deadline-Date.now())/1000))
    if(modeKey.value==='focus'){journal?.pause();void flushJournal();syncSequence.value++}
    isRunning.value=false;deadline=null;stopClock();if(journal?.session?.status==='paused')startClock();publish();title()
  }
  const resetTimer=()=>finishFocus(false)
  async function setMode(key:ModeKey) {
    if(remote.value)return
    const capturedEpoch=epoch
    const reset=resetTimer()
    if(clearing.value)await reset
    if(error.value||capturedEpoch!==epoch)return
    modeKey.value=key
    if(key==='focus'&&queuedTarget.value){currentTarget.value=queuedTarget.value;queuedTarget.value=null}
    else if(key==='focus'&&currentTarget.value?.completed)currentTarget.value=null
    sessionSeconds.value=planned();timeLeft.value=sessionSeconds.value;publish()
  }
  async function advanceMode() {
    if(starting.value||clearing.value||remote.value)return
    await setMode(nextMode.value)
  }
  function configure(value:TimerDurations) {
    durations.value=normalizeDurations(value);settings.pomodoroDurations={...durations.value}
    if(!isRunning.value&&!remote.value&&journal?.session?.status!=='paused'){sessionSeconds.value=planned();timeLeft.value=sessionSeconds.value}
  }
  async function focusOn(target:FocusTarget,immediate=false) {
    if(clearing.value||starting.value)return
    if((isRunning.value||journal?.session?.status==='paused')&&currentTarget.value?.id!==target.id&&!immediate) {
      queuedTarget.value=queuedTarget.value?.id===target.id?null:target;publish();return
    }
    if(currentTarget.value?.id===target.id&&modeKey.value==='focus') {
      if(!isRunning.value&&journal?.session?.status!=='paused'){currentTarget.value=target;sessionSeconds.value=planned();timeLeft.value=sessionSeconds.value}
      if(isRunning.value&&!remote.value)pauseTimer();else await startTimer(remote.value);return
    }
    if(remote.value){error.value='REMOTE_ACTIVE';return}
    if(modeKey.value!=='focus'&&isRunning.value&&!immediate){queuedTarget.value=target;publish();return}
    const reset=resetTimer()
    if(clearing.value)await reset
    if(error.value)return
    currentTarget.value=target;queuedTarget.value=null;modeKey.value='focus';sessionSeconds.value=planned();timeLeft.value=sessionSeconds.value
    await startTimer()
  }
  function forgetTask(id:string) {if(queuedTarget.value?.id===id)queuedTarget.value=null;if(currentTarget.value?.id===id)currentTarget.value={...currentTarget.value,title:'',completed:true};publish()}
  function completedTask(id:string) {if(queuedTarget.value?.id===id)queuedTarget.value=null;if(currentTarget.value?.id===id)currentTarget.value={...currentTarget.value,completed:true};publish()}
  function updateTarget(target:FocusTarget) {if(currentTarget.value?.id===target.id)currentTarget.value=target;if(queuedTarget.value?.id===target.id)queuedTarget.value=target;publish()}
  function cancelQueued() {queuedTarget.value=null;publish()}
  async function stopServer(sessionId:string) {
    const result=await supabase.rpc('end_focus_session',{session_id:sessionId})
    if(result.error)throw result.error
  }
  async function finishFocus(detach:boolean) {
    if(clearing.value)return
    const capturedOwner=owner,capturedEpoch=epoch,activeJournal=journal
    const wasRemote=pendingStop.value?.remote??remote.value
    const id=pendingStop.value?.id||(wasRemote?remoteSessionId:activeJournal?.session?.id)
    // Completed cycles already ended naturally; switching a break needs no stop RPC.
    const needsStop=Boolean(pendingStop.value||wasRemote||activeJournal?.session&&['running','paused'].includes(activeJournal.session.status))
    ownershipRevision++;clearing.value=true;error.value='';errorCode.value=''
    if(id&&needsStop)pendingStop.value={id,detach:detach||pendingStop.value?.detach||false,remote:wasRemote}
    try{
      if(!wasRemote){
        activeJournal?.end();isRunning.value=false;deadline=null;stopClock();syncSequence.value++
        sessionSeconds.value=planned();timeLeft.value=sessionSeconds.value;publish();title()
      }
      if(id&&needsStop){
        if(!wasRemote){
          await flushJournal(activeJournal)
          if(capturedEpoch!==epoch||auth.user?.id!==capturedOwner)return
          // Do not fence the server before the final partial-time revision is saved.
          if(activeJournal?.pending().some(session=>session.id===id))throw Error('FOCUS_STOP_FAILED')
        }
        if(wasRemote||capability.value!=='legacy')await stopServer(id)
      }
      if(capturedEpoch!==epoch||auth.user?.id!==capturedOwner)return
      if(id)rememberClosed(id)
      if(wasRemote){activeJournal?.abandon();remote.value=false;isRunning.value=false;deadline=null;stopClock()}
      if(wasRemote&&id&&needsStop&&currentTarget.value)taskStatsSequence.value++
      const shouldDetach=detach||pendingStop.value?.detach
      pendingStop.value=null;remoteSessionId=null
      if(shouldDetach){currentTarget.value=null;queuedTarget.value=null;modeKey.value='focus'}
      sessionSeconds.value=planned();timeLeft.value=sessionSeconds.value;syncSequence.value++;publish();title()
    }catch(failure){if(capturedEpoch===epoch){error.value='FOCUS_STOP_FAILED';errorCode.value=failure&&typeof failure==='object'&&'code' in failure?String(failure.code):''}}
    finally{if(capturedEpoch===epoch)clearing.value=false}
  }
  const clearFocus=()=>finishFocus(true)
  const visibility=()=>{if(isRunning.value&&deadline){timeLeft.value=Math.max(0,Math.ceil((deadline-Date.now())/1000));title()}void sync()}
  const pagehide=()=>{
    if(remote.value)return
    if(deadline)timeLeft.value=Math.max(0,Math.ceil((deadline-Date.now())/1000))
    if(modeKey.value==='focus')journal?.pause()
    isRunning.value=false;deadline=null;stopClock();publish(true);void flushJournal();title()
  }
  const storageChanged=(event:StorageEvent)=>{if(event.key===`focus-owner:${owner}`&&event.newValue){try{mirror(JSON.parse(event.newValue))}catch{}}}
  function init() {
    const uid=auth.user?.id||workspaces.userId
    if(initialized&&owner===uid)return
    if(initialized)shutdown()
    owner=uid||'';initialized=true;epoch++;syncing=false;remote.value=false;isRunning.value=false;deadline=null;capability.value='unknown';error.value='';provisional.value=false;pendingStop.value=null;clearing.value=false;restoredPauseId=null
    durations.value=normalizeDurations(settings.pomodoroDurations)
    journal=owner?focusJournal(owner):undefined
    const view=readStoredJSON<{mode:ModeKey;target:FocusTarget|null;queued:FocusTarget|null;remaining:number;duration:number;deadline:number|null;pendingStop?:PendingStop}|null>(savedKey(),null,
      v=>validView(v)&&validTarget((v as {queued:unknown}).queued))
    if(view){modeKey.value=view.mode;currentTarget.value=view.target;queuedTarget.value=view.queued;timeLeft.value=view.remaining;sessionSeconds.value=view.duration}
    else{modeKey.value='focus';currentTarget.value=null;queuedTarget.value=null;sessionSeconds.value=planned();timeLeft.value=sessionSeconds.value}
    if(view?.pendingStop&&typeof view.pendingStop.id==='string'&&typeof view.pendingStop.detach==='boolean'&&typeof view.pendingStop.remote==='boolean')pendingStop.value=view.pendingStop
    const local=readStoredJSON<Snapshot|null>(`focus-owner:${owner}`,null,validSnapshot)
    const liveOther=local&&local.client!==client&&!local.released&&Date.now()-local.updated<45_000&&(local.running||local.session?.status==='paused')
    if(journal?.session&&['running','paused'].includes(journal.session.status)){
      if(!liveOther){restoredPauseId=journal.session.id;journal.restorePaused()}
      const restored=journal.session
      currentTarget.value=restored.association==='task'?{id:restored.task_id||'',collection_id:restored.collection_id||'',workspace_id:restored.workspace_id,
        title:currentTarget.value?.id===restored.task_id?(currentTarget.value?.title||''):'',estimated_sessions:restored.estimated_sessions||1,focus_seconds:restored.goal_seconds||restored.planned_seconds}:null
      modeKey.value='focus';sessionSeconds.value=journal.session.planned_seconds;timeLeft.value=journal.remaining
      // Restoration never resumes a locally saved countdown. Continue requires a click.
    }
    if(liveOther)mirror(local!)
    if(typeof BroadcastChannel!=='undefined'){
      try{channel=new BroadcastChannel(`focus:${owner}`);channel.onmessage=event=>mirror(event.data)}catch{channel=undefined}
    }
    if(typeof window!=='undefined'){window.addEventListener('storage',storageChanged);window.addEventListener('online',visibility);window.addEventListener('pagehide',pagehide)}
    if(typeof document!=='undefined')document.addEventListener('visibilitychange',visibility)
    void sync()
  }
  function shutdown() {
    if(!initialized)return
    if(!remote.value&&modeKey.value==='focus')journal?.checkpoint()
    void flushJournal();publish();stopClock();channel?.close();channel=undefined;initialized=false;epoch++;syncing=false;isRunning.value=false;deadline=null;remote.value=false
    if(typeof window!=='undefined'){window.removeEventListener('storage',storageChanged);window.removeEventListener('online',visibility);window.removeEventListener('pagehide',pagehide)}
    if(typeof document!=='undefined')document.removeEventListener('visibilitychange',visibility)
    if(typeof document!=='undefined')document.title=originalTitle
  }
  watch(()=>auth.user?.id,(uid,previous)=>{if(uid!==previous&&initialized){if(!remote.value){journal?.end();void flushJournal()}shutdown();if(uid)init()} })
  watch(()=>settings.pomodoroDurations,value=>{
    durations.value=normalizeDurations(value)
    if(!isRunning.value&&!remote.value&&journal?.session?.status!=='paused'){sessionSeconds.value=planned();timeLeft.value=sessionSeconds.value}
  })
  return {durations,modeKey,sessionSeconds,timeLeft,isRunning,currentTarget,queuedTarget,remote,starting,clearing,error,errorCode,errorMessageKey,capability,provisional,
    completionSequence,lastCompletedMode,syncSequence,taskStatsSequence,activeSession,formattedTime,progressPercentage,canReset,nextMode,
    init,shutdown,sync,startTimer,pauseTimer,resetTimer,setMode,advanceMode,configure,focusOn,forgetTask,completedTask,updateTarget,cancelQueued,clearFocus,
    toggleTimer:()=>remote.value?startTimer(true):isRunning.value?pauseTimer():startTimer()}
})
