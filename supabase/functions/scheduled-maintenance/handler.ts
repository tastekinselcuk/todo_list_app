import {verifyMaintenanceTicket} from './auth.ts'
export type EmailClaim = { id: string; lease: string; payload: { to: string; title: string; notes: string; workspaceName: string; reminderTime: string } }
export type RunStatus = { succeeded: boolean; emails_sent: number; emails_failed: number; mail_configured: boolean; cleanup_succeeded: boolean }
export interface MaintenanceDependencies {
 secret: string
 mailConfigured: boolean
 consumeTicket(id:string,issued:number):Promise<boolean>
 claim(): Promise<EmailClaim[]>
 send(key: string, message: EmailClaim['payload']): Promise<void>
 finish(id: string, lease: string, success: boolean): Promise<void>
 cleanup(): Promise<void>
 record(status: RunStatus): Promise<void>
}
export function maintenanceHandler(deps: MaintenanceDependencies) {
 return async (request: Request) => {
  const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||''
  const ticket=await verifyMaintenanceTicket(token,deps.secret)
  if(!ticket)return new Response('Unauthorized',{status:401})
  if(request.method!=='POST')return new Response('Method not allowed',{status:405})
  // This endpoint never accepts user IDs, file paths or delivery addresses.
  if(request.body){const reader=request.body.getReader();let size=0
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2){await reader.cancel();return new Response('Invalid request',{status:400})}}}finally{reader.releaseLock()}
  }
  try{if(!await deps.consumeTicket(ticket.id,ticket.issued))return new Response('Ticket already used',{status:409})}
  catch{return new Response('Ticket verification unavailable',{status:503})}
  const status:RunStatus={succeeded:true,emails_sent:0,emails_failed:0,mail_configured:deps.mailConfigured,cleanup_succeeded:false}
  try{await deps.cleanup();status.cleanup_succeeded=true}catch{status.succeeded=false}
  if(deps.mailConfigured)try{
   const claims=await deps.claim()
   for(const claim of claims.slice(0,20)){
    try{await deps.send(`periodic/${claim.id}`,claim.payload);await deps.finish(claim.id,claim.lease,true);status.emails_sent++}
    catch{status.emails_failed++;status.succeeded=false;try{await deps.finish(claim.id,claim.lease,false)}catch{/* The lease expires and permits retry. */}}
   }
  }catch{status.succeeded=false}
  try{await deps.record(status)}catch{status.succeeded=false}
  return Response.json(status,{status:status.succeeded?200:503,headers:{'Cache-Control':'no-store'}})
 }
}
