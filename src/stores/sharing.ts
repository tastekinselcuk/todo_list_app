import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'
import { useWorkspacesStore } from './workspaces'
import { inviteLink, parseInviteLink, sharingErrorCode, type ShareableModule, type InviteRole } from '@/lib/sharing'

interface Preview { collection_id: string; module: ShareableModule; name: string; owner_label: string; expires_at: string; already_member: boolean; invite_role: InviteRole }
interface Details {
  members: { user_id: string; role: string; label: string }[]
  invites: { id: string; expires_at: string; used_at: string | null; revoked_at: string | null; invite_role: InviteRole }[]
}
export const useSharingStore = defineStore('sharing', () => {
  const auth = useAuthStore()
  const workspaces = useWorkspacesStore()
  const open = ref(false)
  const mode = ref<'manage' | 'join'>('manage')
  const moduleId = ref('')
  const workspaceId = ref('')
  const input = ref('')
  const generatedLink = ref('')
  const expiresAt = ref('')
  const inviteRole = ref<InviteRole>('viewer')
  const generatedRole = ref<InviteRole>('viewer')
  const preview = ref<Preview | null>(null)
  const details = ref<Details>({ members: [], invites: [] })
  const busy = ref(false)
  const error = ref('')
  const confirmAction = ref('')
  const binding = computed(() => workspaces.binding(moduleId.value, workspaceId.value))
  let generation = 0
  let channel: RealtimeChannel | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let refreshing = false

  function close(clearHash = true) {
    generation++; open.value = false; busy.value = false; error.value = ''; generatedLink.value = ''; input.value = ''; preview.value = null; confirmAction.value = ''
    if (clearHash && typeof window !== 'undefined' && new URLSearchParams(window.location.hash.slice(1)).has('invite')) {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    }
  }
  async function request(name: string, args: Record<string, unknown>) {
    const result = await supabase.rpc(name, args)
    if (result.error) throw result.error
    return result.data
  }
  async function run(operation: () => Promise<unknown>) {
    if (busy.value) return false
    const requestGeneration = generation
    const owner = auth.user?.id
    busy.value = true; error.value = ''
    try {
      await operation()
      return requestGeneration === generation && owner === auth.user?.id
    } catch (err) {
      if (requestGeneration === generation && owner === auth.user?.id) error.value = sharingErrorCode(err as Error)
      return false
    } finally { if (requestGeneration === generation) busy.value = false }
  }
  async function loadDetails() {
    const cid = binding.value?.collection_id
    if (!cid) return
    const requestGeneration = generation
    const result = await request('collection_details', { cid })
    if (generation === requestGeneration && binding.value?.collection_id === cid) details.value = result
  }
  async function newInvite() {
    const wid = workspaceId.value, id = moduleId.value
    const requestGeneration = generation
    return run(async () => {
      if (binding.value && !binding.value.permissions_ready) throw new Error('SETUP_ROLE_REQUIRED')
      const role = inviteRole.value
      const result = await request('create_collection_invite', { wid, module_id: id, invite_role: role })
      if (generation !== requestGeneration) return
      generatedLink.value = inviteLink(result.token, window.location.origin)
      expiresAt.value = result.expires_at
      generatedRole.value = result.invite_role || role
      await workspaces.refreshBindings(wid, true)
      await loadDetails()
    })
  }
  async function showManage(id: string) {
    close(); mode.value = 'manage'; moduleId.value = id; workspaceId.value = workspaces.activeId
    inviteRole.value = 'viewer'
    details.value = { members: [], invites: [] }; open.value = true
    const requestGeneration = generation
    if (!workspaces.sharingAvailable) {
      await workspaces.refreshBindings(workspaceId.value, true)
      if (requestGeneration !== generation) return
      if (!workspaces.sharingAvailable) { error.value = 'SETUP_REQUIRED'; return }
    }
    await run(loadDetails)
  }
  function showJoin(link = '') {
    close(false); mode.value = 'join'; workspaceId.value = workspaces.activeId; input.value = link; open.value = true
    if (link) void inspectInvite()
  }
  async function inspectInvite() {
    preview.value = null
    const token = parseInviteLink(input.value, window.location.origin)
    if (!token) { error.value = 'INVITE_INVALID'; return false }
    const requestGeneration = generation
    return run(async () => {
      if (!workspaces.sharingAvailable) {
        await workspaces.refreshBindings(workspaceId.value, true)
        if (!workspaces.sharingAvailable) throw new Error('SETUP_REQUIRED')
      }
      const result = await request('preview_collection_invite', { invite_token: token })
      if (generation === requestGeneration) preview.value = result
    })
  }
  async function accept() {
    if (!preview.value) return false
    const wid = workspaceId.value
    const token = parseInviteLink(input.value, window.location.origin)
    if (!token) { error.value = 'INVITE_INVALID'; return false }
    const requestGeneration = generation
    const success = await run(async () => {
      await request('accept_collection_invite', { invite_token: token, wid })
      if (generation !== requestGeneration) return
      workspaces.switchTo(wid)
      await workspaces.refreshBindings(wid, true)
    })
    if (success) close()
    return success
  }
  async function detach() {
    const wid = workspaceId.value, id = moduleId.value
    const requestGeneration = generation
    const success = await run(async () => {
      await request('detach_collection', { wid, module_id: id })
      if (generation !== requestGeneration) return
      await workspaces.refreshBindings(wid, true)
    })
    if (success) close()
    return success
  }
  async function manage(action: string, targetId: string | null = null) {
    const cid = binding.value?.collection_id, wid = workspaceId.value
    if (!cid) return false
    const requestGeneration = generation
    const success = await run(async () => {
      await request('manage_collection', { cid, action, target_id: targetId })
      if (generation !== requestGeneration) return
      await workspaces.refreshBindings(wid, true)
      await loadDetails()
    })
    if (success) {
      confirmAction.value = ''
      if (action === 'end_sharing') { generatedLink.value = ''; close() }
      if (action === 'revoke_invite') generatedLink.value = ''
    }
    return success
  }
  async function refresh() {
    if (refreshing || !auth.user || !workspaces.sharingAvailable) return
    refreshing = true
    try { await workspaces.refreshBindings(); if (open.value && mode.value==='manage') await loadDetails() }
    catch { /* Data access remains protected by RLS while offline. */ }
    finally { refreshing = false }
  }
  function handleHash() {
    if (parseInviteLink(window.location.href, window.location.origin)) showJoin(window.location.href)
  }
  function stop() {
    if (channel) void supabase.removeChannel(channel)
    channel = undefined
    if (timer) clearInterval(timer)
    timer = undefined
    if (typeof window !== 'undefined') { window.removeEventListener('hashchange', handleHash); window.removeEventListener('online', refresh) }
  }
  function start() {
    stop()
    if (workspaces.sharingAvailable) {
      channel = supabase.channel(`sharing-user:${auth.user!.id}`, { config: { private: true } })
        .on('broadcast', { event: 'changed' }, () => { void refresh() })
        .subscribe(status => { if (status==='SUBSCRIBED') void refresh() })
      timer = setInterval(() => { void refresh() }, 15_000)
    }
    window.addEventListener('hashchange', handleHash); window.addEventListener('online', refresh)
    handleHash()
  }
  watch(() => auth.user?.id, () => { stop(); close(false) })
  watch(input, () => { preview.value = null; error.value = '' })
  return { open,mode,moduleId,workspaceId,input,generatedLink,expiresAt,inviteRole,generatedRole,preview,details,busy,error,confirmAction,binding,
    close,showManage,showJoin,inspectInvite,accept,detach,manage,newInvite,start,stop }
})
