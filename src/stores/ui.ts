// src/stores/ui.ts
import { defineStore } from 'pinia'
import { ref, onScopeDispose } from 'vue'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
  duration?: number
  pending?: boolean
  action?: { label:string;run:()=>Promise<void>|void }
  group?: string
  undo?: Array<()=>Promise<void>>
  describe?: (count:number)=>string
}

export const useUIStore = defineStore('ui', () => {
  // ==========================================
  // 🍞 TOAST NOTIFICATION SİSTEMİ
  // ==========================================
  const toasts = ref<Toast[]>([])
  const undoKeys=new WeakMap<()=>Promise<void>,string>()
  const timers=new Map<string,{handle?:ReturnType<typeof setTimeout>;remaining:number;started:number;paused:Set<string>}>()
  function scheduleToast(id:string,duration:number){
    const previous=timers.get(id)
    if(previous?.handle)clearTimeout(previous.handle)
    const timer={remaining:duration,started:Date.now(),paused:previous?.paused || new Set<string>(),handle:undefined as ReturnType<typeof setTimeout>|undefined}
    timers.set(id,timer)
    if(!timer.paused.size)timer.handle=setTimeout(()=>removeToast(id),duration)
  }
  function pauseToast(id:string,reason='pointer'){
    const timer=timers.get(id);if(!timer)return
    if(!timer.paused.size){if(timer.handle)clearTimeout(timer.handle);timer.remaining=Math.max(0,timer.remaining-(Date.now()-timer.started))}
    timer.paused.add(reason)
  }
  function resumeToast(id:string,reason='pointer'){
    const timer=timers.get(id);if(!timer)return
    timer.paused.delete(reason)
    if(!timer.paused.size){timer.started=Date.now();if(timer.handle)clearTimeout(timer.handle);timer.handle=setTimeout(()=>removeToast(id),timer.remaining)}
  }

  const addToast = (message: string, type: Toast['type'] = 'info', duration = 3000) => {
    // Benzersiz bir ID oluşturuyoruz
    const id = Math.random().toString(36).substring(2, 9)
    toasts.value.push({ id, message, type, duration })

    // Süre dolunca bildirimi otomatik kaldır
    scheduleToast(id,duration)
    return id
  }

  const removeToast = (id: string) => {
    const timer=timers.get(id);if(timer?.handle)clearTimeout(timer.handle);timers.delete(id)
    toasts.value = toasts.value.filter(t => t.id !== id)
  }
  function addUndoToast(describe:(count:number)=>string,label:string,run:()=>Promise<void>,group:string,key?:string){
    if(key)undoKeys.set(run,key)
    let toast=toasts.value.find(item=>item.group===group&&!item.pending)
    if(!toast){const id=addToast(describe(1),'info',10000);toast=toasts.value.find(item=>item.id===id)!;toast.group=group;toast.undo=[];toast.describe=describe}
    toast.undo!.push(run);toast.message=describe(toast.undo!.length)
    toast.action={label,run:async()=>{
      for(const undo of [...toast!.undo!].reverse()){
        await undo();const index=toast!.undo!.indexOf(undo);if(index>=0)toast!.undo!.splice(index,1)
      }
    }}
    scheduleToast(toast.id,10000)
  }
  function clearUndoToasts(){for(const toast of [...toasts.value])if(toast.undo)removeToast(toast.id)}
  function discardUndo(key:string){
    for(const toast of [...toasts.value])if(toast.undo){toast.undo=toast.undo.filter(undo=>undoKeys.get(undo)!==key);if(!toast.undo.length)removeToast(toast.id);else toast.message=toast.describe!(toast.undo.length)}
  }
  async function runToastAction(id:string){
    const toast=toasts.value.find(item=>item.id===id)
    if(!toast?.action || toast.pending)return
    toast.pending=true;pauseToast(id,'action')
    try{await toast.action.run();removeToast(id)}
    catch{if(toast.undo?.length)toast.message=toast.describe!(toast.undo.length)}
    finally{toast.pending=false;resumeToast(id,'action')}
  }
  onScopeDispose(()=>{for(const timer of timers.values())if(timer.handle)clearTimeout(timer.handle);timers.clear()})

  // ==========================================
  // 🛑 CONFIRM MODAL SİSTEMİ
  // ==========================================
  const confirmState = ref({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    resolvePromise: null as ((value: boolean) => void) | null,
  })

  // Bu fonksiyon bir Promise döndürür, böylece await ile bekleyebiliriz!
  // Örn: const isConfirmed = await showConfirm("Sil?", "Emin misin?")
  const showConfirm = (title: string, message: string, confirmText = 'Confirm', cancelText = 'Cancel'): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmState.value = {
        isOpen: true,
        title,
        message,
        confirmText,
        cancelText,
        resolvePromise: resolve
      }
    })
  }

  const resolveConfirm = (result: boolean) => {
    if (confirmState.value.resolvePromise) {
      confirmState.value.resolvePromise(result)
    }
    confirmState.value.isOpen = false
  }

  return {
    toasts,
    addToast,
    removeToast,
    addUndoToast, clearUndoToasts, discardUndo, pauseToast, resumeToast, runToastAction,
    confirmState,
    showConfirm,
    resolveConfirm
  }
})
