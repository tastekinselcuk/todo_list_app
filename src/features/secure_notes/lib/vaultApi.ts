import { supabase } from '@/lib/supabase'
export async function vaultSecurity(payload: Record<string, unknown>) {
  const {data,error} = await supabase.functions.invoke('vault-security',{body:payload})
  if(error){
    const response=error.context
    const failure=response instanceof Response?await response.json().catch(()=>null):null
    throw Error(failure?.error||'UNAVAILABLE')
  }
  if(data?.error)throw Error(data.error)
  return data
}
export function downloadVaultFile(content:string,filename:string){
  const url=URL.createObjectURL(new Blob([content],{type:'application/octet-stream'})),anchor=document.createElement('a')
  anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
