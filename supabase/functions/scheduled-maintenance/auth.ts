export async function verifyMaintenanceTicket(token:string,secret:string,now=Date.now()):Promise<{id:string;issued:number}|null>{
 if(secret.length<32)return null
 const parts=token.split('.')
 if(parts.length!==4||parts[0]!=='v1'||!/^\d{10}$/.test(parts[1])
  ||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(parts[2])||!/^[0-9a-f]{64}$/.test(parts[3]))return null
 const issued=Number(parts[1]),seconds=now/1000
 if(issued<seconds-90||issued>seconds+15)return null
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(parts[1]+'.'+parts[2]))
 const expected=Array.from(new Uint8Array(signature),value=>value.toString(16).padStart(2,'0')).join('')
 let difference=0;for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^parts[3].charCodeAt(i)
 return difference?null:{id:parts[2],issued}
}
