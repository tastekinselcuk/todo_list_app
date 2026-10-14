import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useWorkspacesStore } from '@/stores/workspaces'

const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const pathPattern=new RegExp(`^${uuid}/${uuid}/${uuid}\\.(?:webp|png|jpe?g|gif)$`,'i')
export const noteImageBucket='note-images'
export function validNoteImagePath(path:string){return pathPattern.test(path)}
export function safeNoteImageSource(source:string){
 if(/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z\d+/=\s]+$/i.test(source))return source
 try{const url=new URL(source);return ['http:','https:'].includes(url.protocol) && !url.username && !url.password?url.href:null}catch{return null}
}

// Signed links remain in memory and never become part of a saved note.
const signed=new Map<string,{url:string;until:number}>()
const pending=new Map<string,Map<string,{resolve:(url:string)=>void;reject:(error:unknown)=>void}[]>>()
export function resolveNoteImage(path:string,force=false):Promise<string>{
 const owner=useAuthStore().user?.id
 if(!owner || !validNoteImagePath(path))return Promise.reject(Error('imageUnavailable'))
 const key=owner+':'+path,cached=signed.get(key)
 if(!force && cached && cached.until>Date.now())return Promise.resolve(cached.url)
 return new Promise((resolve,reject)=>{
  let batch=pending.get(owner)
  if(!batch){batch=new Map();pending.set(owner,batch);queueMicrotask(()=>void signBatch(owner))}
  batch.set(path,[...(batch.get(path) || []),{resolve,reject}])
 })
}
async function signBatch(owner:string){
 const batch=pending.get(owner);pending.delete(owner)
 if(!batch)return
 try{
  if(useAuthStore().user?.id!==owner)throw Error('imageUnavailable')
  const {data,error}=await deadline(supabase.storage.from(noteImageBucket).createSignedUrls([...batch.keys()],300),10_000,'imageUnavailable')
  if(error || useAuthStore().user?.id!==owner)throw Error('imageUnavailable')
  for(const [path,callbacks] of batch){
   const item=data?.find(row=>row.path===path)
   if(!item?.signedUrl || item.error){callbacks.forEach(callback=>callback.reject(Error('imageUnavailable')));continue}
   signed.set(owner+':'+path,{url:item.signedUrl,until:Date.now()+240_000})
   const url=item.signedUrl
   callbacks.forEach(callback=>callback.resolve(url))
  }
  while(signed.size>128)signed.delete(signed.keys().next().value!)
 }catch(error){for(const callbacks of batch.values())callbacks.forEach(callback=>callback.reject(error))}
}

export async function uploadNoteImage(file:File){
 const workspaces=useWorkspacesStore(),owner=useAuthStore().user?.id,scope=workspaces.sessionKey
 const binding=workspaces.binding('detailed'),collection=binding?.collection_id
 if(!owner || !collection || binding?.role==='viewer')throw Error('imagePermission')
 if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw Error('imageType')
 if(!file.size || file.size>5*1024*1024)throw Error('imageSizeError')
 const blob=file.type==='image/gif' || file.size<=256*1024?file:await compressImage(file)
 if(workspaces.sessionKey!==scope || useAuthStore().user?.id!==owner)throw Error('imagePermission')
 const extension=blob.type==='image/gif'?'gif':blob.type==='image/png'?'png':blob.type==='image/jpeg'?'jpg':'webp'
 const path=`${collection}/${owner}/${crypto.randomUUID()}.${extension}`
 const pendingUpload=supabase.storage.from(noteImageBucket).upload(path,blob,{contentType:blob.type,cacheControl:'3600',upsert:false})
 let result:Awaited<typeof pendingUpload>
 try{result=await deadline(pendingUpload,30_000,'imageUploadFailed')}
 catch{void pendingUpload.then(response=>{if(!response.error)void discardNoteImage(path)});throw Error('imageUploadFailed')}
 const {error}=result
 if(error){
  const message=String(error.message || '').toLowerCase()
  if(message.includes('bucket') && message.includes('not found'))throw Error('imageSetup')
  if(String(error.statusCode)==='403' || message.includes('row-level security') || message.includes('not authorized'))throw Error('imagePermission')
  throw Error('imageUploadFailed')
 }
 if(workspaces.sessionKey!==scope || useAuthStore().user?.id!==owner){void discardNoteImage(path);throw Error('imagePermission')}
 return {path,alt:file.name.replace(/\.[^.]+$/,'').slice(0,160)}
}
export async function discardNoteImage(path:string){
 if(!validNoteImagePath(path) || path.split('/')[1]!==useAuthStore().user?.id)return
 try{await deadline(supabase.storage.from(noteImageBucket).remove([path]),10_000,'imageUploadFailed')}catch{}
}
async function deadline<T>(operation:PromiseLike<T>,milliseconds:number,code:string):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined
 try{return await Promise.race([Promise.resolve(operation),new Promise<T>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error(code)),milliseconds)})])}
 finally{if(timer)clearTimeout(timer)}
}
async function compressImage(file:File):Promise<Blob>{
 const url=URL.createObjectURL(file),image=new Image()
 try{
  await deadline(new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('imageType'));image.src=url}),10_000,'imageUploadFailed')
  if(!image.naturalWidth || !image.naturalHeight || image.naturalWidth*image.naturalHeight>40_000_000)throw Error('imageDimensions')
  const ratio=Math.min(1,1600/image.naturalWidth,1600/image.naturalHeight),canvas=document.createElement('canvas')
  canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio))
  const context=canvas.getContext('2d');if(!context)throw Error('imageUploadFailed')
  context.drawImage(image,0,0,canvas.width,canvas.height)
  for(const quality of [.85,.7,.55,.4]){
   const result=await deadline(new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',quality)),5_000,'imageUploadFailed')
   if(result && result.size<=1024*1024)return result
  }
  throw Error('imageSizeError')
 }finally{image.onload=null;image.onerror=null;image.removeAttribute('src');URL.revokeObjectURL(url)}
}
