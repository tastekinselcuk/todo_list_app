<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, ChevronDown, Layers, Search, Settings2 } from 'lucide-vue-next'
import { useWorkspacesStore } from '@/stores/workspaces'

const props=defineProps<{variant?:'rail';portalTarget?:HTMLElement}>()
const emit = defineEmits<{ manage: []; select:[id:string]; 'open-change':[open:boolean] }>()
const store = useWorkspacesStore()
const { t } = useI18n()
const open = ref(false)
const query = ref('')
const trigger = ref<HTMLButtonElement>()
const search = ref<HTMLInputElement>()
const popover = ref<HTMLElement>()
const position = ref({ top: '0px', left: '0px', width: '260px' })
const matches = computed(() => store.available.filter(item =>
  item.name.toLocaleLowerCase().includes(query.value.toLocaleLowerCase())))

function close() { if(open.value)emit('open-change',false);open.value = false; query.value = '' }
async function toggle() {
  if (open.value) { close(); return }
  const rect = trigger.value!.getBoundingClientRect()
  const width = Math.min(300, window.innerWidth - 24)
  position.value = {
    top: `${rect.bottom + 8}px`,
    left: `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`,
    width: `${width}px`,
  }
  open.value = true
  emit('open-change',true)
  await nextTick()
  if(open.value)search.value?.focus({preventScroll:true})
}
function select(id: string) { close(); store.switchTo(id); trigger.value?.focus();emit('select',id) }
function outside(event: Event) {
  if (!trigger.value?.contains(event.target as Node) && !popover.value?.contains(event.target as Node)) close()
}
function scroll(event: Event) {
  if (!(event.target instanceof Node) || !popover.value?.contains(event.target)) close()
}
function focusOutside(event:FocusEvent){if(open.value)outside(event)}
function move(event:KeyboardEvent){
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return
  if(event.target===search.value&&['Home','End'].includes(event.key))return
  const choices=[...(popover.value?.querySelectorAll<HTMLButtonElement>('[data-workspace]')||[])]
  if(!choices.length)return
  event.preventDefault()
  const index=choices.indexOf(document.activeElement as HTMLButtonElement)
  const next=event.key==='Home'?0:event.key==='End'?choices.length-1:index<0?(event.key==='ArrowUp'?choices.length-1:0):(index+(event.key==='ArrowUp'?-1:1)+choices.length)%choices.length
  choices[next]?.focus()
}
document.addEventListener('pointerdown', outside)
document.addEventListener('focusin',focusOutside)
window.addEventListener('resize', close)
window.addEventListener('scroll', scroll, true)
onBeforeUnmount(() => {
  close()
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('focusin',focusOutside)
  window.removeEventListener('resize', close)
  window.removeEventListener('scroll', scroll, true)
})
defineExpose({close})
</script>

<template>
  <button ref="trigger" type="button" class="workspace-picker-trigger flex min-w-0 max-w-[240px] items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" :class="{'is-rail':variant==='rail'}" :aria-label="t('workspaces.switch')" aria-haspopup="dialog" :aria-expanded="open" @click="toggle">
    <Layers v-if="variant!=='rail'" class="h-3.5 w-3.5 shrink-0" /><span v-if="variant==='rail'" class="workspace-picker-copy"><span>{{ t('workspaceNav.workspace') }}</span><strong :title="store.active?.name">{{ store.active?.name }}</strong></span><span v-else class="truncate">{{ store.active?.name }}</span><ChevronDown class="h-3 w-3 shrink-0" />
  </button>
  <Teleport :to="props.portalTarget||'body'">
    <Transition name="workspace-picker"><div v-if="open" ref="popover" role="dialog" :aria-label="t('workspaces.switch')" :style="position" class="workspace-picker-menu fixed z-[100] overflow-hidden rounded-2xl border border-border/60 bg-card text-card-foreground shadow-xl shadow-black/10" @keydown.esc.stop.prevent="close(); trigger?.focus()" @keydown="move">
      <div class="flex items-center gap-2 border-b border-border/40 px-3 py-2.5"><Search class="h-3.5 w-3.5 text-muted-foreground" /><input ref="search" v-model="query" :placeholder="t('workspaces.search')" :aria-label="t('workspaces.search')" class="min-w-0 flex-1 bg-transparent text-xs outline-none" /></div>
      <div class="max-h-64 overflow-y-auto p-1.5">
        <button v-for="item in matches" :key="item.id" type="button" data-workspace class="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-xs transition-colors hover:bg-primary/10 focus-visible:bg-primary/10 focus-visible:outline-none" :class="item.id === store.activeId ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground'" :aria-pressed="item.id === store.activeId" @click="select(item.id)"><span class="truncate">{{ item.name }}</span><Check v-if="item.id === store.activeId" class="h-3.5 w-3.5 shrink-0" /></button>
        <p v-if="!matches.length" class="p-3 text-xs text-muted-foreground">{{ t('workspaces.noResults') }}</p>
      </div>
      <button type="button" class="flex w-full items-center gap-2 border-t border-border/40 px-4 py-3 text-xs text-muted-foreground hover:bg-muted/50" @click="close(); emit('manage')"><Settings2 class="h-3.5 w-3.5" />{{ t('workspaces.manage') }}</button>
    </div></Transition>
  </Teleport>
</template>

<style scoped>
.workspace-picker-trigger:focus-visible{outline:none;box-shadow:inset 0 0 0 1px hsl(var(--primary)/.3)}
.workspace-picker-trigger.is-rail{flex:1;width:100%;max-width:none;justify-content:space-between;padding:6px;gap:6px;border-radius:9px;text-align:left}.workspace-picker-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}.workspace-picker-copy>span{font-size:9px;font-weight:500;letter-spacing:.025em;color:hsl(var(--muted-foreground))}.workspace-picker-copy>strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;font-weight:550;color:hsl(var(--foreground))}.workspace-picker-menu{max-height:calc(100dvh - 110px);overflow-y:auto;overscroll-behavior:contain}.workspace-picker-enter-active,.workspace-picker-leave-active{transition:opacity 140ms ease,transform 180ms cubic-bezier(.22,1,.36,1);transform-origin:top left}.workspace-picker-enter-from,.workspace-picker-leave-to{opacity:0;transform:translateY(-4px)}@media(prefers-reduced-motion:reduce){.workspace-picker-enter-active,.workspace-picker-leave-active{transition:none}}
</style>
