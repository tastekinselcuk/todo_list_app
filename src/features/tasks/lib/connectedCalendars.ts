import { computed, ref } from 'vue'
export interface ConnectedCalendar {id:string;name:string;color:string;selected:boolean}
export interface CalendarConnection {id:string;provider:'outlook';label:string;status:'connected'|'reauth';updated_at:string;calendars:ConnectedCalendar[]}
export interface ConnectedEvent {id:string;source_id:string;calendar_name:string;color:string;title:string;private:boolean;start:string;end:string;allDay:boolean;location:string;url:string|null}
type CalendarRequest=(body:Record<string,unknown>)=>Promise<any>
export function calendarReturn(value:string){const url=new URL(value);const status=url.searchParams.get('calendar_connection');return status&&['connected','cancelled','failed'].includes(status)?status:null}
export function createConnectedCalendars(request:CalendarRequest,current:()=>boolean){
 const connections=ref<CalendarConnection[]>([]),events=ref<ConnectedEvent[]>([]),configured=ref(false),loading=ref(false),busy=ref(false),error=ref(''),eventError=ref(''),loadingEvents=ref(false)
 const selected=computed(()=>connections.value.flatMap(connection=>connection.calendars).filter(calendar=>calendar.selected).map(calendar=>calendar.id))
 let generation=0,metadataGeneration=0,range={start:'',end:''},flight:Promise<void>|undefined,lastKey=''
 function invalidate(){generation++;events.value=[];lastKey='';flight=undefined;loadingEvents.value=false}
 function apply(data:any){if(!Array.isArray(data?.connections))throw Error('UNAVAILABLE');connections.value=data.connections;if(typeof data.configured==='boolean')configured.value=data.configured}
 async function load(){const version=++metadataGeneration;loading.value=true;error.value='';try{const data=await request({action:'list'});if(current()&&version===metadataGeneration)apply(data)}catch(failure){if(current()&&version===metadataGeneration)error.value=(failure as Error).message}finally{if(version===metadataGeneration)loading.value=false}}
 async function loadEvents(start=range.start,end=range.end,force=false):Promise<void>{
  range={start,end};const key=JSON.stringify([start,end,selected.value]);
  if(!current())return;
  if(key===lastKey&&!force){if(flight)await flight;return}
  const version=++generation;lastKey=key;events.value=[];eventError.value='';loadingEvents.value=false;
  if(!configured.value||!start||!end||!selected.value.length)return;
  loadingEvents.value=true;
  const task=(async()=>{try{const data=await request({action:'events',start,end});if(current()&&version===generation){events.value=Array.isArray(data.events)?data.events:[];eventError.value=data.issues?.[0]||''}}
   catch(failure){if(current()&&version===generation){eventError.value=(failure as Error).message;lastKey=''}}finally{if(version===generation){loadingEvents.value=false;flight=undefined}}})();flight=task;await task;
 }
 async function mutate(action:'select'|'sync'|'disconnect',payload:Record<string,unknown>){
  if(busy.value||!current())return;busy.value=true;error.value='';const mutationVersion=++metadataGeneration;
  // A removed selection/account cannot leave its old event response on screen.
  invalidate();
  try{const data=await request({action,...payload});if(current()&&mutationVersion===metadataGeneration){apply(data);await loadEvents(range.start,range.end,true)}}catch(failure){if(current()&&mutationVersion===metadataGeneration){error.value=(failure as Error).message;await loadEvents(range.start,range.end,true)}}finally{busy.value=false}
 }
 function suspend(){metadataGeneration++;loading.value=false;invalidate()}
 function reset(){suspend();connections.value=[];configured.value=false;error.value='';eventError.value='';busy.value=false;loading.value=false}
 return {connections,events,configured,loading,busy,error,eventError,loadingEvents,selected,load,loadEvents,mutate,invalidate,suspend,reset}
}
