<template>
  <div class="relative" ref="containerRef">
    <button
      type="button"
      @click="toggle"
      class="appearance-none w-full flex items-center justify-between gap-2 cursor-pointer outline-none transition-all duration-200 truncate"
      :class="[
        sizeClasses,
        variantClasses,
        { 'ring-2 ring-primary/30 border-primary/50': isOpen }
      ]"
      :style="buttonStyle"
    >
      <span class="truncate text-left">{{ displayLabel }}</span>
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
        class="absolute z-[9999] min-w-full py-1 rounded-xl border border-border/60 bg-card backdrop-blur-xl shadow-xl shadow-black/10 overflow-hidden"
        :class="openAbove ? 'bottom-full mb-1' : 'top-full mt-1'"
        :style="{ minWidth: dropdownMinWidth }"
      >
        <div class="max-h-[200px] overflow-y-auto custom-scrollbar">
          <button
            v-for="option in options"
            :key="option.value"
            type="button"
            @click="selectOption(option)"
            class="w-full flex items-center gap-2 px-3 text-left text-sm font-medium transition-colors duration-100 hover:bg-primary/10 hover:text-primary"
            :class="[
              modelValue === option.value
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-foreground',
              size === 'sm' ? 'py-1.5 text-xs' : 'py-2 text-sm'
            ]"
          >
            <div
              v-if="modelValue === option.value"
              class="w-1.5 h-1.5 rounded-full bg-primary shrink-0"
            />
            <div v-else class="w-1.5 shrink-0" />
            <span class="truncate">{{ option.label }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

export interface SelectOption {
  value: string
  label: string
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: SelectOption[]
  placeholder?: string
  size?: 'sm' | 'md'
  variant?: 'default' | 'ghost'
  colorClass?: string
  buttonStyle?: Record<string, string>
}>(), {
  placeholder: 'Seçiniz',
  size: 'md',
  variant: 'default',
  colorClass: '',
  buttonStyle: () => ({})
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isOpen = ref(false)
const openAbove = ref(false)
const containerRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const dropdownMinWidth = ref('160px')

const displayLabel = computed(() => {
  const found = props.options.find(o => o.value === props.modelValue)
  return found ? found.label : props.placeholder
})

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
  openAbove.value = spaceBelow < 220 && rect.top > 220
  dropdownMinWidth.value = `${Math.max(rect.width, 160)}px`
}

function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    nextTick(updatePosition)
  }
}

function selectOption(option: SelectOption) {
  emit('update:modelValue', option.value)
  isOpen.value = false
}

function handleClickOutside(e: MouseEvent) {
  if (
    containerRef.value && !containerRef.value.contains(e.target as Node)
  ) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
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
