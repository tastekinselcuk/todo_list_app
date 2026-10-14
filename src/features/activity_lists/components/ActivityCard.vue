<template>
  <article
    class="workspace-card group relative flex flex-col overflow-hidden bg-card/50"
  >
    <div class="relative aspect-[2/3] bg-muted overflow-hidden">
      <img
        v-if="item.image_url && !imgError"
        :src="item.image_url"
        :alt="item.title"
        class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        loading="lazy"
        @error="imgError = true"
      />
      <div
        v-else
        class="h-full w-full flex flex-col items-center justify-center gap-2"
        :class="placeholderClass"
      >
        <component :is="typeIcon" class="w-8 h-8 opacity-70" />
        <span class="text-[10px] font-semibold uppercase tracking-wider opacity-80">
          {{ $t(`activities.types.${item.type}`) }}
        </span>
      </div>

      <div
        v-if="item.status === 'done'"
        class="absolute inset-0 bg-background/40 flex items-center justify-center"
      >
        <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-500 text-white shadow">
          {{ $t('activities.done') }}
        </span>
      </div>
    </div>

    <div class="flex flex-col gap-1.5 p-3 flex-1">
      <h4 class="text-sm font-semibold leading-snug text-foreground line-clamp-2" :class="{ 'line-through text-muted-foreground': item.status === 'done' }">
        {{ item.title }}
      </h4>
      <p v-if="item.subtitle" class="text-[11px] text-muted-foreground line-clamp-2">
        {{ item.subtitle }}
      </p>

      <div class="mt-auto flex items-center gap-1 pt-2">
        <button :disabled="!canWrite"
          type="button"
          class="flex-1 h-8 rounded-lg text-[11px] font-semibold border transition-all"
          :class="item.status === 'done'
            ? 'bg-muted border-border text-muted-foreground hover:text-foreground'
            : 'bg-primary/10 border-primary/20 text-primary hover:bg-primary/20'"
          @click="$emit('toggle', item.id)"
        >
          {{ item.status === 'done' ? $t('activities.markWant') : $t('activities.markDone') }}
        </button>
        <button v-if="canWrite"
          type="button"
          class="h-8 w-8 rounded-lg border border-border/50 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all flex items-center justify-center"
          :title="$t('common.delete')"
          @click="$emit('delete', item.id)"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { useModuleAccess } from '@/lib/workspaceScope'
import { computed, ref, watch } from 'vue'
import { Trash2, Film, Tv, MapPin, BookOpen } from 'lucide-vue-next'
import type { ActivityItem } from '../stores/activityLists'

const { canWrite } = useModuleAccess('activities')

const props = defineProps<{
  item: ActivityItem
}>()

defineEmits<{
  toggle: [id: string]
  delete: [id: string]
}>()

const imgError = ref(false)

watch(
  () => props.item.image_url,
  () => {
    imgError.value = false
  }
)

const typeIcon = computed(() => {
  const map = { movie: Film, series: Tv, place: MapPin, book: BookOpen }
  return map[props.item.type] || Film
})

const placeholderClass = computed(() => {
  const map: Record<string, string> = {
    movie: 'bg-gradient-to-br from-sky-500/20 to-indigo-500/10 text-sky-700 dark:text-sky-300',
    series: 'bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 text-violet-700 dark:text-violet-300',
    place: 'bg-gradient-to-br from-emerald-500/20 to-teal-500/10 text-emerald-700 dark:text-emerald-300',
    book: 'bg-gradient-to-br from-amber-500/20 to-orange-500/10 text-amber-700 dark:text-amber-300',
  }
  return map[props.item.type] || map.movie
})
</script>
