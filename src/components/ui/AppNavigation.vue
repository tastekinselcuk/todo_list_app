<template>
  <nav
    ref="navigation"
    data-app-navigation
    :aria-label="t('app.navigation')"
    :inert="!visible"
    :class="['app-navigation fixed left-1/2 z-50 flex max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-full border border-border/60 bg-card/80 p-1 shadow-[0_6px_24px_rgb(0,0,0,0.04)] backdrop-blur-2xl', visible ? 'is-visible' : 'is-hidden', { 'is-docked': docked, 'is-attached': attached, 'is-workspace': workspace }]"
    :style="{ top: attached ? `${(headerOffset ?? workspaceHeaderHeight) - workspaceHeaderHeight}px` : '14px', height: attached ? `${workspaceHeaderHeight}px` : undefined }"
    @focusin="emit('reveal')"
  >
    <div ref="viewStrip" class="view-strip relative flex items-center gap-0.5 rounded-full p-0.5">
      <span aria-hidden="true" class="view-indicator absolute bottom-0.5 left-0 top-0.5 rounded-full border border-border/40 bg-background shadow-sm" :style="{ width: `${indicator.width}px`, transform: `translateX(${indicator.left}px)`, opacity: indicator.width ? 1 : 0 }" />
      <button v-for="(view, index) in views" :key="view.id" :ref="element => setButton(element, index)" type="button" :aria-current="activeView === view.id ? 'page' : undefined" :aria-label="t(view.label)" :title="t(view.label)" :class="['relative z-10 flex min-h-9 items-center justify-center gap-2 rounded-full px-3 text-[13px] font-medium transition-colors active:scale-[0.97] sm:px-4', activeView === view.id ? 'text-foreground' : 'text-muted-foreground hover:bg-background/20 hover:text-foreground']" @click="emit('navigate', view.id)">
        <component :is="view.icon" class="h-4 w-4 shrink-0" /><span class="view-label whitespace-nowrap">{{ t(view.label) }}</span>
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { Briefcase, BarChart3, LayoutDashboard, Settings2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { workspaceHeaderHeight } from '@/lib/navigationScroll'

type View = 'dashboard' | 'workspace' | 'analytics' | 'settings'
const props = defineProps<{ activeView: View; visible: boolean; docked: boolean; attached?: boolean; workspace?: boolean; headerOffset?: number }>()
const emit = defineEmits<{ navigate: [view: View]; reveal: [] }>()
const { t, locale } = useI18n()
const views: { id: View; label: string; icon: typeof Briefcase }[] = [
  { id: 'dashboard', label: 'app.home', icon: LayoutDashboard },
  { id: 'workspace', label: 'app.workspace', icon: Briefcase },
  { id: 'analytics', label: 'app.analytics', icon: BarChart3 },
  { id: 'settings', label: 'app.settings', icon: Settings2 },
]
const navigation = ref<HTMLElement>()
const viewStrip = ref<HTMLElement>()
const buttons = ref<(HTMLButtonElement | null)[]>([])
const indicator = ref({ left: 0, width: 0 })
let observer: ResizeObserver | undefined
let disposed = false
function setButton(element: Element | ComponentPublicInstance | null, index: number) { buttons.value[index] = element as HTMLButtonElement | null }
async function measure() {
  await nextTick()
  if (disposed) return
  const button = buttons.value[views.findIndex(view => view.id === props.activeView)]
  if (!button || !viewStrip.value) return
  indicator.value = { left: button.offsetLeft, width: button.offsetWidth }
}
watch(() => [props.activeView, props.docked, props.attached, locale.value], () => { void measure() })
onMounted(() => {
  void measure()
  observer = new ResizeObserver(() => { void measure() })
  if (viewStrip.value) observer.observe(viewStrip.value)
  void document.fonts.ready.then(() => { if (!disposed) void measure() })
})
onBeforeUnmount(() => { disposed = true; observer?.disconnect() })
</script>

<style scoped>
.app-navigation { transform: translate(-50%, 0); transition: top 240ms cubic-bezier(.22,1,.36,1), left 240ms cubic-bezier(.22,1,.36,1), transform 240ms cubic-bezier(.22,1,.36,1), opacity 180ms ease; }
.app-navigation.is-hidden { transform: translate(-50%, calc(-100% - 5rem)); opacity: 0; pointer-events: none; }
.app-navigation.is-visible { opacity: 1; }
.app-navigation.is-docked { padding: 0; border-width: 0; background: transparent; box-shadow: none; backdrop-filter: none; }
.app-navigation.is-attached { padding:3px; border-width:1px; border-radius:14px; background:hsl(var(--card)/.98); box-shadow:none; backdrop-filter:none; }
.app-navigation.is-attached .view-strip { height:100%; flex-shrink:0; }
@media (min-width:1024px) { .app-navigation.is-workspace { left:calc(50% + var(--workspace-content-shift, 40px)); } }
.app-navigation.is-docked button { min-height: 2rem; padding-inline: .75rem; font-size: .75rem; }
.view-label { display: none; }
@media (min-width: 768px) { .app-navigation:not(.is-docked) .view-label { display: inline; } }
@media (min-width: 1280px) { .app-navigation.is-docked .view-label { display: inline; } }
.view-indicator { transition: transform 220ms cubic-bezier(.22,1,.36,1), width 220ms cubic-bezier(.22,1,.36,1), opacity 150ms ease; }
@media (max-width: 639px) {
  .app-navigation:not(.is-docked) { left: 1rem; max-width: calc(100% - 6rem); transform: translate(0, 0); }
  .app-navigation:not(.is-docked).is-hidden { transform: translate(0, calc(-100% - 5rem)); }
  .app-navigation.is-docked button { padding-inline: .25rem; }
  .app-navigation.is-docked .view-strip { gap: 0; }
}
.app-navigation button:focus-visible { outline: 2px solid hsl(var(--primary) / .45); outline-offset: 2px; }
.app-navigation.is-attached,.app-navigation.is-attached.is-hidden { transform:translate(-50%,0); transition:left 240ms cubic-bezier(.22,1,.36,1),opacity 180ms ease; }
@media(max-width:639px) { .app-navigation.is-attached:not(.is-docked),.app-navigation.is-attached:not(.is-docked).is-hidden { transform:none; } }
@media (prefers-reduced-motion: reduce) { .app-navigation, .app-navigation * { transition: none !important; } }
</style>
