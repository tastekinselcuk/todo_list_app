interface CleanupDependencies {
 secret:string
 purge:()=>Promise<number>
 images:(ack?:string[])=>Promise<string[]>
 remove:(paths:string[])=>Promise<void>
}
/** Scheduled server work only. Never accepts paths, table names or user IDs from callers. */
export function trashCleanupHandler(deps:CleanupDependencies){
 return async(request:Request)=>{
  const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'') || ''
  if(!deps.secret || token.length!==deps.secret.length)return new Response('Unauthorized',{status:401})
  let difference=0;for(let i=0;i<token.length;i++)difference|=token.charCodeAt(i)^deps.secret.charCodeAt(i)
  if(difference)return new Response('Unauthorized',{status:401})
  if(request.method!=='POST')return new Response('Method not allowed',{status:405})
  try{
   const purged=await deps.purge(),paths=await deps.images()
   if(paths.length){await deps.remove(paths);await deps.images(paths)}
   return Response.json({purged,images:paths.length})
  }catch{return Response.json({error:'CLEANUP_FAILED'},{status:500})}
 }
}
