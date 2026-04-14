<template>
  <div class="relative flex flex-col border border-border/50 rounded-xl focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 bg-background/50 transition-colors w-full min-w-[250px]">
    
    <div class="flex items-center gap-1 p-1.5 border-b border-border/50 bg-muted/20 flex-wrap shrink-0 rounded-t-xl">
      <button type="button" class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors" @click="exec('bold')" title="Kalın">
        <Bold class="w-4 h-4" />
      </button>
      <button type="button" class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors" @click="exec('italic')" title="İtalik">
        <Italic class="w-4 h-4" />
      </button>
      <button type="button" class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors" @click="exec('strikethrough')" title="Üstü Çizili">
        <Strikethrough class="w-4 h-4" />
      </button>

      <div class="relative inline-flex" ref="colorMenuRef">
        <button 
          type="button" 
          @click="toggleColorMenu"
          class="p-1.5 rounded-lg transition-colors relative overflow-hidden"
          :class="isColorMenuOpen ? 'bg-muted text-foreground' : 'hover:bg-muted text-muted-foreground'"
          title="Renk Paleti"
        >
          <Palette class="w-4 h-4" />
        </button>

        <Transition name="pp">
          <div v-if="isColorMenuOpen" class="cpanel" style="top:calc(100% + 6px);left:0;">
            <ColorSwatches
              :text-colors="textColors"
              :bg-colors="bgColors"
              :recently-used="recentlyUsed"
              @text="c => applyColor('foreColor', c)"
              @bg="c => applyColor('backColor', c)"
            />
          </div>
        </Transition>
      </div>

      <div class="w-px h-4 bg-border/50 mx-1"></div>
      
      <button type="button" class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors" @click="exec('insertUnorderedList')" title="Madde İşaretleri">
        <List class="w-4 h-4" />
      </button>
      <button type="button" class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors" @click="exec('insertOrderedList')" title="Numaralandırma">
        <ListOrdered class="w-4 h-4" />
      </button>
    </div>

    <div
      ref="editorRef"
      class="w-full resize-y overflow-y-auto min-h-[150px] p-3 text-sm focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 editor-content rounded-b-xl"
      :contenteditable="!disabled"
      :data-placeholder="placeholder"
      @input="emitChange"
      @blur="emitChange"
      @paste="handlePaste"
      @drop="handleDrop"
      @dragover.prevent
    ></div>

    <div class="absolute bottom-0 right-0 w-5 h-5 pointer-events-none flex items-end justify-end p-1.5 opacity-40">
      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground">
        <path d="M21 15L15 21"/>
        <path d="M21 8L8 21"/>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, defineComponent, h } from 'vue'
import { Bold, Italic, Strikethrough, List, ListOrdered, Palette } from 'lucide-vue-next'

interface TC { color: string; label: string }
interface RI { type: 'text' | 'bg'; color: string }

// ─── ColorSwatches Alt Bileşeni ─────────────────────────────────────
const ColorSwatches = defineComponent({
  name: 'ColorSwatches',
  props: {
    textColors:    { type: Array as () => TC[], required: true },
    bgColors:      { type: Array as () => TC[], required: true },
    recentlyUsed:  { type: Array as () => RI[], required: true },
  },
  emits: ['text', 'bg'],
  setup(props, { emit }) {
    const label = (txt: string) =>
      h('p', { style: 'font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted-fg);margin:0 0 6px;line-height:1;' }, txt)

    const sep = () =>
      h('div', { style: 'height:1px;background:var(--sep-color);margin:8px 0;' })

    const hover = (el: HTMLElement, on: boolean) => {
      el.style.transform = on ? 'scale(1.15)' : ''
    }

    const plainA = () =>
      h('button', {
        type: 'button', title: 'Varsayılan Metin',
        style: 'width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:transparent;border:none;padding:0;cursor:pointer;transition:transform .1s;flex-shrink:0;',
        onMouseenter: (e: MouseEvent) => hover(e.currentTarget as HTMLElement, true),
        onMouseleave: (e: MouseEvent) => hover(e.currentTarget as HTMLElement, false),
        onClick: () => emit('text', 'inherit'),
      }, h('span', { style: 'font-family:"Lora",Georgia,serif;font-size:12px;font-weight:500;color:var(--muted-fg);line-height:1;' }, 'A'))

    const ringA = (tc: TC) =>
      h('button', {
        type: 'button', title: tc.label,
        style: 'width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:transparent;border:none;padding:0;cursor:pointer;transition:transform .1s;flex-shrink:0;',
        onMouseenter: (e: MouseEvent) => hover(e.currentTarget as HTMLElement, true),
        onMouseleave: (e: MouseEvent) => hover(e.currentTarget as HTMLElement, false),
        onClick: () => emit('text', tc.color),
      }, h('span', {
        style: `width:20px;height:20px;border-radius:50%;border:1.5px solid ${tc.color};display:flex;align-items:center;justify-content:center;`
      }, h('span', {
        style: `font-family:"Lora",Georgia,serif;font-size:11px;font-weight:500;color:${tc.color};line-height:1;`
      }, 'A')))

    const plainBg = () =>
      h('button', {
        type: 'button', title: 'Varsayılan Arka Plan',
        style: 'width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:transparent;border:1.5px solid var(--muted-fg);padding:0;cursor:pointer;transition:transform .1s;flex-shrink:0;',
        onMouseenter: (e: MouseEvent) => hover(e.currentTarget as HTMLElement, true),
        onMouseleave: (e: MouseEvent) => hover(e.currentTarget as HTMLElement, false),
        onClick: () => emit('bg', 'transparent'),
      }, h('svg', { 
        viewBox: '0 0 24 24', width: '12', height: '12', stroke: 'var(--muted-fg)', strokeWidth: '2', strokeLinecap: 'round' 
      }))

    const bgDot = (tc: TC) =>
      h('button', {
        type: 'button', title: tc.label,
        style: `width:22px;height:22px;border-radius:50%;background:${tc.color};border:none;padding:0;cursor:pointer;transition:transform .1s;flex-shrink:0;`,
        onMouseenter: (e: MouseEvent) => hover(e.currentTarget as HTMLElement, true),
        onMouseleave: (e: MouseEvent) => hover(e.currentTarget as HTMLElement, false),
        onClick: () => emit('bg', tc.color),
      })

    const recentBtn = (item: RI) =>
      item.type === 'text'
        ? h('button', {
            type: 'button',
            style: 'width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:transparent;border:none;padding:0;cursor:pointer;transition:transform .1s;flex-shrink:0;',
            onMouseenter: (e: MouseEvent) => hover(e.currentTarget as HTMLElement, true),
            onMouseleave: (e: MouseEvent) => hover(e.currentTarget as HTMLElement, false),
            onClick: () => emit('text', item.color),
          }, h('span', {
            style: `width:20px;height:20px;border-radius:50%;border:1.5px solid ${item.color};display:flex;align-items:center;justify-content:center;`
          }, h('span', { style: `font-family:"Lora",Georgia,serif;font-size:11px;font-weight:500;color:${item.color};line-height:1;` }, 'A')))
        : h('button', {
            type: 'button',
            style: `width:22px;height:22px;border-radius:50%;background:${item.color};border:none;padding:0;cursor:pointer;transition:transform .1s;flex-shrink:0;`,
            onMouseenter: (e: MouseEvent) => hover(e.currentTarget as HTMLElement, true),
            onMouseleave: (e: MouseEvent) => hover(e.currentTarget as HTMLElement, false),
            onClick: () => emit('bg', item.color),
          })

    const row = (children: ReturnType<typeof h>[]) =>
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:4px;' }, children)

    return () => {
      const nodes = []

      if (props.recentlyUsed.length) {
        nodes.push(label('Recently Used'))
        nodes.push(row(props.recentlyUsed.map(recentBtn)))
        nodes.push(sep())
      }

      nodes.push(label('Text Color'))
      nodes.push(row([plainA(), ...props.textColors.map(ringA)]))
      nodes.push(sep())
      nodes.push(label('Highlight Color'))
      nodes.push(row([plainBg(), ...props.bgColors.map(bgDot)]))

      return h('div', { style: '--muted-fg:hsl(var(--muted-foreground));--sep-color:hsl(var(--border)/.4);' }, nodes)
    }
  }
})

// ─── Props / States ────────────────────────────────────────────────────────
const props = defineProps<{
  modelValue: string
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editorRef = ref<HTMLElement | null>(null)
const colorMenuRef = ref<HTMLElement | null>(null)
const isColorMenuOpen = ref(false)
const recentlyUsed = ref<RI[]>([])

// Tema değişkenlerini kullanarak metin renklerini tanımlıyoruz
const textColors: TC[] = [
  { color: 'var(--tt-color-text-gray)', label: 'Gri' },
  { color: 'var(--tt-color-text-brown)', label: 'Kahverengi' },
  { color: 'var(--tt-color-text-orange)', label: 'Turuncu' },
  { color: 'var(--tt-color-text-yellow)', label: 'Sarı' },
  { color: 'var(--tt-color-text-green)', label: 'Yeşil' },
  { color: 'var(--tt-color-text-blue)', label: 'Mavi' },
  { color: 'var(--tt-color-text-purple)', label: 'Mor' },
  { color: 'var(--tt-color-text-pink)', label: 'Pembe' },
  { color: 'var(--tt-color-text-red)', label: 'Kırmızı' },
]

// Tema değişkenlerini kullanarak arka plan renklerini tanımlıyoruz
const bgColors: TC[] = [
  { color: 'var(--tt-color-highlight-gray)', label: 'Gri' },
  { color: 'var(--tt-color-highlight-brown)', label: 'Kahverengi' },
  { color: 'var(--tt-color-highlight-orange)', label: 'Turuncu' },
  { color: 'var(--tt-color-highlight-yellow)', label: 'Sarı' },
  { color: 'var(--tt-color-highlight-green)', label: 'Yeşil' },
  { color: 'var(--tt-color-highlight-blue)', label: 'Mavi' },
  { color: 'var(--tt-color-highlight-purple)', label: 'Mor' },
  { color: 'var(--tt-color-highlight-pink)', label: 'Pembe' },
  { color: 'var(--tt-color-highlight-red)', label: 'Kırmızı' },
]

const toggleColorMenu = () => {
  isColorMenuOpen.value = !isColorMenuOpen.value
}

const addToRecent = (type: 'text' | 'bg', color: string) => {
  if (color === 'inherit' || color === 'transparent') return
  const idx = recentlyUsed.value.findIndex(r => r.type === type && r.color === color)
  if (idx !== -1) recentlyUsed.value.splice(idx, 1)
  recentlyUsed.value.unshift({ type, color })
  if (recentlyUsed.value.length > 5) recentlyUsed.value.pop()
}

// ─── Tarayıcı Uyumluluğu İçin CSS Değişkeni Hack'i ───
// execCommand var(--...) gibi CSS değişkenlerini reddeder. 
// Bu yüzden geçici spesifik bir HEX ile oluşturup, sonra span'ı bulup var(--) ataması yapıyoruz.
const applyColor = (command: string, value: string) => {
  editorRef.value?.focus()
  document.execCommand('styleWithCSS', false, 'true')
  
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return

  const isBg = command === 'backColor'

  // Varsayılana dönüş yapılıyorsa
  if (value === 'transparent' || value === 'inherit') {
    if (isBg) {
      document.execCommand('hiliteColor', false, 'transparent')
      document.execCommand('backColor', false, 'transparent')
    } else {
      document.execCommand('foreColor', false, '#000000') // Tarayıcıya zorla sıfırlama
      document.execCommand('removeFormat', false, '') 
    }
  } 
  // Seçim yoksa ve direkt yazmaya başlanacaksa (imleç konumundaysa)
  else if (sel.isCollapsed) {
    const span = document.createElement('span')
    if (isBg) span.style.backgroundColor = value
    else span.style.color = value
    
    // Görünmez karakter ekle ki içine yazılabilsin
    span.appendChild(document.createTextNode('\u200B'))
    const range = sel.getRangeAt(0)
    range.insertNode(span)
    
    range.setStart(span.firstChild!, 1)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  } 
  // Metin halihazırda seçiliyse (Geçici renk değişimi hilesi)
  else {
    const tempHex = isBg ? '#fefdfc' : '#fdfefc'
    const tempRgb = isBg ? 'rgb(254, 253, 252)' : 'rgb(253, 254, 252)'
    
    if (isBg) {
      document.execCommand('hiliteColor', false, tempHex)
      document.execCommand('backColor', false, tempHex)
    } else {
      document.execCommand('foreColor', false, tempHex)
    }
    
    // Eklenen geçici rengi bulup kalıcı CSS Variable (var(--...)) ile değiştiriyoruz.
    if (editorRef.value) {
      const elements = editorRef.value.querySelectorAll('*')
      elements.forEach(el => {
        const htmlEl = el as HTMLElement
        if (isBg) {
          if (htmlEl.style.backgroundColor === tempRgb || htmlEl.style.backgroundColor === tempHex) {
            htmlEl.style.backgroundColor = value
          }
        } else {
          if (htmlEl.style.color === tempRgb || htmlEl.style.color === tempHex) {
            htmlEl.style.color = value
          }
        }
      })
    }
  }

  emitChange()
  addToRecent(isBg ? 'bg' : 'text', value)
  // NOT: Menü açık kalacak, sadece dışarı tıklandığında kapanacak.
}

const handleClickOutside = (event: MouseEvent) => {
  if (colorMenuRef.value && !colorMenuRef.value.contains(event.target as Node)) {
    isColorMenuOpen.value = false
  }
}

const exec = (cmd: string, value: string | null = null) => {
  document.execCommand(cmd, false, value || undefined)
  editorRef.value?.focus()
  emitChange()
}

const emitChange = () => {
  if (editorRef.value) {
    emit('update:modelValue', editorRef.value.innerHTML)
  }
}

watch(() => props.modelValue, (newVal) => {
  if (editorRef.value && editorRef.value.innerHTML !== newVal) {
    editorRef.value.innerHTML = newVal || ''
  }
})

onMounted(() => {
  if (editorRef.value) {
    editorRef.value.innerHTML = props.modelValue || ''
  }
  document.addEventListener('mousedown', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})

const processImageFiles = (files: FileList | File[]) => {
  let hasImage = false;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.type.startsWith('image/')) {
      hasImage = true;
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        editorRef.value?.focus();
        document.execCommand('insertImage', false, base64);
        emitChange();
      };
      reader.readAsDataURL(file);
    }
  }
  return hasImage;
}

const handlePaste = (e: ClipboardEvent) => {
  if (e.clipboardData && e.clipboardData.items) {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      processImageFiles(files);
    }
  }
}

const handleDrop = (e: DragEvent) => {
  if (e.dataTransfer && e.dataTransfer.files) {
    const hasImage = processImageFiles(e.dataTransfer.files);
    if (hasImage) {
      e.preventDefault();
    }
  }
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Lora:wght@500&display=swap');

/* Tema Değişkenleri: Editör içerisine de etki etmesi için :global olarak eklendi */
:global(:root) {
  /* Tiptap Arka Plan (Highlight) Renkleri - Açık Tema */
  --tt-color-highlight-yellow: #fef9c3;
  --tt-color-highlight-green: #dcfce7;
  --tt-color-highlight-blue: #e0f2fe;
  --tt-color-highlight-purple: #f3e8ff;
  --tt-color-highlight-red: #ffe4e6;
  --tt-color-highlight-gray: #f8f8f7;
  --tt-color-highlight-brown: #f4eeee;
  --tt-color-highlight-orange: #fbecdd;
  --tt-color-highlight-pink: #fcf1f6;

  /* Contrast renkleri eklendi */
  --tt-color-highlight-yellow-contrast: #fbe604;
  --tt-color-highlight-green-contrast: #c7fad8;
  --tt-color-highlight-blue-contrast: #ceeafd;
  --tt-color-highlight-purple-contrast: #e4ccff;
  --tt-color-highlight-red-contrast: #ffccd0;
  --tt-color-highlight-gray-contrast: #54483126;
  --tt-color-highlight-brown-contrast: #d2a28d59;
  --tt-color-highlight-orange-contrast: #e07c3945;
  --tt-color-highlight-pink-contrast: #e188b345;
  
  /* Tiptap Metin Renkleri - Açık Tema */
  --tt-color-text-gray: #6b7280;
  --tt-color-text-brown: #92400e;
  --tt-color-text-orange: #ea580c;
  --tt-color-text-yellow: #ca8a04;
  --tt-color-text-green: #16a34a;
  --tt-color-text-blue: #2563eb;
  --tt-color-text-purple: #9333ea;
  --tt-color-text-pink: #db2777;
  --tt-color-text-red: #dc2626;
}

:global(.dark) {
  /* Tiptap Arka Plan (Highlight) Renkleri - Koyu Tema */
  --tt-color-highlight-yellow: #6b6524;
  --tt-color-highlight-green: #509568;
  --tt-color-highlight-blue: #6e92aa;
  --tt-color-highlight-purple: #583e74;
  --tt-color-highlight-red: #743e42;
  --tt-color-highlight-gray: #2f2f2f;
  --tt-color-highlight-brown: #4a3228;
  --tt-color-highlight-orange: #5c3b23;
  --tt-color-highlight-pink: #4e2c3c;

  /* Contrast renkleri eklendi */
  --tt-color-highlight-yellow-contrast: #58531e;
  --tt-color-highlight-green-contrast: #47855d;
  --tt-color-highlight-blue-contrast: #5e86a1;
  --tt-color-highlight-purple-contrast: #4c3564;
  --tt-color-highlight-red-contrast: #643539;
  --tt-color-highlight-gray-contrast: #ffffff18;
  --tt-color-highlight-brown-contrast: #b8654540;
  --tt-color-highlight-orange-contrast: #e97e2533;
  --tt-color-highlight-pink-contrast: #dc4c9138;

  /* Tiptap Metin Renkleri - Koyu Tema */
  --tt-color-text-gray: #9ca3af;
  --tt-color-text-brown: #d97706;
  --tt-color-text-orange: #f97316;
  --tt-color-text-yellow: #eab308;
  --tt-color-text-green: #22c55e;
  --tt-color-text-blue: #3b82f6;
  --tt-color-text-purple: #a855f7;
  --tt-color-text-pink: #ec4899;
  --tt-color-text-red: #ef4444;
}

.pp-enter-active, .pp-leave-active { transition: opacity .12s ease, transform .12s cubic-bezier(.16,1,.3,1); }
.pp-enter-from, .pp-leave-to       { opacity: 0; transform: scale(.96) translateY(3px); }

.cpanel {
  position: absolute;
  z-index: 9999;
  width: 192px;
  padding: 10px 10px 10px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border) / .7);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.1);
}

:deep(.editor-content) { word-break: break-word; }
:deep(.editor-content ul) { list-style-type: disc; padding-left: 1.5rem; margin-top: 0.25rem; margin-bottom: 0.25rem; }
:deep(.editor-content ol) { list-style-type: decimal; padding-left: 1.5rem; margin-top: 0.25rem; margin-bottom: 0.25rem; }
:deep(.editor-content li) { margin-bottom: 0.25rem; }
:deep(.editor-content img) { max-width: 100%; height: auto; border-radius: 0.5rem; margin-top: 0.5rem; margin-bottom: 0.5rem; border: 1px solid hsl(var(--border) / 0.3); }
:deep(.editor-content a) { color: hsl(var(--primary)); text-decoration: underline; }

::-webkit-resizer {
  background-color: transparent;
}
</style>