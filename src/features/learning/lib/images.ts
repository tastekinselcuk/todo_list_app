import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/noteImages'
import { useWorkspacesStore } from '@/stores/workspaces'
import { useAuthStore } from '@/stores/auth'
const bucket='learning-images'
async function deadline<T>(promise:PromiseLike<T>,ms=15000):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([Promise.resolve(promise),new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(Error('imageFailed')),ms)})])}finally{clearTimeout(timer)}}
function ownPath(path:string){const owner=useAuthStore().user?.id;return Boolean(owner&&path.startsWith(`${owner}/`)&&/^[\da-f-]{36}\/[\da-f-]{36}\/[\da-f-]{36}\.(webp|png|jpe?g)$/i.test(path))}
export async function discardStudyImage(path:string){if(ownPath(path))try{await deadline(supabase.storage.from(bucket).remove([path]))}catch{}}
export async function signStudyImage(path:string){
 if(!ownPath(path))throw Error('imageFailed')
 const scope=useWorkspacesStore().sessionKey
 const {data,error}=await deadline(supabase.storage.from(bucket).createSignedUrl(path,300))
 if(error||!data?.signedUrl||scope!==useWorkspacesStore().sessionKey)throw Error('imageFailed')
 return data.signedUrl
}
export async function uploadStudyImage(file:File){
 const workspaces=useWorkspacesStore(),scope=workspaces.sessionKey,owner=useAuthStore().user?.id,wid=workspaces.activeId
 if(!owner||!wid||!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>5*1024*1024)throw Error('imageType')
 const blob=await compressImage(file)
 if(scope!==workspaces.sessionKey)throw Error('imageFailed')
 const path=`${owner}/${wid}/${crypto.randomUUID()}.webp`
 const pending=supabase.storage.from(bucket).upload(path,blob,{contentType:'image/webp',upsert:false,cacheControl:'300'})
 try{const {error}=await deadline(pending,30000);if(error)throw error;if(scope!==workspaces.sessionKey)throw Error('imageFailed');return path}
 catch{void pending.then(result=>{if(!result.error)void discardStudyImage(path)});throw Error('imageFailed')}
}
