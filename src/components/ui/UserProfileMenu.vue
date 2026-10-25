<template>
  <div ref="root" data-user-profile :inert="!visible && !open" class="profile-host fixed right-[14px] z-[60]" :class="{ 'profile-hidden': !visible && !open, 'profile-docked': docked, 'profile-attached': attached, 'profile-embedded':embedded }" :style="embedded ? undefined : { top: attached ? `${(headerOffset ?? workspaceHeaderHeight) - workspaceHeaderHeight + (workspaceHeaderHeight - 40) / 2}px` : '14px' }" @focusin="emit('reveal')" @keydown.esc.stop.prevent="close(true)">
    <button ref="trigger" type="button" class="profile-trigger inline-flex h-10 items-center gap-1.5 rounded-full border border-border/60 bg-card/80 p-1 pr-2 shadow-sm backdrop-blur-xl transition-colors hover:bg-muted/80 disabled:opacity-50" :aria-label="t('account.menuLabel')" aria-haspopup="menu" :aria-expanded="open" aria-controls="profile-menu" :disabled="auth.accountBusy" @click="open ? close(true) : show()" @keydown.down.prevent="show()" @keydown.up.prevent="show(true)">
      <span class="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold" :class="avatarClasses[validAvatarTone(auth.user?.avatarTone)]">{{ initials }}</span>
      <ChevronDown class="h-3 w-3 text-muted-foreground transition-transform" :class="{ 'rotate-180': open }" />
    </button>
    <Transition name="profile-menu">
      <div v-if="open" id="profile-menu" role="menu" :aria-label="t('account.menuLabel')" class="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-border/60 bg-card p-1.5 shadow-[0_12px_36px_rgb(0,0,0,0.12)]" @keydown="handleKey">
        <div role="presentation" class="min-w-0 border-b border-border/40 px-2.5 pb-3 pt-2">
          <p class="truncate text-sm font-medium">{{ name || t('account.title') }}</p>
          <p class="mt-0.5 truncate text-xs text-muted-foreground">{{ auth.user?.email }}</p>
        </div>
        <button ref="editButton" type="button" role="menuitem" class="profile-item mt-1" @click="select('edit')"><UserRound class="h-4 w-4 text-muted-foreground" />{{ t('account.editProfile') }}<ArrowUpRight class="ml-auto h-3.5 w-3.5 text-muted-foreground/60" /></button>
        <button ref="logoutButton" type="button" role="menuitem" class="profile-item text-muted-foreground hover:!bg-destructive/5 hover:!text-destructive" @click="select('logout')"><LogOut class="h-4 w-4" />{{ t('app.signOut') }}</button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowUpRight, ChevronDown, LogOut, UserRound } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { workspaceHeaderHeight } from '@/lib/navigationScroll'
import { useAuthStore } from '@/stores/auth'
import { accountInitials, accountName, avatarClasses, validAvatarTone } from '@/lib/accountProfile'
const props = defineProps<{ visible: boolean; docked: boolean; activeView: string; attached?: boolean; headerOffset?: number; embedded?:boolean }>()
const emit = defineEmits<{ edit: []; logout: []; reveal: [] }>()
const auth = useAuthStore(), { t } = useI18n()
const root = ref<HTMLElement>(), trigger = ref<HTMLButtonElement>()
const editButton = ref<HTMLButtonElement>(), logoutButton = ref<HTMLButtonElement>()
const open = ref(false)
const name = computed(() => accountName(auth.user)), initials = computed(() => accountInitials(name.value))
async function show(last = false) {
  if (auth.accountBusy) return
  open.value = true
  emit('reveal')
  await nextTick()
  if (open.value) (last ? logoutButton.value : editButton.value)?.focus()
}
function close(restore = false) { open.value = false; if (restore) trigger.value?.focus() }
function select(action: 'edit' | 'logout') { close(true); if (action === 'edit') emit('edit'); else emit('logout') }
function outside(event: PointerEvent) { if (!root.value?.contains(event.target as Node)) close() }
function focusOutside(event: FocusEvent) { if (!root.value?.contains(event.target as Node)) close() }
function handleKey(event: KeyboardEvent) {
  const items = [editButton.value, logoutButton.value].filter(Boolean) as HTMLButtonElement[]
  const index = items.indexOf(document.activeElement as HTMLButtonElement)
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }
}
watch(() => [props.activeView, auth.user?.id], () => close())
onMounted(() => { document.addEventListener('pointerdown', outside); document.addEventListener('focusin', focusOutside) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', focusOutside) })
</script>

<style scoped>
.profile-host { transition: top 260ms cubic-bezier(.22,1,.36,1), transform 220ms ease, opacity 180ms ease; }
.profile-hidden { transform: translateY(-7rem); opacity: 0; pointer-events: none; }
.profile-attached,.profile-attached.profile-hidden { transform:none; transition:opacity 180ms ease; }
@media (max-width: 639px) {
  .profile-docked { right: .75rem; }
  .profile-docked .profile-trigger { padding-right: .25rem; }
  .profile-docked .profile-trigger > svg { display: none; }
}
.profile-item { display: flex; width: 100%; align-items: center; gap: .65rem; padding: .65rem .6rem; border-radius: .65rem; font-size: .75rem; transition: background-color 150ms, color 150ms; }
.profile-item:hover { background: hsl(var(--muted) / .6); }
button:focus-visible { outline: 2px solid hsl(var(--primary) / .5); outline-offset: 2px; }
.profile-menu-enter-active, .profile-menu-leave-active { transition: opacity 140ms ease, transform 160ms cubic-bezier(.22,1,.36,1); transform-origin: top right; }
.profile-menu-enter-from, .profile-menu-leave-to { opacity: 0; transform: translateY(-4px) scale(.97); }
@media (prefers-reduced-motion: reduce) { .profile-host, .profile-menu-enter-active, .profile-menu-leave-active, button, svg { transition: none; } }

.profile-host.profile-embedded{position:relative;inset:auto;flex-shrink:0;transform:none}.profile-embedded .profile-trigger{height:34px;border-color:transparent;background:transparent;box-shadow:none;backdrop-filter:none}.profile-embedded .profile-trigger>span{width:28px;height:28px}
</style>
