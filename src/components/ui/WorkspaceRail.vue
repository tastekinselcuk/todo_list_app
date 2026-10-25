<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { BookOpen, CalendarDays, ChevronsLeft, ChevronsRight, Heart, Layers, LayoutGrid, NotebookPen, PanelLeft, Search, Settings2, Trash2, Wallet, X } from 'lucide-vue-next'
import { chooseWorkspaceSectionModule, getWorkspaceSections, workspaceSectionFor, type PageNavigationContext, type WorkspaceSection, type WorkspaceSectionId } from '@/lib/workspaceSections'
import { useWorkspaceDraft } from '@/lib/workspaceScope'
import WorkspacePicker from './WorkspacePicker.vue'

const props = withDefaults(defineProps<{ modelValue: string; enabled?: string[]; workspaceName?: string; context?:PageNavigationContext }>(),{enabled:()=>[]})
const emit = defineEmits<{ 'update:modelValue': [id: string]; search: []; manage: []; trash: [] }>()
const { t } = useI18n()
const sections = computed(() => getWorkspaceSections(props.enabled))
const activeSection = computed(() => workspaceSectionFor(props.modelValue))
const memory = new Map<WorkspaceSectionId, string>()
const railMode = useWorkspaceDraft('workspace-rail-mode', 'auto')
// A collapsed rail always supports a temporary preview. Preserve existing open pins.
if (railMode.value !== 'open') railMode.value = 'auto'
const hovered = ref(false), focused = ref(false), mobileOpen = ref(false)
const workspacePickerOpen=ref(false),desktopPicker=ref<InstanceType<typeof WorkspacePicker>>()
const canPickWorkspace=computed(()=>!props.context||Boolean(props.workspaceName))
const pinned = computed(() => railMode.value === 'open')
const expanded = computed(() => pinned.value || hovered.value || focused.value || workspacePickerOpen.value)
const desktop = ref<HTMLElement>(), drawer = ref<HTMLDialogElement>(), mobileTrigger = ref<HTMLButtonElement>()
const icons: Record<string, Component> = { BookOpen, CalendarDays, Heart, Layers, LayoutGrid, NotebookPen, Settings2, Wallet }
const searchShortcut = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'
let previousFocus: HTMLElement | null = null, blockedFocus: EventTarget | null = null
let scrollState: { body: string; root: string; gutter: string } | undefined
let disposed = false

watch(() => props.modelValue, id => {
  const section = workspaceSectionFor(id)
  if (section && props.enabled.includes(id)) memory.set(section, id)
}, { immediate: true })
watch(sections, available => {
  for (const [section, module] of memory) if (!available.some(item => item.id === section && (item.modules as string[]).includes(module))) memory.delete(section)
})

function selectModule(id: string) {
  if (!props.enabled.includes(id)) return
  const section = workspaceSectionFor(id)
  if (!section) return
  memory.set(section, id)
  emit('update:modelValue', id)
  closeMobile()
}
function selectPage(id:string){
  if(!props.context?.items.some(item=>item.id===id))return
  emit('update:modelValue',id);closeMobile()
  void nextTick(()=>{if(!disposed)window.scrollTo?.({top:0,behavior:'auto'})})
}
function selectSection(section: WorkspaceSection) {
  const id = chooseWorkspaceSectionModule(section, memory.get(section.id))
  if (id) selectModule(id)
}
function pointerEnter(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
  blockedFocus = null; hovered.value = true
}
function pointerLeave() {
  hovered.value = false
}
function focusEnter(event: FocusEvent) {
  const target = event.target as Element | null
  if (target?.closest?.('.rail-mark') || !target?.matches?.(':focus-visible')) { focused.value = false; return }
  if (blockedFocus === event.target) return
  blockedFocus = null; focused.value = true
}
function focusLeave() {
  nextTick(() => {
    if (disposed || desktop.value?.contains(document.activeElement)) return
    blockedFocus = null; focused.value = false
  })
}
function closeDesktop() {
  desktopPicker.value?.close()
  hovered.value = false; focused.value = false
  blockedFocus = document.activeElement
}
function togglePin() {
  const open = !pinned.value
  desktopPicker.value?.close()
  railMode.value = open ? 'open' : 'auto'
  hovered.value = false; focused.value = false
  blockedFocus = document.activeElement
}
function outsidePointer(event: PointerEvent) {
  if(workspacePickerOpen.value)return
  if (!desktop.value?.contains(event.target as Node)) closeDesktop()
}
function restoreScroll() {
  if (!scrollState) return
  document.body.style.overflow = scrollState.body
  document.documentElement.style.overflow = scrollState.root
  document.documentElement.style.scrollbarGutter = scrollState.gutter
  scrollState = undefined
}
async function openMobile() {
  if (mobileOpen.value) return
  previousFocus = document.activeElement as HTMLElement
  scrollState = { body: document.body.style.overflow, root: document.documentElement.style.overflow, gutter: document.documentElement.style.scrollbarGutter }
  document.body.style.overflow = 'hidden'; document.documentElement.style.overflow = 'hidden'; document.documentElement.style.scrollbarGutter = 'stable'
  mobileOpen.value = true
  await nextTick()
  if (disposed || !mobileOpen.value) return
  try {
    drawer.value?.showModal()
    drawer.value?.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus({ preventScroll: true })
  } catch { closeMobile() }
}
function closeMobile() {
  if (!mobileOpen.value) return
  mobileOpen.value = false; drawer.value?.close(); restoreScroll()
  if (!disposed) (previousFocus?.isConnected ? previousFocus : mobileTrigger.value)?.focus({ preventScroll: true })
}
function action(name: 'search' | 'manage' | 'trash') {
  closeMobile(); closeDesktop()
  if (name === 'search') emit('search')
  else if (name === 'manage') emit('manage')
  else emit('trash')
}
function drawerKeys(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const controls = [...(drawer.value?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]') || [])].filter(item => item.getClientRects().length)
  if (!controls.length) return
  const first = controls[0]!, last = controls[controls.length - 1]!
  if (event.shiftKey && (document.activeElement === first || !drawer.value?.contains(document.activeElement))) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
function responsiveChange(event: MediaQueryListEvent) { if (event.matches) closeMobile(); else closeDesktop() }
let desktopQuery: MediaQueryList | undefined
onMounted(() => {
  document.addEventListener('pointerdown', outsidePointer)
  desktopQuery = window.matchMedia('(min-width: 1024px)')
  desktopQuery.addEventListener('change', responsiveChange)
})
onBeforeUnmount(() => {
  disposed = true; document.removeEventListener('pointerdown', outsidePointer)
  desktopQuery?.removeEventListener('change', responsiveChange)
  drawer.value?.close(); restoreScroll()
  if (mobileOpen.value && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
})
</script>

<template>
  <Teleport to="body">
  <aside ref="desktop" data-workspace-rail :data-context="context?.title" :data-pinned-open="pinned ? '' : undefined" class="workspace-rail" :class="{ 'is-expanded': expanded }" :aria-label="t(context?.title || 'workspaceNav.navigation')" @pointerenter="pointerEnter" @pointerleave="pointerLeave" @pointerdown="focused = false" @focusin="focusEnter" @focusout="focusLeave" @keydown.esc.stop.prevent="closeDesktop()">
    <div class="rail-heading">
      <button type="button" class="rail-mark" :aria-label="t(pinned ? 'workspaceNav.pinClosed' : 'workspaceNav.pinOpen')" :title="t(pinned ? 'workspaceNav.pinClosed' : 'workspaceNav.pinOpen')" :aria-expanded="expanded" :aria-pressed="pinned" @click="togglePin"><ChevronsLeft v-if="pinned" :size="20" :stroke-width="1.7" /><ChevronsRight v-else :size="20" :stroke-width="1.7" /></button>
      <WorkspacePicker v-if="expanded && canPickWorkspace" ref="desktopPicker" variant="rail" @open-change="workspacePickerOpen=$event" @manage="action('manage')" />
      <div v-else class="rail-heading-copy"><span v-if="!context || workspaceName">{{ t(context?.title || 'workspaceNav.workspace') }}</span><strong :title="workspaceName">{{ workspaceName || t(context?.title || 'workspaceNav.workspace') }}</strong></div>
    </div>
    <div class="rail-content">
      <nav v-if="context" class="rail-categories" :aria-label="t(context.title)">
        <button v-for="item in context.items" :key="item.id" type="button" class="rail-category" :class="{'is-active':modelValue===item.id}" :title="t(item.label)" :aria-label="t(item.label)" :aria-current="modelValue===item.id?'page':undefined" @click="selectPage(item.id)"><span class="rail-category-icon"><component :is="icons[item.icon]" :size="20" :stroke-width="1.65" /></span><span class="rail-category-label">{{ t(item.label) }}</span></button>
      </nav>
      <nav v-else class="rail-categories" :aria-label="t('workspaceNav.sectionsLabel')">
        <button v-for="section in sections" :key="section.id" type="button" class="rail-category" :data-section="section.id" :class="{ 'is-active': activeSection === section.id }" :title="t(`workspaceNav.sections.${section.id}`)" :aria-label="t(`workspaceNav.sections.${section.id}`)" :aria-current="activeSection === section.id ? 'page' : undefined" @click="selectSection(section)">
          <span class="rail-category-icon"><component :is="icons[section.icon]" :size="20" :stroke-width="1.65" /></span><span class="rail-category-label">{{ t(`workspaceNav.sections.${section.id}`) }}</span>
        </button>
      </nav>
    </div>
    <footer v-if="!context" class="rail-footer">
      <button type="button" class="rail-action" :title="t('workspaceNav.search')" :aria-label="t('workspaceNav.search')" @click="action('search')"><Search :size="19" :stroke-width="1.65" /><span>{{ t('workspaceNav.search') }}</span><kbd>{{ searchShortcut }}</kbd></button>
      <button type="button" class="rail-action" :title="t('workspaceNav.trash')" :aria-label="t('workspaceNav.trash')" @click="action('trash')"><Trash2 :size="18" :stroke-width="1.65" /><span>{{ t('workspaceNav.trash') }}</span></button>
      <button type="button" class="rail-action" :title="t('workspaceNav.manage')" :aria-label="t('workspaceNav.manage')" @click="action('manage')"><Settings2 :size="19" :stroke-width="1.65" /><span>{{ t('workspaceNav.manage') }}</span></button>
    </footer>
  </aside>
  </Teleport>
  <button ref="mobileTrigger" type="button" class="rail-mobile-trigger" :aria-expanded="mobileOpen" aria-haspopup="dialog" @click="openMobile"><PanelLeft :size="16" :stroke-width="1.7" /><span>{{ t('workspaceNav.sectionsLabel') }}</span></button>
  <Teleport to="body">
    <dialog ref="drawer" class="rail-drawer" :aria-label="t(context?.title || 'workspaceNav.navigation')" @cancel.prevent="closeMobile" @keydown="drawerKeys" @click="event => { if (event.target === drawer) closeMobile() }">
      <div class="drawer-surface">
        <header class="drawer-heading"><WorkspacePicker v-if="mobileOpen && canPickWorkspace" variant="rail" :portal-target="drawer" @select="closeMobile" @manage="action('manage')" /><div v-else><span v-if="!context || workspaceName">{{ t(context?.title || 'workspaceNav.workspace') }}</span><h2>{{ workspaceName || t(context?.title || 'workspaceNav.sectionsLabel') }}</h2></div><button type="button" class="drawer-close" :aria-label="t('workspaceNav.close')" @click="closeMobile"><X :size="19" /></button></header>
        <nav v-if="context" class="drawer-sections" :aria-label="t(context.title)"><button v-for="item in context.items" :key="item.id" type="button" class="rail-module" :class="{'is-active':modelValue===item.id}" :aria-current="modelValue===item.id?'page':undefined" @click="selectPage(item.id)"><component :is="icons[item.icon]" :size="17" :stroke-width="1.7" /><span>{{ t(item.label) }}</span></button></nav>
        <nav v-else class="drawer-sections" :aria-label="t('workspaceNav.sectionsLabel')">
          <button v-for="section in sections" :key="section.id" type="button" class="rail-module" :data-section="section.id" :class="{'is-active':activeSection===section.id}" :aria-current="activeSection===section.id?'page':undefined" @click="selectSection(section)"><component :is="icons[section.icon]" :size="19" :stroke-width="1.65" /><span>{{ t(`workspaceNav.sections.${section.id}`) }}</span></button>
        </nav>
        <footer v-if="!context" class="drawer-footer"><button type="button" @click="action('search')"><Search :size="18" />{{ t('workspaceNav.search') }}</button><button type="button" @click="action('trash')"><Trash2 :size="18" />{{ t('workspaceNav.trash') }}</button><button type="button" @click="action('manage')"><Settings2 :size="18" />{{ t('workspaceNav.manage') }}</button></footer>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.workspace-rail{position:fixed;z-index:65;inset:14px auto 14px 12px;display:flex;flex-direction:column;width:60px;overflow:hidden;border:1px solid hsl(var(--border)/.65);border-radius:22px;background:hsl(var(--card)/.96);color:hsl(var(--foreground));box-shadow:0 8px 32px hsl(var(--foreground)/.035);backdrop-filter:blur(24px);transition:width 230ms cubic-bezier(.22,1,.36,1),box-shadow 230ms ease;contain:layout paint}
.workspace-rail.is-expanded{width:var(--workspace-rail-open-width,224px);box-shadow:0 12px 36px hsl(var(--foreground)/.08),0 3px 10px hsl(var(--foreground)/.025)}
.rail-heading{display:flex;align-items:center;flex-shrink:0;height:76px;padding:0 10px;gap:13px;white-space:nowrap}
.rail-mark{display:flex;align-items:center;justify-content:center;flex:0 0 38px;height:38px;border:1px solid hsl(var(--border)/.55);border-radius:13px;background:transparent;color:hsl(var(--muted-foreground));transition:background 150ms,color 150ms,border-color 150ms}
.rail-mark[aria-pressed=true]{background:hsl(var(--muted)/.3)}
.rail-heading-copy{display:flex;flex-direction:column;gap:3px;min-width:0;opacity:0;transition:opacity 130ms ease}
.rail-heading-copy>span,.drawer-heading>div>span{font-size:10px;color:hsl(var(--muted-foreground));font-weight:500;letter-spacing:.035em}
.rail-heading-copy strong{font-size:13px;line-height:18px;font-weight:600;overflow:hidden;text-overflow:ellipsis}
.is-expanded .rail-heading-copy{opacity:1}
.rail-content{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;scrollbar-width:none}
.rail-content::-webkit-scrollbar{display:none}
.rail-categories{display:flex;flex-direction:column;gap:5px;padding:3px 8px 10px}
.rail-category{height:43px;min-height:43px;display:flex;align-items:center;gap:12px;padding:0 3px;width:100%;position:relative;border:1px solid transparent;border-radius:12px;color:hsl(var(--muted-foreground));white-space:nowrap;text-align:left;transition:background 150ms,color 150ms,border-color 150ms}
.rail-category-icon{flex:0 0 36px;display:flex;align-items:center;justify-content:center;height:36px}
.rail-category:hover{background:hsl(var(--secondary)/.7);color:hsl(var(--foreground))}
.rail-category.is-active{color:hsl(var(--primary));background:hsl(var(--primary)/.09);border-color:hsl(var(--primary)/.1)}
.rail-category-label{font-size:12px;font-weight:550;flex:1;opacity:0;transition:opacity 130ms ease}
.is-expanded .rail-category-label{opacity:1}
.rail-module{display:flex;align-items:center;gap:10px;position:relative;width:100%;min-height:38px;padding:8px 10px;border:1px solid transparent;border-radius:10px;color:hsl(var(--muted-foreground));font-size:12px;text-align:left;transition:background 150ms,color 150ms,border-color 150ms}
.rail-module>svg{flex-shrink:0;color:hsl(var(--muted-foreground)/.85)}
.rail-module>span{flex:1;min-width:0;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.rail-module:hover{background:hsl(var(--secondary)/.6);color:hsl(var(--foreground))}
.rail-module.is-active{border-color:hsl(var(--primary)/.12);background:hsl(var(--primary)/.075);color:hsl(var(--foreground));font-weight:550}
.rail-module.is-active>svg{color:hsl(var(--primary))}
.rail-footer{padding:10px 9px;display:flex;flex-direction:column;gap:2px;border-top:1px solid hsl(var(--border)/.5);flex-shrink:0}
.rail-action{display:flex;align-items:center;gap:13px;width:100%;height:37px;padding:0 10px;white-space:nowrap;border-radius:10px;color:hsl(var(--muted-foreground));text-align:left;transition:background 150ms,color 150ms}
.rail-action>svg{flex:0 0 19px}
.rail-action>span{font-size:11px;flex:1;opacity:0}
.rail-action>kbd{font-family:inherit;font-size:9px;line-height:18px;padding:0 5px;border:1px solid hsl(var(--border)/.7);border-radius:5px;opacity:0}
.rail-action:hover{background:hsl(var(--secondary)/.65);color:hsl(var(--foreground))}
.is-expanded .rail-action>span,.is-expanded .rail-action>kbd{opacity:1;transition:opacity 130ms ease}
.rail-mark:focus-visible,.rail-category:focus-visible,.rail-module:focus-visible,.rail-action:focus-visible,.rail-mobile-trigger:focus-visible,.drawer-close:focus-visible,.drawer-footer button:focus-visible{outline:2px solid hsl(var(--ring)/.65);outline-offset:2px}
.rail-mark:hover{background:hsl(var(--muted)/.55);color:hsl(var(--foreground));border-color:hsl(var(--border))}
.rail-mobile-trigger{display:none;align-items:center;gap:7px;border:1px solid hsl(var(--border)/.65);border-radius:10px;padding:7px 10px;background:hsl(var(--card)/.75);color:hsl(var(--muted-foreground));font-size:11px;line-height:16px;white-space:nowrap;transition:background 150ms,color 150ms}
.rail-mobile-trigger:hover{background:hsl(var(--secondary));color:hsl(var(--foreground))}
.rail-drawer{position:fixed;inset:0 auto 0 0;margin:0;padding:0;border:0;width:min(320px,calc(100vw - 32px));max-width:none;max-height:none;height:100dvh;overflow:visible;background:transparent;color:hsl(var(--foreground));outline:none}
.rail-drawer::backdrop{background:hsl(var(--foreground)/.18);backdrop-filter:blur(4px)}
.drawer-surface{display:flex;flex-direction:column;height:100%;overflow:hidden;border-right:1px solid hsl(var(--border)/.7);background:hsl(var(--card));box-shadow:12px 0 54px hsl(var(--foreground)/.1)}
.rail-drawer[open] .drawer-surface{animation:drawer-enter 220ms cubic-bezier(.22,1,.36,1)}
.drawer-heading{display:flex;justify-content:space-between;align-items:center;padding:22px 20px 17px;border-bottom:1px solid hsl(var(--border)/.65)}
.drawer-heading>div{min-width:0}.drawer-heading h2{margin:4px 0 0;font-size:15px;line-height:21px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.drawer-close{display:flex;align-items:center;justify-content:center;border-radius:9px;width:32px;height:32px;flex-shrink:0;color:hsl(var(--muted-foreground))}.drawer-close:hover{background:hsl(var(--secondary))}
.drawer-sections{flex:1;min-height:0;overflow-y:auto;padding:15px 14px;overscroll-behavior:contain;scrollbar-width:thin}
.drawer-sections .rail-module{min-height:44px;font-size:12px;margin-top:3px}
.drawer-footer{display:flex;gap:2px;padding:10px 12px max(12px,env(safe-area-inset-bottom));border-top:1px solid hsl(var(--border)/.65)}
.drawer-footer button{display:flex;flex:1;align-items:center;justify-content:center;flex-direction:column;gap:7px;padding:9px 3px;border-radius:10px;font-size:10px;color:hsl(var(--muted-foreground))}.drawer-footer button:hover{background:hsl(var(--secondary));color:hsl(var(--foreground))}
@keyframes drawer-enter{from{opacity:.6;transform:translateX(-20px)}to{opacity:1;transform:translateX(0)}}
@media(max-width:1023px){.workspace-rail{display:none}.rail-mobile-trigger{display:inline-flex}}
@media(prefers-reduced-motion:reduce){.workspace-rail,.workspace-rail *,.rail-mobile-trigger{transition:none!important}.rail-drawer[open] .drawer-surface{animation:none}}
</style>
