export type ClientErrorCode='UI_RENDER_ERROR'|'SCRIPT_ERROR'|'UNHANDLED_PROMISE'
interface ReporterDependencies {
 send(code:ClientErrorCode,screen:string,release:string):Promise<unknown>
 screen():string
 release:string
 now?:()=>number
}
/** Intentionally accepts no error object, URL, stack, user ID or note content. */
export function createErrorReporter(deps:ReporterDependencies){
 const sent=new Map<string,number>(),now=deps.now||Date.now
 let inFlight=false
 return async(code:ClientErrorCode)=>{
  const screen=deps.screen(),timestamp=now(),key=code+':'+screen
  if(inFlight||(sent.has(key)&&timestamp-sent.get(key)!<60000))return
  sent.set(key,timestamp);inFlight=true
  try{await deps.send(code,screen,deps.release)}catch{/* Reporting must never break the application or recurse. */}
  finally{inFlight=false}
 }
}
