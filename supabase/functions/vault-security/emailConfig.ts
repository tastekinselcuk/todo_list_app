// Test delivery is explicitly enabled and restricted to the signed-in user's own
// verified email. Never redirect another user's security codes to a test inbox.
export function vaultEmailConfig(env:Record<string,string|undefined>) {
  const mode=env.VAULT_MAIL_MODE||'production',key=env.RESEND_API_KEY||''
  const from=env.VAULT_FROM_EMAIL||(mode==='test'?'Pomodolist <onboarding@resend.dev>':'')
  const sender=(from.match(/<([^<>]+)>\s*$/)?.[1]||from).trim().toLowerCase()
  const testEmail=(env.VAULT_TEST_EMAIL||'').trim().toLowerCase()
  const validEmail=(value:string)=>/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value)
  const configured=!!key&&(mode==='test'
    ?sender==='onboarding@resend.dev'&&validEmail(testEmail)
    :mode==='production'&&validEmail(sender)&&!sender.endsWith('@resend.dev'))
  return {from,key,configured,recipientAllowed:(email:string)=>mode!=='test'||email.trim().toLowerCase()===testEmail}
}
