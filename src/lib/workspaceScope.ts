import { defineStore, getActivePinia, type StoreGeneric } from 'pinia'
import { ref, computed, watch, onScopeDispose, getCurrentScope, inject, onMounted, onActivated, onDeactivated, type InjectionKey, type Ref } from 'vue'
import { supabase } from './supabase'
import { useWorkspacesStore } from '@/stores/workspaces'
import { tableModules } from './sharing'
import { readStorage, writeStorage, storageKeys, readStoredJSON, writeStoredJSON } from './storage'
import { moduleTableOwners } from './moduleCatalog'
import { moveToTrash, trashTables, onTrashChange, type TrashModule } from './workspaceTrash'

const scopedStores = new Set<StoreGeneric>()

// Retired store closures may finish pending writes, but cannot change a new workspace's state.
export function disposeWorkspaceStores() {
  const pinia = getActivePinia()
  for (const store of scopedStores) {
    store.$dispose()
    if (pinia) delete pinia.state.value[store.$id]
  }
  scopedStores.clear()
}

export function defineWorkspaceStore<T extends Record<string, unknown>>(id: string, setup: () => T) {
  return () => {
    const workspaces = useWorkspacesStore()
    if (!workspaces.activeId || !workspaces.userId) throw new Error('Select a workspace first')
    const useStore = defineStore(`${id}:${workspaces.sessionKey}`, setup)
    const store = useStore()
    scopedStores.add(store as unknown as StoreGeneric)
    return store
  }
}

const owners = moduleTableOwners
export function useModuleAccess(module: string) {
  const workspaces = useWorkspacesStore()
  return { canWrite: computed(() => workspaces.binding?.(module)?.role !== 'viewer') }
}

// Capture the workspace once per store/component, including writes after an awaited dialog.
export function useWorkspaceClient() {
  const workspaces = useWorkspacesStore()
  const userId = workspaces.userId
  const workspaceId = workspaces.activeId
  const sessionKey = workspaces.sessionKey
  const capturedBindings = new Map(Object.entries(tableModules).map(([table, module]) => [table, workspaces.binding(module)]))
  const versions = new Map<string, number>()
  function assertCurrent() {
    if (!userId || !workspaceId || workspaces.sessionKey !== sessionKey) {
      throw new Error('Workspace changed; reopen the item to continue')
    }
  }
  function assertWritable(module: string) {
    assertCurrent()
    if (workspaces.binding(module, workspaceId)?.role === 'viewer') throw new Error('READ_ONLY')
  }
  function trackReads(table:string,builder:any):any {
    return new Proxy(builder,{get(target,property){
      if(property==='then')return(resolve:any,reject:any)=>Promise.resolve(target).then(result=>{
        for(const row of Array.isArray(result.data)?result.data:result.data?[result.data]:[])
          if(row.id&&row.version!==undefined)versions.set(`${table}:${row.id}`,row.version)
        return result
      }).then(resolve,reject)
      const value=Reflect.get(target,property)
      return typeof value==='function'?(...args:unknown[])=>{const next=value.apply(target,args);return trackReads(table,next)}:value
    }})
  }
  function softDelete(table:string,announce=true){
    const module=tableModules[table] as TrashModule,snapshot=new Map(versions)
    let id='',version:number|undefined,single=false
    const query={
      eq(column:string,value:unknown){if(column==='id')id=String(value);if(column==='version')version=Number(value);return query},
      select(){return query},single(){single=true;return query},maybeSingle(){single=true;return query},
      then(resolve:any,reject:any){return (async()=>{
        try{assertWritable(module);if(!id)throw Error('INVALID_TRASH_INPUT')
          const row=await moveToTrash(workspaceId,module,id,version??snapshot.get(`${table}:${id}`)!,userId,announce)
          return {data:single?row:[row],error:null}
        }catch(error){return {data:null,error}}
      })().then(resolve,reject)}
    }
    return query
  }
  const supportsTrash=(table:string)=>!!trashTables[table]
  function personalRead(table:string,builder:any){return trackReads(table,builder)}
  return {
    trash(module:TrashModule,id:string,version:number){assertWritable(module);return moveToTrash(workspaceId,module,id,version,userId)},
    canWrite(module: string) { return workspaces.binding(module, workspaceId)?.role !== 'viewer' },
    collection(module: string) { return workspaces.binding(module, workspaceId)?.collection_id },
    timezone(module: string) { return workspaces.binding(module, workspaceId)?.timezone },
    async sealVault(sessionId: string, previousHash: string, metadata: string, notes: Record<string, unknown>[], version: number, name: string) {
      assertWritable('secure')
      const result = await supabase.rpc('seal_vault', { sid: sessionId, previous_hash: previousHash, metadata, notes, expected_version: version, new_name: name })
      assertCurrent()
      if (result.error) throw result.error
      versions.set(`password_sessions:${sessionId}`, result.data.version)
      return result.data
    },
    async rolloverPlans() {
      assertCurrent()
      const cid = capturedBindings.get('plans')?.collection_id
      if (!cid) return false
      if (capturedBindings.get('plans')?.role === 'viewer') return true
      const result = await supabase.rpc('rollover_collection_plans', { cid })
      if (result.error) throw result.error
      return true
    },
    async mutateItem(module: string, parentId: string, operation: string, item: Record<string, unknown>, version?: number) {
      assertWritable(module)
      const cid = workspaces.binding(module, workspaceId)?.collection_id
      if (!cid) throw new Error('Collection unavailable')
      const result = module === 'workout' && operation === 'reorder'
        ? await supabase.rpc('reorder_workout_exercises', { cid, pid: parentId, ordered_ids: item.ids, expected_version: version ?? null })
        : await supabase.rpc('mutate_collection_item', { cid, pid: parentId, module_id: module, operation, item, expected_version: version ?? null })
      assertCurrent()
      if (result.error) {
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(result.error.message?.includes('SHARING_CONFLICT') ? 'sharing-conflict' : 'sharing-save-error'))
        throw result.error
      }
      const table = Object.entries(tableModules).find(([, id]) => id === module)?.[0]
      if (table && result.data?.version !== undefined) versions.set(`${table}:${parentId}`, Math.max(versions.get(`${table}:${parentId}`) ?? 0, result.data.version))
      return result.data
    },
    async markNotified(taskId: string) {
      assertCurrent()
      const result = await supabase.rpc('mark_member_reminder', { task_id: taskId })
      if (result.error) throw result.error
    },
    async removeCategory(id:string) {
      assertWritable('detailed')
      const version=versions.get(`categories:${id}`)
      if(version===undefined)throw new Error('SHARING_CONFLICT')
      const result=await supabase.rpc('delete_note_category',{wid:workspaceId,category_id:id,expected_version:version})
      assertCurrent()
      if(result.error)throw result.error
      for(const row of result.data?.notes || [])versions.set(`todos:${row.id}`,Math.max(versions.get(`todos:${row.id}`)??0,row.version))
      versions.delete(`categories:${id}`)
      return result.data as {id:string;notes:{id:string;version:number}[]}
    },
    from(table: string) {
      assertCurrent()
      const owner = owners[table]
      if (!owner) throw new Error(`Unscoped workspace table: ${table}`)
      const binding = capturedBindings.get(table)
      if (binding && workspaces.sharingAvailable) {
        const personalReminders = (value: Record<string, unknown>) => {
          if (table !== 'periodic_tasks' || !('notify_browser' in value)) return value
          const { notify_browser, notify_email, reminder_time, ...rest } = value
          return { ...rest, member_notify_browser: notify_browser, member_notify_email: notify_email, member_reminder_time: reminder_time }
        }
        function observed(builder: any, operation: string, expected?: number): any {
          let recordId = ''
          let requestedVersion = expected
          const versionSnapshot = new Map(versions)
          const proxy = new Proxy(builder, {
            get(target, property) {
              if (property === 'then') return (resolve: any, reject: any) => {
                let query = target
                if (operation === 'update' || operation === 'delete') {
                  const version = requestedVersion ?? versionSnapshot.get(`${table}:${recordId}`)
                  if (!recordId || version === undefined) return Promise.resolve({ data: null, error: { code: 'SHARING_CONFLICT', message: 'SHARING_CONFLICT' } }).then(resolve, reject)
                  query = query.eq('version', version)
                }
                return Promise.resolve(query).then(async result => {
                  if (workspaces.sessionKey !== sessionKey) return { data: null, error: { message: 'Workspace changed' } }
                  if (operation === 'update' || operation === 'delete') {
                    if (result.error?.code === 'PGRST116' || (!result.error && (!result.data || (Array.isArray(result.data) && !result.data.length)))) {
                      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sharing-conflict'))
                      return { data: null, error: { code: 'SHARING_CONFLICT', message: 'SHARING_CONFLICT' } }
                    }
                  }
                  for (const row of Array.isArray(result.data) ? result.data : result.data ? [result.data] : []) {
                    if (row.id && row.version !== undefined) versions.set(`${table}:${row.id}`, Math.max(versions.get(`${table}:${row.id}`) ?? 0, row.version))
                  }
                  if (table === 'periodic_tasks' && operation !== 'delete' && !result.error && result.data) {
                    const rows = Array.isArray(result.data) ? result.data : [result.data]
                    if (rows.length) {
                      const prefs = await supabase.from('periodic_member_preferences').select('*').eq('user_id', userId).in('task_id', rows.map((row: any) => row.id))
                      if (prefs.error) return { data: null, error: prefs.error }
                      if (workspaces.sessionKey !== sessionKey) return { data: null, error: { message: 'Workspace changed' } }
                      for (const row of rows) {
                        const pref = prefs.data?.find(p => p.task_id === row.id)
                        Object.assign(row, { notify_browser: pref?.notify_browser ?? false, notify_email: pref?.notify_email ?? false,
                          reminder_time: pref?.reminder_time ?? null, last_notified_at: pref?.last_notified_at ?? null })
                      }
                    }
                  }
                  return result
                }).then(resolve, reject)
              }
              if (property === 'eq') return (column: string, value: unknown) => {
                if (column === owner && value === userId) return proxy
                if (column === 'id') recordId = String(value)
                if (column === 'version') requestedVersion = Number(value)
                const next = target.eq(column, value)
                Object.assign(target, next)
                return proxy
              }
              const value = Reflect.get(target, property)
              if (typeof value !== 'function') return value
              return (...args: unknown[]) => {
                const next = value.apply(target, args)
                Object.assign(target, next)
                return proxy
              }
            },
          })
          return proxy
        }
        return {
          select(columns: string = '*') { return observed(supabase.from(table).select(columns).eq('collection_id', binding.collection_id), 'select') },
          insert(values: Record<string, unknown> | Record<string, unknown>[]) {
            assertWritable(tableModules[table]!)
            const stamp = (value: Record<string, unknown>) => ({ ...personalReminders(value), collection_id: binding.collection_id, workspace_id: binding.origin_workspace_id, [owner]: userId })
            return observed(supabase.from(table).insert(Array.isArray(values) ? values.map(stamp) : stamp(values)), 'insert')
          },
          update(values: Record<string, unknown>) {
            assertWritable(tableModules[table]!)
            if ('collection_id' in values || 'workspace_id' in values || owner in values) throw new Error('Record ownership cannot be changed')
            const { version, ...changes } = values
            return observed(supabase.from(table).update(personalReminders(changes)).eq('collection_id', binding.collection_id).select('*'), 'update', version === undefined ? undefined : Number(version))
          },
          delete(options?:{silent?:boolean}) { assertWritable(tableModules[table]!); return supportsTrash(table)?softDelete(table,!options?.silent):observed(supabase.from(table).delete().eq('collection_id', binding.collection_id).select('*'), 'delete') },
        }
      }
      return {
        select(columns: '*' = '*') { return personalRead(table,supabase.from(table).select(columns).eq('workspace_id', workspaceId).eq(owner, userId)) },
        insert(values: Record<string, unknown> | Record<string, unknown>[]) {
          const stamp = (value: Record<string, unknown>) => ({ ...value, workspace_id: workspaceId, [owner]: userId })
          return personalRead(table,supabase.from(table).insert(Array.isArray(values) ? values.map(stamp) : stamp(values)))
        },
        update(values: Record<string, unknown>) {
          if ('workspace_id' in values || owner in values) throw new Error('Record ownership cannot be changed')
          return personalRead(table,supabase.from(table).update(values).eq('workspace_id', workspaceId).eq(owner, userId).select('*'))
        },
        delete(options?:{silent?:boolean}) { return supportsTrash(table)?softDelete(table,!options?.silent):supabase.from(table).delete().eq('workspace_id', workspaceId).eq(owner, userId) },
      }
    },
    listen(callbacks: Record<string, () => unknown | Promise<unknown>>, busy: () => boolean = () => false) {
      let refreshTimer:ReturnType<typeof setTimeout>|undefined
      const localPending=new Set<string>()
      function flushLocal(){
        if(workspaces.sessionKey!==sessionKey||busy())return
        const modules=[...localPending];localPending.clear()
        void Promise.allSettled(Object.entries(callbacks).filter(([table])=>modules.includes(tableModules[table]!)).map(([,callback])=>Promise.resolve().then(callback)))
      }
      const stopLocal=onTrashChange(change=>{
        if(change.owner!==userId||change.workspace!==workspaceId||workspaces.sessionKey!==sessionKey)return
        localPending.add(change.module)
        if(refreshTimer)clearTimeout(refreshTimer)
        refreshTimer=setTimeout(flushLocal,0)
      })
      if(getCurrentScope()){
        const stopBusy=watch(busy,value=>{if(!value&&localPending.size)flushLocal()})
        onScopeDispose(()=>{stopLocal();stopBusy();if(refreshTimer)clearTimeout(refreshTimer);localPending.clear()})
      }
      if (!workspaces.sharingAvailable || typeof supabase.channel !== 'function') return
      const pending = new Set<string>()
      let running = false
      let stopped = false
      const channels: ReturnType<typeof supabase.channel>[] = []
      async function flush() {
        if (stopped || running || busy() || workspaces.sessionKey !== sessionKey) return
        if (typeof document !== 'undefined' && document.querySelector('[data-shared-editing="true"]')) return
        running = true
        const tables = [...pending]
        pending.clear()
        try { await Promise.allSettled(tables.map(table => callbacks[table]?.())) }
        finally { running = false }
      }
      const ids = new Set<string>()
      for (const table of Object.keys(callbacks)) {
        const binding = capturedBindings.get(table)
        if (!binding || !binding.shared || ids.has(binding.collection_id)) continue
        ids.add(binding.collection_id)
        const channel = supabase.channel(`collection:${binding.collection_id}:${binding.epoch}`, { config: { private: true } })
          .on('broadcast', { event: 'changed' }, ({ payload }) => { if (callbacks[payload.table]) { pending.add(payload.table); void flush() } })
          .subscribe(status => {
            if (status === 'SUBSCRIBED') { Object.keys(callbacks).forEach(table => pending.add(table)); void flush() }
          })
        channels.push(channel)
      }
      if (!channels.length) return
      const timer = setInterval(() => { void flush() }, 800)
      const reconcile = setInterval(() => { Object.keys(callbacks).forEach(table => pending.add(table)); void flush() }, 15_000)
      if (getCurrentScope()) onScopeDispose(() => {
        stopped = true; clearInterval(timer); clearInterval(reconcile)
        channels.forEach(channel => { void supabase.removeChannel(channel) })
      })
    },
  }
}

export function workspaceStorageKey(key: string) {
  const workspaces = useWorkspacesStore()
  const bindings=workspaces.bindings?.[workspaces.activeId] || []
  const modules=key==='todo-app-data'?['detailed','quick','code']
    : /^todo-/.test(key)?['detailed'] : /^quick-/.test(key)?['quick'] : /^code-/.test(key)?['code']
    : /^plans?-/.test(key)?['plans'] : /^subject-/.test(key)?['learning'] : /^(deck|card)-/.test(key)?['flashcards']
    : /^(workout-|routine-(title|day)$)/.test(key)?['workout'] : /^routine-/.test(key)?['periodic']
    : /^activity-/.test(key)?['activities'] : /^pomo-/.test(key)?['pomodoro'] : []
  const root=`workspace:${workspaces.userId}:${workspaces.activeId}:${key}`
  const relevant=bindings.filter(b=>modules.includes(b.module)).map(b=>`${b.module}:${b.collection_id}`).sort()
  const next=`${root}:v2:${relevant.join('|') || 'personal'}`
  if(readStorage(next)===null) {
    const selected=bindings.filter(b=>modules.includes(b.module))
    if(modules.length&&selected.length===modules.length&&selected.every(b=>b.collection_id===b.personal_collection_id&&b.owner_id===workspaces.userId&&b.origin_workspace_id===workspaces.activeId)) {
      const personal=readStorage(`${root}:v2:personal`)
      if(personal!==null){writeStorage(next,personal);return next}
    }
    const oldSignature=bindings.map(b=>`${b.module}:${b.collection_id}`).sort().join('|')
    const candidates=[`${root}${oldSignature?`:${oldSignature}`:''}`,...storageKeys(`${root}:`)]
    for(const previous of new Set(candidates)) {
      if(previous.includes(':v2:'))continue
      const signature=previous===root?[]:previous.slice(root.length+1).split('|')
      const compatible=relevant.length?relevant.every(part=>signature.includes(part))
        : modules.length?signature.length===0:signature.every(part=>oldSignature.split('|').includes(part))
      if(!compatible)continue
      const saved=readStorage(previous)
      if(saved!==null){writeStorage(next,saved);break}
    }
  }
  return next
}

export function useWorkspaceDraft<T>(key: string, initial: T): Ref<T> {
  const storageKey = workspaceStorageKey(key)
  const value = readStoredJSON(storageKey, initial, saved =>
    initial === null ? saved === null : Array.isArray(initial) ? Array.isArray(saved)
      : typeof saved === typeof initial && saved !== null && !Array.isArray(saved))
  const draft = ref(value) as Ref<T>
  watch(draft, next => {
    writeStoredJSON(storageKey, next)
  }, { deep: true, flush: 'sync' })
  return draft
}


export const moduleLoadKey: InjectionKey<(delta: number) => void> = Symbol('workspace-module-load')

/** Load once on first mount, then once per reactivation, including async children. */
export function useModuleLoad(load: () => unknown) {
  const pending = inject(moduleLoadKey, null)
  let active = false
  let inFlight: Promise<unknown> | undefined
  function activate() {
    if (active) return
    active = true
    if (inFlight) return inFlight
    pending?.(1)
    inFlight = Promise.resolve().then(load).finally(() => { pending?.(-1); inFlight = undefined })
    return inFlight
  }
  onMounted(activate)
  onActivated(activate)
  onDeactivated(() => { active = false })
}
