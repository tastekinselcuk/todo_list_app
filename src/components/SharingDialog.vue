<template>
  <dialog ref="dialog" class="sharing-dialog fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl border border-border/60 bg-card p-0 text-foreground shadow-2xl" aria-labelledby="sharing-title" @close="sharing.close()" @click="backdropClose">
    <div class="flex items-start justify-between gap-3 border-b border-border/40 px-5 py-4">
      <div class="min-w-0">
        <h2 id="sharing-title" class="flex items-center gap-2 text-sm font-semibold"><Link2 class="h-4 w-4 text-primary" />{{ sharing.mode === 'join' ? t('sharing.joinTitle') : t('sharing.title') }}</h2>
        <p v-if="sharing.mode === 'manage'" class="mt-1 truncate text-xs text-muted-foreground">{{ workspaceName }} · {{ t(`workspace.modules.${sharing.moduleId}Name`) }}</p>
        <p v-else class="mt-1 text-xs text-muted-foreground">{{ t('sharing.joinHint') }}</p>
      </div>
      <button type="button" class="sharing-icon" :aria-label="t('common.cancel')" @click="sharing.close()"><X class="h-4 w-4" /></button>
    </div>
    <div class="space-y-4 p-5">
      <template v-if="sharing.mode === 'join'">
        <form class="space-y-3" @submit.prevent="sharing.inspectInvite()">
          <label for="sharing-link" class="block text-xs font-medium">{{ t('sharing.linkLabel') }}</label>
          <div class="flex gap-2">
            <input id="sharing-link" ref="linkInput" v-model="sharing.input" type="url" autocomplete="off" :disabled="sharing.busy" :placeholder="t('sharing.linkPlaceholder')" class="h-10 min-w-0 flex-1 rounded-xl border border-border/50 bg-background/40 px-3 text-xs outline-none focus:border-primary/40" />
            <button type="submit" class="sharing-primary" :disabled="sharing.busy || !sharing.input.trim()"><Loader2 v-if="sharing.busy" class="h-3.5 w-3.5 animate-spin" /><ArrowRight v-else class="h-4 w-4" /><span class="sr-only">{{ t('sharing.inspect') }}</span></button>
          </div>
          <label class="block text-xs font-medium">{{ t('sharing.targetWorkspace') }}</label>
          <CustomSelect v-model="sharing.workspaceId" :options="workspaceOptions" :aria-label="t('sharing.targetWorkspace')" :disabled="sharing.busy" />
        </form>
        <div v-if="sharing.preview" class="space-y-3 rounded-xl border border-primary/15 bg-primary/5 p-3.5">
          <div class="flex items-center gap-2"><Users class="h-4 w-4 shrink-0 text-primary" /><span class="min-w-0 flex-1 truncate text-sm font-medium">{{ sharing.preview.name }} · {{ t(`workspace.modules.${sharing.preview.module}Name`) }}</span></div>
          <p class="text-xs text-muted-foreground">{{ t('sharing.invitedBy', { name: sharing.preview.owner_label, role: t(`sharing.${sharing.preview.invite_role || 'editor'}`) }) }}</p>
          <p class="text-xs leading-5 text-muted-foreground">{{ t(sharing.preview.invite_role === 'viewer' ? 'sharing.joinReadOnly' : 'sharing.joinScope') }}</p>
          <p class="text-xs leading-5 text-muted-foreground">{{ t('sharing.personalKept') }}</p>
          <p v-if="sharing.preview.module === 'secure'" class="text-xs leading-5 text-muted-foreground">{{ t('sharing.vaultHint') }}</p>
          <button type="button" class="sharing-primary w-full" :disabled="sharing.busy" @click="accept"><Loader2 v-if="sharing.busy" class="h-3.5 w-3.5 animate-spin" /><Link2 v-else class="h-3.5 w-3.5" />{{ t('sharing.connect') }}</button>
        </div>
      </template>
      <template v-else-if="sharing.binding && sharing.error !== 'SETUP_REQUIRED'">
        <p class="text-xs leading-5 text-muted-foreground">{{ t('sharing.scope') }}</p>
        <p v-if="sharing.moduleId === 'secure'" class="text-xs leading-5 text-muted-foreground">{{ t('sharing.vaultHint') }}</p>
        <div v-if="sharing.binding.role === 'owner'" class="space-y-2">
          <label class="block text-xs font-medium">{{ t('sharing.permission') }}</label>
          <div class="flex items-center gap-2">
            <CustomSelect :model-value="sharing.inviteRole" :options="roleOptions" :aria-label="t('sharing.permission')" :disabled="sharing.busy" class="min-w-0 flex-1" @update:model-value="sharing.inviteRole = $event as InviteRole" />
            <button type="button" class="sharing-primary shrink-0" :disabled="sharing.busy" @click="sharing.newInvite()"><Loader2 v-if="sharing.busy" class="h-3.5 w-3.5 animate-spin" /><Plus v-else class="h-3.5 w-3.5" />{{ t('sharing.newLink') }}</button>
          </div>
          <p class="text-[11px] leading-4 text-muted-foreground">{{ t(sharing.inviteRole === 'viewer' ? 'sharing.viewerHint' : 'sharing.editorHint') }}</p>
        </div>
        <div v-if="sharing.generatedLink" class="space-y-2">
          <div class="flex items-center gap-2 rounded-xl border border-border/50 bg-background/40 p-1.5 pl-3">
            <input :value="sharing.generatedLink" readonly :aria-label="t('sharing.linkLabel')" class="min-w-0 flex-1 bg-transparent text-xs text-muted-foreground outline-none" @focus="($event.target as HTMLInputElement).select()" />
            <button type="button" class="sharing-primary h-8" @click="copy"><Check v-if="copied" class="h-3.5 w-3.5" /><Copy v-else class="h-3.5 w-3.5" />{{ copied ? t('sharing.copied') : t('sharing.copyLink') }}</button>
          </div>
          <p class="text-[11px] text-muted-foreground">{{ t(`sharing.${sharing.generatedRole}`) }} · {{ t('sharing.expires', { date: formatDate(sharing.expiresAt) }) }}</p>
        </div>
        <section v-if="sharing.details.members.length" class="space-y-2" :aria-label="t('sharing.members')">
          <div class="flex items-center justify-between text-xs"><span class="font-medium">{{ t('sharing.members') }}</span><span class="tabular-nums text-muted-foreground">{{ sharing.details.members.length }}</span></div>
          <ul class="max-h-40 overflow-y-auto rounded-xl border border-border/40 bg-background/20 p-1">
            <li v-for="member in sharing.details.members" :key="member.user_id" class="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs">
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase">{{ member.label.slice(0,1) }}</span>
              <span class="min-w-0 flex-1 truncate">{{ member.label }}</span>
              <span class="text-[10px] text-muted-foreground">{{ t(`sharing.${member.role}`) }}</span>
              <button v-if="sharing.binding.role === 'owner' && member.role !== 'owner'" type="button" class="sharing-icon" :title="t('sharing.removeMember')" :aria-label="`${t('sharing.removeMember')}: ${member.label}`" :disabled="sharing.busy" @click="sharing.confirmAction = `remove:${member.user_id}`"><UserMinus class="h-3.5 w-3.5" /></button>
            </li>
          </ul>
        </section>
        <div v-if="pendingInvites.length" class="space-y-1 border-t border-border/40 pt-3">
          <p class="mb-2 text-xs font-medium">{{ t('sharing.pendingInvites') }}</p>
          <div v-for="invite in pendingInvites" :key="invite.id" class="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{{ t(`sharing.${invite.invite_role || 'editor'}`) }} · {{ t('sharing.expires', { date: formatDate(invite.expires_at) }) }}</span><button type="button" class="sharing-icon" :disabled="sharing.busy" :title="t('sharing.revokeLink')" :aria-label="t('sharing.revokeLink')" @click="sharing.manage('revoke_invite', invite.id)"><Unlink class="h-3.5 w-3.5" /></button></div>
        </div>
        <div v-if="sharing.binding.shared" class="border-t border-border/40 pt-3">
          <button type="button" class="text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40" :disabled="sharing.busy" @click="sharing.confirmAction = sharing.binding.collection_id === sharing.binding.personal_collection_id ? 'end' : 'detach'">{{ sharing.binding.collection_id === sharing.binding.personal_collection_id ? t('sharing.endSharing') : t('sharing.disconnect') }}</button>
          <div v-if="sharing.confirmAction" class="mt-3 space-y-3 rounded-xl border border-border/50 bg-muted/30 p-3">
            <p class="text-xs leading-5">{{ sharing.confirmAction === 'detach' ? t('sharing.disconnectHint') : t('sharing.endHint') }}</p>
            <div class="flex justify-end gap-2"><button type="button" class="sharing-secondary" :disabled="sharing.busy" @click="sharing.confirmAction = ''">{{ t('common.cancel') }}</button><button type="button" class="sharing-primary" :disabled="sharing.busy" @click="confirm"><Loader2 v-if="sharing.busy" class="h-3.5 w-3.5 animate-spin" />{{ t('common.confirm') }}</button></div>
          </div>
        </div>
      </template>
      <p v-if="sharing.error" role="alert" class="rounded-xl border border-destructive/15 bg-destructive/5 px-3 py-2.5 text-xs leading-5 text-destructive">{{ t(`sharing.errors.${sharing.error}`) }}</p>
      <div v-else-if="sharing.busy && !sharing.generatedLink && sharing.mode === 'manage'" role="status" class="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" />{{ t('sharing.loading') }}</div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowRight, Check, Copy, Link2, Loader2, Plus, Unlink, UserMinus, Users, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useSharingStore } from '@/stores/sharing'
import { useWorkspacesStore } from '@/stores/workspaces'
import { useUIStore } from '@/stores/ui'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import type { InviteRole } from '@/lib/sharing'

const sharing = useSharingStore(), workspaces = useWorkspacesStore(), ui = useUIStore()
const { t, locale } = useI18n()
const roleOptions = computed(() => [{ value: 'viewer', label: t('sharing.viewer') }, { value: 'editor', label: t('sharing.editor') }])
const dialog = ref<HTMLDialogElement>(), linkInput = ref<HTMLInputElement>(), copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined
let returnFocus: HTMLElement | null = null
const workspaceOptions = computed(() => workspaces.available.map(w => ({ value: w.id, label: w.name })))
const workspaceName = computed(() => workspaces.items.find(w => w.id === sharing.workspaceId)?.name)
const pendingInvites = computed(() => sharing.details.invites.filter(i => !i.used_at && !i.revoked_at && new Date(i.expires_at).getTime() > Date.now()))
const formatDate = (value: string) => new Date(value).toLocaleDateString(locale.value, { day: 'numeric', month: 'short' })
watch(() => sharing.open, async visible => {
  await nextTick()
  if (visible) { returnFocus = document.activeElement as HTMLElement; copied.value = false; dialog.value?.showModal(); if (sharing.mode === 'join') linkInput.value?.focus() }
  else { dialog.value?.close(); returnFocus?.focus() }
}, { immediate: true })
function backdropClose(event: MouseEvent) {
  if (event.target !== dialog.value) return
  const rect = dialog.value!.getBoundingClientRect()
  if (event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom) sharing.close()
}
async function copy() {
  try {
    await navigator.clipboard.writeText(sharing.generatedLink); copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copied.value = false }, 1800)
  } catch { ui.addToast(t('sharing.copyFailed'), 'error') }
}
async function accept() { if (await sharing.accept()) ui.addToast(t('sharing.connected'), 'success') }
async function confirm() {
  if (sharing.confirmAction === 'detach') { if (await sharing.detach()) ui.addToast(t('sharing.disconnected'), 'success') }
  else if (sharing.confirmAction.startsWith('remove:')) await sharing.manage('remove_member', sharing.confirmAction.slice(7))
  else await sharing.manage('end_sharing')
}
onBeforeUnmount(() => { if (copyTimer) clearTimeout(copyTimer) })
</script>

<style scoped>
.sharing-dialog::backdrop { background: rgb(2 6 23 / .45); backdrop-filter: blur(5px); }
.sharing-dialog[open] { animation: sharing-open 180ms cubic-bezier(.22,1,.36,1); }
.sharing-icon { display: inline-flex; height: 2rem; width: 2rem; flex-shrink: 0; align-items: center; justify-content: center; border-radius: .6rem; color: hsl(var(--muted-foreground)); transition: background-color 150ms, color 150ms; }
.sharing-icon:hover { background: hsl(var(--muted) / .6); color: hsl(var(--foreground)); }
.sharing-primary,.sharing-secondary { display: inline-flex; min-height: 2.25rem; align-items: center; justify-content: center; gap: .4rem; padding: .4rem .75rem; border-radius: .7rem; font-size: .75rem; font-weight: 500; transition: opacity 150ms; }
.sharing-primary { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
.sharing-secondary { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
.sharing-dialog button:disabled { opacity: .4; cursor: default; }
.sharing-dialog button:focus-visible { outline: 2px solid hsl(var(--primary) / .5); outline-offset: 2px; }
@keyframes sharing-open { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .sharing-dialog[open] { animation: none; } }
</style>
