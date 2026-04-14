<template>
  <transition name="expand">
    <div
      v-if="open"
      class="flex flex-col py-4 px-5 mb-4 rounded-2xl border border-border/50 bg-card/40 transition-all duration-300 w-full relative overflow-hidden"
    >
      <div class="flex items-center justify-between gap-3 border-b border-border/30 pb-3">
        <h2 class="text-sm font-bold tracking-tight text-foreground">
          {{ $t('todo.addCategory') || 'Kategori Ekle' }}
        </h2>
        <button 
          @click="closeModal" 
          class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <form @submit.prevent="handleSubmit" class="pt-4 space-y-5">
        
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-muted-foreground ml-1">
            {{ $t('todo.categoryName') || 'Kategori Adı' }}
          </label>
          <input
            v-model="newCategory.name"
            type="text"
            class="w-full h-10 rounded-xl border border-border/50 bg-background/50 px-4 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            :placeholder="$t('todo.enterCategoryName') || 'Kategori adını girin'"
            required
            ref="nameInputRef"
          />
        </div>

        <div class="space-y-2">
          <label class="text-xs font-semibold text-muted-foreground ml-1">
            {{ $t('todo.color') || 'Renk' }}
          </label>
          <div class="grid grid-cols-8 gap-2">
            <button
              v-for="color in predefinedColors"
              :key="color"
              type="button"
              class="w-7 h-7 rounded-full transition-all hover:scale-110 focus:outline-none"
              :class="{ 'ring-2 ring-primary ring-offset-2 ring-offset-card scale-110 shadow-sm': newCategory.color === color }"
              :style="{ backgroundColor: color }"
              @click="newCategory.color = color"
            />
          </div>
        </div>

        <div class="space-y-1.5 pt-3 border-t border-border/30">
          <label class="text-xs font-semibold text-muted-foreground ml-1">
            {{ $t('todo.customHexColor') || 'Özel Hex Renk' }}
          </label>
          <div class="flex items-center gap-3">
            <input
              v-model="newCategory.color"
              type="text"
              class="flex-1 h-10 rounded-xl border border-border/50 bg-background/50 px-4 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="#3B82F6"
              pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
            />
            <div 
              class="w-10 h-10 rounded-xl border border-border/50 shrink-0 shadow-sm transition-colors" 
              :style="{ backgroundColor: newCategory.color }" 
            />
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button 
            type="button" 
            @click="closeModal" 
            class="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
          >
            {{ $t('todo.cancel') || 'İptal' }}
          </button>
          <button 
            type="submit" 
            :disabled="!newCategory.name.trim()"
            class="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ $t('todo.createCategory') || 'Oluştur' }}
          </button>
        </div>
      </form>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { X } from 'lucide-vue-next'
import { useTodoStore } from '@/features/todos/stores/todo'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const todoStore = useTodoStore()
const uiStore = useUIStore()
const { t } = useI18n()

const nameInputRef = ref<HTMLInputElement | null>(null)
const newCategory = ref({ name: '', color: '#3B82F6', icon: 'folder' })
const predefinedColors = ['#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6']

// Açılış anında inputa otomatik odaklanma (Kullanıcı deneyimini artırır)
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      nameInputRef.value?.focus({ preventScroll: true })
    })
  } else {
    // Kapandığında formu hafif bir gecikmeyle sıfırla ki animasyon bozulmasın
    setTimeout(() => {
      resetForm()
    }, 300)
  }
})

const closeModal = () => {
  emit('update:open', false)
}

const resetForm = () => {
  newCategory.value = { name: '', color: '#3B82F6', icon: 'folder' }
}

const handleSubmit = async () => {
  const result = await todoStore.addCategory(newCategory.value)
  if (result.success) {
    closeModal()
    uiStore.addToast(t('todo.categoryAdded') || 'Kategori eklendi', 'success')
  } else {
    uiStore.addToast(result.message || t('todo.cannotDelete'), 'error')
  }
}
</script>

<style scoped>
/* Referans kodunuzdaki aynı yumuşak Açılma/Kapanma Animasyonu */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 500px;
  opacity: 1;
}
.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  margin-bottom: 0;
}
</style>