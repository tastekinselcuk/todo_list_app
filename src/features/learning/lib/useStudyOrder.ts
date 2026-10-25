import { computed,nextTick,onBeforeUnmount,onMounted,ref,watch,type Ref } from 'vue'

export function useStudyOrder<T extends {id:string},C>(source:()=>T[],locked:()=>boolean,capture:()=>C,save:(ids:string[],context:C)=>Promise<boolean>){
 const ordered=ref([...source()]) as Ref<T[]>,dragging=ref(false),saving=ref(false),reducedMotion=ref(false),announcement=ref<'saved'|'failed'|''>('')
 const blocked=computed(()=>locked()||saving.value)
 let context:{ids:string[];value:C}|undefined,motion:MediaQueryList|undefined
 const sync=()=>{ordered.value=[...source()]}
 watch(source,()=>{if(!dragging.value&&!saving.value)sync()})
 function start(){dragging.value=true;context={ids:ordered.value.map(item=>item.id),value:capture()}}
 async function persist(ids:string[],value:C){
  if(blocked.value){sync();return}
  saving.value=true;announcement.value=''
  try{announcement.value=await save(ids,value)?'saved':'failed'}finally{saving.value=false;sync()}
 }
 async function finish(){
  const original=context;context=undefined;await nextTick();dragging.value=false
  const ids=ordered.value.map(item=>item.id)
  if(!original||ids.every((id,i)=>id===original.ids[i])){sync();return}
  await persist(ids,original.value)
 }
 async function move(id:string,direction:number){
  if(blocked.value||dragging.value)return
  const ids=ordered.value.map(item=>item.id),index=ids.indexOf(id),to=index+direction
  if(index<0||to<0||to>=ids.length)return
  ids.splice(to,0,ids.splice(index,1)[0]!)
  await persist(ids,capture())
 }
 const updateMotion=()=>{reducedMotion.value=Boolean(motion?.matches)}
 onMounted(()=>{motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');updateMotion();motion?.addEventListener('change',updateMotion)})
 onBeforeUnmount(()=>motion?.removeEventListener('change',updateMotion))
 return {ordered,dragging,saving,blocked,reducedMotion,announcement,start,finish,move}
}
