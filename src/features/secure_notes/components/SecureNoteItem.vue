<template>
  <div class="group bg-card/40 backdrop-blur-md text-card-foreground p-5 rounded-[1.5rem] shadow-sm border border-border/50 hover:border-primary/30 transition-all duration-300 flex flex-col">
    
    <div class="flex items-start justify-between mb-4">
      <div class="space-y-1.5 pr-4">
        <div class="flex items-center gap-2">
          <span
            class="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest border"
            :class="{
              'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20': note.type === 'password',
              'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20': note.type === 'secret'
            }"
          >
            {{ note.type === 'password' ? $t('secure.typePassword') : $t('secure.typeSecret') }}
          </span>
        </div>
        <h3 class="font-bold text-base tracking-tight text-foreground line-clamp-1">{{ note.title }}</h3>
        <p v-if="note.description" class="text-xs font-medium text-muted-foreground/80 line-clamp-2">
          {{ note.description }}
        </p>
      </div>
      
      <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button @click="$emit('edit', note)" class="p-1.5 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-colors" :title="$t('secure.editNoteTitle')">
          <Edit class="h-3.5 w-3.5" />
        </button>
        <button @click="$emit('delete', note.id)" class="p-1.5 hover:bg-rose-500/10 rounded-xl text-muted-foreground hover:text-rose-500 transition-colors" :title="$t('secure.deleteNoteTitle')">
          <Trash2 class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
    
    <div class="mt-auto pt-2 mb-2">
      
      <div v-if="note.type === 'password'" class="space-y-2">
        <div class="flex items-center justify-between bg-muted/30 p-2.5 rounded-xl border border-border/40 hover:border-primary/20 transition-colors group/copy">
          <div class="flex flex-col min-w-0 pr-2">
            <span class="text-[9px] font-bold text-muted-foreground/70 uppercase tracking-widest">{{ $t('secure.username') }}</span>
            <span class="text-xs font-semibold text-foreground truncate mt-0.5">{{ note.username || '-' }}</span>
          </div>
          <button @click="copyToClipboard(note.username || '', 'Kullanıcı adı')" class="w-7 h-7 flex items-center justify-center bg-muted/50 hover:bg-primary/10 hover:text-primary rounded-lg text-muted-foreground transition-colors shrink-0">
            <Copy class="h-3 w-3" />
          </button>
        </div>
        
        <div class="flex items-center justify-between bg-muted/30 p-2.5 rounded-xl border border-border/40 hover:border-primary/20 transition-colors group/copy">
          <div class="flex flex-col min-w-0 pr-2">
            <span class="text-[9px] font-bold text-muted-foreground/70 uppercase tracking-widest">{{ $t('secure.password') }}</span>
            <span class="text-xs font-mono text-foreground tracking-widest mt-0.5">
              {{ showPassword ? note.password_encrypted : '••••••••' }}
            </span> 
          </div>
          <div class="flex gap-1 shrink-0">
            <button @click="showPassword = !showPassword" class="w-7 h-7 flex items-center justify-center bg-muted/50 hover:bg-primary/10 hover:text-primary rounded-lg text-muted-foreground transition-colors">
              <Eye v-if="showPassword" class="h-3 w-3" />
              <EyeOff v-else class="h-3 w-3" />
            </button>
            <button @click="copyToClipboard(note.password_encrypted || '', 'Şifre')" class="w-7 h-7 flex items-center justify-center bg-muted/50 hover:bg-primary/10 hover:text-primary rounded-lg text-muted-foreground transition-colors">
              <Copy class="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
      
      <div v-else class="bg-muted/30 p-3 rounded-xl border border-border/40 relative group/copy">
        <p class="text-xs font-mono transition-all duration-300 pr-8 line-clamp-3" :class="showPassword ? 'blur-none' : 'blur-sm'">
          {{ note.content }}
        </p>
        <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/copy:opacity-100 transition-all">
          <button @click="showPassword = !showPassword" class="w-7 h-7 flex items-center justify-center rounded-lg bg-card border border-border/50 shadow-sm hover:text-primary transition-all">
            <Eye v-if="showPassword" class="h-3.5 w-3.5" />
            <EyeOff v-else class="h-3.5 w-3.5" />
          </button>
          <button @click="copyToClipboard(note.content || '', 'Gizli içerik')" class="w-7 h-7 flex items-center justify-center rounded-lg bg-card border border-border/50 shadow-sm hover:text-primary transition-all">
            <Copy class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      
      <div v-if="note.url" class="pt-3">
        <a :href="note.url" target="_blank" class="inline-flex items-center gap-1.5 text-[10px] font-bold text-primary hover:text-primary/80 transition-colors bg-primary/5 px-2 py-1 rounded-md border border-primary/10">
          <Globe class="w-3 h-3" /> {{ note.url.replace(/^https?:\/\//, '') }}
        </a>
      </div>

    </div>
    
    <div class="flex items-center justify-between text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 pt-3 border-t border-border/30">
      <span>{{ formattedDate }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Edit, Trash2, Copy, Eye, EyeOff, Globe } from 'lucide-vue-next'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  note: any // İsterseniz buraya SecureNote tipini import edebilirsiniz
}>()

defineEmits<{
  edit: [note: any]
  delete: [id: string]
}>()

const uiStore = useUIStore()
const { t } = useI18n()

// Her karta özel lokal state (Ana dosyadaki Record karmaşasından kurtulduk!)
const showPassword = ref(false)

const formattedDate = computed(() => {
  const currentLang = t('workspace.language') === 'Dil' ? 'tr-TR' : 'en-US'
  return new Date(props.note.created_at).toLocaleDateString(currentLang, { year: 'numeric', month: 'short', day: 'numeric' })
})

const copyToClipboard = async (text: string, type: string) => {
  try {
    await navigator.clipboard.writeText(text)
    uiStore.addToast(`${type} kopyalandı!`, 'success')
  } catch (e) {
    uiStore.addToast('Kopyalama başarısız', 'error')
  }
}
</script>