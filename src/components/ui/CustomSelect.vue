<template>
  <div class="relative" ref="containerRef" @keydown="handleKeydown" @keydown.esc.stop.prevent="close()">
    <button
      type="button"
      ref="triggerRef"
      :aria-label="ariaLabel"
      :aria-expanded="isOpen"
      :disabled="disabled"
      @mousedown="preserveFocus && $event.preventDefault()"
      @click="toggle"
      class="appearance-none w-full flex items-center justify-between gap-2 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-default disabled:opacity-50 transition-all duration-200 truncate"
      :class="[
        sizeClasses,
        variantClasses,
        { 'ring-2 ring-primary/30 border-primary/50': isOpen }
      ]"
      :style="buttonStyle"
    >
      <slot name="value" :option="selectedOption"><span class="truncate text-left">{{ displayLabel }}</span></slot>
      <ChevronDown
        class="shrink-0 opacity-60 transition-transform duration-200"
        :class="[isOpen ? 'rotate-180' : '', iconSizeClass]"
      />
    </button>

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95 translate-y-1"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 translate-y-1"
    >
      <div
        v-if="isOpen"
        ref="dropdownRef"
        :popover="popover ? 'manual' : undefined"
        class="select-menu absolute z-[9999] min-w-full py-1 rounded-xl border border-border/60 bg-card backdrop-blur-xl shadow-xl shadow-black/10 overflow-hidden"
        :class="popover ? '' : openAbove ? 'bottom-full mb-1' : 'top-full mt-1'"
        :style="{ minWidth: dropdownMinWidth, ...floatingStyle }"
      >
        <div v-if="searchable" class="relative mx-1 mb-1 border-b border-border/40">
          <Search aria-hidden="true" class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <input ref="searchRef" v-model="query" type="search" autocomplete="off" spellcheck="false" :aria-label="searchPlaceholder" :placeholder="searchPlaceholder" class="h-9 w-full min-w-0 bg-transparent pl-7 pr-2 text-xs font-normal text-foreground outline-none placeholder:text-muted-foreground/60" @keydown.enter.stop.prevent="selectFirstMatch" />
        </div>
        <div class="select-options max-h-[200px] overflow-y-auto custom-scrollbar" :style="popover ? {maxHeight:'min(200px, var(--select-menu-height))'} : undefined">
          <button
            v-for="option in filteredOptions"
            :key="option.value"
            type="button"
            :disabled="option.disabled"
            @mousedown="preserveFocus && $event.preventDefault()"
            @click="selectOption(option)"
            class="select-option w-full flex items-center gap-2 px-3 text-left text-sm font-medium transition-colors duration-100 hover:bg-primary/10 hover:text-primary disabled:cursor-default disabled:opacity-40"
            :class="[
              modelValue === option.value
                ? 'select-option-selected bg-primary/10 text-primary font-semibold'
                : 'text-foreground',
              size === 'sm' ? 'py-1.5 text-xs' : 'py-2 text-sm'
            ]"
          >
            <div
              v-if="modelValue === option.value"
              class="w-1.5 h-1.5 rounded-full bg-primary shrink-0"
            />
            <div v-else class="w-1.5 shrink-0" />
            <slot name="option" :option="option"><span class="truncate">{{ option.label }}</span></slot>
          </button>
          <p v-if="!filteredOptions.length" role="status" class="px-3 py-3 text-xs text-muted-foreground">{{ emptyText }}</p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { ChevronDown, Search } from 'lucide-vue-next'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: SelectOption[]
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  size?: 'sm' | 'md'
  variant?: 'default' | 'ghost'
  colorClass?: string
  preserveFocus?: boolean
  searchable?: boolean
  popover?: boolean
  searchPlaceholder?: string
  emptyText?: string
  buttonStyle?: Record<string, string>
}>(), {
  placeholder: 'Seçiniz',
  size: 'md',
  variant: 'default',
  colorClass: '',
  searchPlaceholder: 'Ara…',
  emptyText: 'Sonuç bulunamadı',
  buttonStyle: () => ({})
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'open-change': [value: boolean]
}>()

const isOpen = ref(false)
const openAbove = ref(false)
const containerRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const dropdownMinWidth = ref('160px')
const floatingStyle=ref<Record<string,string>>({})
const query=ref(''),searchRef=ref<HTMLInputElement|null>(null)
const filteredOptions=computed(()=>{
  const search=query.value.trim().toLowerCase()
  return !props.searchable || !search ? props.options : props.options.filter(option=>`${option.label} ${option.value}`.toLowerCase().includes(search))
})

const selectedOption = computed(() => props.options.find(o => o.value === props.modelValue))
const displayLabel = computed(() => selectedOption.value?.label || props.placeholder)

const sizeClasses = computed(() =>
  props.size === 'sm'
    ? 'h-8 px-3 text-xs rounded-xl'
    : 'h-10 px-3 text-xs rounded-xl'
)

const iconSizeClass = computed(() =>
  props.size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'
)

const variantClasses = computed(() => {
  const base = 'border font-semibold'
  if (props.colorClass) return `${base} ${props.colorClass}`
  return props.variant === 'ghost'
    ? `${base} border-transparent bg-transparent hover:bg-muted/60 text-muted-foreground`
    : `${base} border-border/50 bg-card/60 hover:bg-muted/60 text-foreground`
})

function updatePosition() {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const height=props.searchable?260:220
  openAbove.value = spaceBelow < height && rect.top > height
  dropdownMinWidth.value = `${Math.max(rect.width, 160)}px`
  if(props.popover){
    const width=Math.max(rect.width,160),height=dropdownRef.value?.offsetHeight||Math.min(props.options.length*34+8,220)
    const top=Math.max(8,openAbove.value?rect.top-height-4:rect.bottom+4)
    const available=Math.max(64,window.innerHeight-top-8)
    floatingStyle.value={position:'fixed',inset:'auto',left:`${Math.max(8,Math.min(rect.left,window.innerWidth-width-8))}px`,top:`${top}px`,margin:'0',maxWidth:'calc(100vw - 16px)',maxHeight:`${available}px`,'--select-menu-height':`${Math.max(32,available-10-(props.searchable?42:0))}px`}
  }
}

function toggle() {
  if (props.disabled) return
  isOpen.value = !isOpen.value
  emit('open-change', isOpen.value)
  if (isOpen.value) {
    query.value=''
    nextTick(()=>{if(!isOpen.value)return;updatePosition();if(props.popover){dropdownRef.value?.showPopover?.();updatePosition()}searchRef.value?.focus({preventScroll:true})})
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (props.disabled || !['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return
  if(event.target===searchRef.value && ['Home','End'].includes(event.key))return
  if (!isOpen.value && ['Home','End'].includes(event.key)) return
  event.preventDefault()
  const opening=!isOpen.value
  if (opening) toggle()
  if(opening && props.searchable)return
  nextTick(() => {
    if (!isOpen.value) return
    const choices=Array.from(dropdownRef.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])
    if (!choices.length) return
    const index=choices.indexOf(document.activeElement as HTMLButtonElement)
    const target=event.key==='Home'?0:event.key==='End'?choices.length-1:opening || index<0?(event.key==='ArrowUp'?choices.length-1:0):(index+(event.key==='ArrowUp'?-1:1)+choices.length)%choices.length
    choices[target]?.focus()
  })
}
watch(() => props.disabled, value => { if (value) close(false) })

function selectOption(option: SelectOption) {
  if (props.disabled || option.disabled) return
  emit('update:modelValue', option.value)
  close()
}
function selectFirstMatch(){
  const option=filteredOptions.value.find(option=>!option.disabled)
  if(option)selectOption(option)
}

function close(restoreFocus = true) {
  if (!isOpen.value) return
  if(props.popover)dropdownRef.value?.hidePopover?.()
  isOpen.value = false
  emit('open-change', false)
  if (restoreFocus && !props.preserveFocus) triggerRef.value?.focus()
}

function popoverScroll(event:Event){if(props.popover&&isOpen.value&&!dropdownRef.value?.contains(event.target as Node))close(false)}
defineExpose({ close })

function handleClickOutside(e: Event) {
  if (
    containerRef.value && !containerRef.value.contains(e.target as Node)
  ) {
    close(false)
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleClickOutside, true)
  document.addEventListener('focusin', handleClickOutside, true)
  if(props.popover){document.addEventListener('scroll',popoverScroll,true);window.addEventListener('resize',updatePosition)}
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleClickOutside, true)
  document.removeEventListener('focusin', handleClickOutside, true)
  if(props.popover){document.removeEventListener('scroll',popoverScroll,true);window.removeEventListener('resize',updatePosition)}
})
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.2);
  border-radius: 9999px;
}
</style>
