import {createClient} from 'npm:@supabase/supabase-js@2'
import {trashCleanupHandler} from './handler.ts'
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const admin=createClient(Deno.env.get('SUPABASE_URL')!,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
Deno.serve(trashCleanupHandler({
 secret:serviceKey,
 async purge(){const {data,error}=await admin.rpc('purge_expired_trash',{batch_size:200});if(error)throw error;const vault=await admin.rpc('vault_cleanup',{batch_size:200});if(vault.error&&!['PGRST202','42883'].includes(vault.error.code))throw vault.error;return (data||0)+(vault.data||0)},
 async images(ack=[]){const {data,error}=await admin.rpc('trash_cleanup_images',{ack});if(error)throw error;return data},
 async remove(paths){const {error}=await admin.storage.from('note-images').remove(paths);if(error)throw error},
}))
