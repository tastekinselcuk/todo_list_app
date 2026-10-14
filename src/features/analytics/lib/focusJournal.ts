export type FocusStatus = 'running' | 'paused' | 'completed' | 'ended'
export interface FocusSession {
  id: string; workspace_id: string; started_at: string; planned_seconds: number
  revision: number; status: FocusStatus; segments: [string, string][]
  association?: 'free' | 'task'; task_id?: string | null; collection_id?: string | null
  estimated_sessions?: number; goal_seconds?: number; client_id?: string; lease?: string
}
interface ActiveSession { session: FocusSession; openStart: number | null; deadline: number | null }
// PostgreSQL returns microseconds; Date.parse alone truncates them to milliseconds.
// Epoch microseconds remain exact safe integers for the dates used by this app.
export function focusTimestampMicros(value:string):number {
  if(typeof value!=='string')return NaN
  const milliseconds=Date.parse(value)
  const fraction=value.match(/\.(\d+)(?:Z|[+-]\d{2}(?::?\d{2})?)$/i)?.[1]||''
  return milliseconds*1000+Number(fraction.padEnd(6,'0').slice(3,6))
}
export function focusElapsedMilliseconds(session:Pick<FocusSession,'segments'>):number {
  return session.segments.reduce((sum,[a,b])=>sum+focusTimestampMicros(b)-focusTimestampMicros(a),0)/1000
}
export function validFocusSession(value:unknown):value is FocusSession {
  if(!value||typeof value!=='object')return false
  const session=value as FocusSession
  if(typeof session.id!=='string'||!session.id||typeof session.workspace_id!=='string'||!session.workspace_id||typeof session.started_at!=='string'||!Number.isFinite(Date.parse(session.started_at))
    ||!Number.isInteger(session.planned_seconds)||session.planned_seconds<60||session.planned_seconds>5400
    ||!Number.isInteger(session.revision)||session.revision<1||!['running','paused','completed','ended'].includes(session.status)
    ||!Array.isArray(session.segments)||session.segments.length>1000)return false
  let end=focusTimestampMicros(session.started_at),elapsed=0
  for(const part of session.segments) {
    if(!Array.isArray(part)||part.length!==2||part.some(v=>typeof v!=='string'))return false
    const a=focusTimestampMicros(part[0]),b=focusTimestampMicros(part[1])
    if(!Number.isFinite(a)||!Number.isFinite(b)||a<end||b<a)return false
    elapsed+=b-a;end=b
  }
  return elapsed<=session.planned_seconds*1_000_000+1_000_000&&
    (session.status!=='completed'||elapsed>=(session.planned_seconds-1)*1_000_000)
}
// Repair only the old browser's sub-millisecond boundary truncation. Trim elapsed
// time, never add any, keep the frozen start/target, and retain unrecoverable data.
export function recoverFocusSession(value:unknown):FocusSession|null {
  if(validFocusSession(value))return value
  if(!value||typeof value!=='object')return null
  const original=value as FocusSession
  if(!Array.isArray(original.segments)||original.segments.length>1000||typeof original.started_at!=='string')return null
  let boundary=focusTimestampMicros(original.started_at),changed=false
  if(!Number.isFinite(boundary))return null
  const segments:[string,string][]=[]
  for(const part of original.segments){
    if(!Array.isArray(part)||part.length!==2||part.some(v=>typeof v!=='string'))return null
    let [start,finish]=part,a=focusTimestampMicros(start),b=focusTimestampMicros(finish)
    if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return null
    if(a<boundary){
      if(boundary-a>=1000||Date.parse(start)!==Math.floor(boundary/1000))return null
      start=segments[segments.length-1]?.[1]||original.started_at;a=boundary;changed=true
    }
    if(b<a){if(a-b>=1000)return null;changed=true;continue}
    segments.push([start,finish]);boundary=b
  }
  if(!changed)return null
  const session={...original,segments,revision:original.revision+1}
  if(session.status==='completed'&&focusElapsedMilliseconds(session)<(session.planned_seconds-1)*1000)session.status='ended'
  return validFocusSession(session)?session:null
}
export interface JournalStorage {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

// Each outbox record has its own key. Other tabs cannot overwrite this tab's
// pending sessions. The server handles duplicate uploads and stale revisions.
export class FocusJournal {
  private active: ActiveSession | null = null
  private inFlight: Promise<void> | null = null
  private memory = new Map<string, FocusSession>()
  storageFailed = false
  lastSyncError = ''
  private prefix: string
  private activeKey: string
  constructor(owner: string, private storage: JournalStorage, tab: string,
    private write: (session: FocusSession) => Promise<void>, private now = () => Date.now(),
    private uuid = () => crypto.randomUUID()) {
    this.prefix = `analytics-focus:${owner}:outbox:`
    this.activeKey = `analytics-focus:${owner}:active:${tab}`
    this.checkStorage()
    let stored:string|null=null
    try {stored=storage.getItem(this.activeKey)} catch {this.storageFailed=true}
    if(stored){
      try{
        const value=JSON.parse(stored) as ActiveSession,session=recoverFocusSession(value.session)
        if(session&&(value.openStart===null||Number.isFinite(value.openStart))&&(value.deadline===null||Number.isFinite(value.deadline))){
          this.active={...value,session}
          if(session!==value.session){
            // A legacy running pointer still contains the truncated openStart.
            // Pause its repaired snapshot; resume creates a fresh safe boundary.
            if(session.status==='running'){session.status='paused';this.active.openStart=null;this.active.deadline=null}
            this.persist()
          }
        }
      }catch{/* Malformed JSON is not a browser storage-access failure. Keep the original. */}
    }
  }
  get session() { return this.active?.session || null }
  get deadline() { return this.active?.deadline || null }
  get remaining() {
    if (!this.active) return 0
    if (this.active.deadline !== null) return Math.max(0, Math.ceil((this.active.deadline - this.now()) / 1000))
    return Math.max(0, Math.ceil(this.active.session.planned_seconds - focusElapsedMilliseconds(this.active.session)/1000))
  }
  checkStorage(){
    const key=this.activeKey+':storage-probe'
    try{
      this.storage.setItem(key,'1')
      if(this.storage.getItem(key)!=='1')throw Error('STORAGE_UNAVAILABLE')
      this.storage.removeItem(key)
      // A tiny probe can succeed while a full pending record exceeds quota.
      // Retry durable pending records before declaring that storage recovered.
      for(const session of this.memory.values()){
        let saved:FocusSession|null=null
        try{saved=JSON.parse(this.storage.getItem(this.prefix+session.id)||'null')}catch{/* Preserve/repair only this known record. */}
        if(!saved||saved.revision<session.revision)this.storage.setItem(this.prefix+session.id,JSON.stringify(session))
      }
      if(this.active)this.storage.setItem(this.activeKey,JSON.stringify(this.active))
      this.storageFailed=false
    }catch{this.storageFailed=true}
  }
  private persist() {
    if (!this.active) return
    const session = JSON.parse(JSON.stringify(this.active.session)) as FocusSession
    this.memory.set(session.id,session)
    try {
      this.storage.setItem(this.prefix+session.id,JSON.stringify(session))
      this.storage.setItem(this.activeKey,JSON.stringify(this.active))
      this.storageFailed = false
    } catch { this.storageFailed = true }
  }
  start(workspaceId: string, plannedSeconds: number, seed: Partial<FocusSession> = {}) {
    if (this.active?.session.status === 'paused') {
      const session=this.active.session,elapsed=focusElapsedMilliseconds(session)
      const lastEnd=focusTimestampMicros(session.segments[session.segments.length-1]?.[1]||session.started_at)
      this.active.openStart=Math.max(this.now(),Math.ceil(lastEnd/1000)); this.active.deadline=this.active.openStart+Math.max(0,session.planned_seconds*1000-elapsed)
      this.active.session.status='running'; this.active.session.revision++
    } else {
      this.active={ session: { ...seed, id:seed.id || this.uuid(), workspace_id:workspaceId, started_at:seed.started_at || new Date(this.now()).toISOString(),
        planned_seconds:plannedSeconds,revision:1,status:'running',segments:[] },openStart:this.now(),deadline:this.now()+plannedSeconds*1000 }
    }
    this.persist()
    return this.deadline!
  }
  adopt(session: FocusSession) {
    const recovered=recoverFocusSession(session)
    if(!recovered)throw Error('INVALID_FOCUS_SESSION')
    this.active = { session: JSON.parse(JSON.stringify(recovered)), openStart: null, deadline: null }
    // A resumed owner starts a new segment; a prior running segment was closed by the server.
    this.active.session.status = 'paused'
    this.active.session.revision++
    this.persist()
  }
  // Restore saved checkpoints without counting time while the page was absent.
  // pagehide normally saves a precise pause; this also covers interrupted unloads.
  restorePaused() {
    if(!this.active||this.active.session.status!=='running')return
    this.active.session.status='paused';this.active.session.revision++
    this.active.openStart=null;this.active.deadline=null;this.persist()
  }
  // Discard a local ownership pointer without closing another device's session.
  abandon() {
    this.active=null
    try {this.storage.removeItem(this.activeKey)} catch {this.storageFailed=true}
  }
  checkpoint() {
    if (!this.active || this.active.openStart===null || this.active.deadline===null) return
    const end=Math.max(this.active.openStart,Math.min(this.now(),this.active.deadline))
    const start=new Date(this.active.openStart).toISOString(), finish=new Date(end).toISOString()
    const segments=this.active.session.segments
    if (segments[segments.length-1]?.[0]===start) segments[segments.length-1]=[start,finish]
    else segments.push([start,finish])
    if (this.now()>=this.active.deadline) {
      this.active.session.status='completed';this.active.deadline=null;this.active.openStart=null
    }
    this.active.session.revision++;this.persist()
  }
  pause() {
    this.checkpoint()
    if (!this.active || this.active.session.status==='completed') return
    this.active.session.status='paused';this.active.openStart=null;this.active.deadline=null
    this.active.session.revision++;this.persist()
  }
  end() {
    this.checkpoint()
    if (this.active && !['completed','ended'].includes(this.active.session.status)) {
      this.active.session.status='ended';this.active.openStart=null;this.active.deadline=null
      this.active.session.revision++;this.persist()
    }
    this.active=null
    try {this.storage.removeItem(this.activeKey)} catch {this.storageFailed=true}
  }
  pending() {
    const merged=new Map(this.memory)
    for(const [id,value] of merged){const recovered=recoverFocusSession(value);if(recovered&&recovered!==value){merged.set(id,recovered);this.memory.set(id,recovered)}}
    try {
      for(let i=0;i<this.storage.length;i++) {
        const key=this.storage.key(i)
        if (!key?.startsWith(this.prefix)) continue
        let value:unknown
        try {value=JSON.parse(this.storage.getItem(key) || 'null')} catch {continue}
        const recovered=recoverFocusSession(value)
        if(recovered&&(!merged.has(recovered.id)||merged.get(recovered.id)!.revision<recovered.revision)){
          merged.set(recovered.id,recovered)
          if(recovered!==value){this.memory.set(recovered.id,recovered);try{this.storage.setItem(key,JSON.stringify(recovered))}catch{this.storageFailed=true}}
        }
      }
    } catch {this.storageFailed=true}
    return [...merged.values()]
  }
  flush() {
    if (this.inFlight) return this.inFlight
    this.inFlight=(async()=>{
      this.checkStorage();this.lastSyncError=''
      for(const session of this.pending()) {
        try {
          await this.write(session)
          if (this.memory.get(session.id)?.revision===session.revision) this.memory.delete(session.id)
          let stored:string|null=null
          try{stored=this.storage.getItem(this.prefix+session.id)}catch{this.storageFailed=true}
          let saved:FocusSession|null=null
          try{saved=JSON.parse(stored||'null')}catch{/* Preserve malformed data rather than claim storage is blocked. */}
          if(saved&&saved.id===session.id&&saved.revision<=session.revision){try{this.storage.removeItem(this.prefix+session.id)}catch{this.storageFailed=true}}
        } catch(failure) {
          const message=failure&&typeof failure==='object'&&'message' in failure?String(failure.message):'SYNC_FAILED'
          this.lastSyncError=message
          // Keep the rejected record, but do not starve valid sessions behind it.
          if(/INVALID_FOCUS_SESSION|FOCUS_SESSION_FORBIDDEN|FOCUS_TARGET_IMMUTABLE|WORKSPACE_FORBIDDEN/.test(message))continue
          break // Network/auth failures wait for reconnection rather than flooding requests.
        }
      }
    })().finally(()=>{this.inFlight=null})
    return this.inFlight
  }
}
