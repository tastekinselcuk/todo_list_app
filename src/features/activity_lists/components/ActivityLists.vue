<template>
  <div class="workspace-content mx-auto space-y-6">
    <!-- Header -->
    <header class="space-y-1">
      <h2 class="text-xl font-bold tracking-tight text-foreground">
        {{ $t('activities.title') }}
      </h2>
      <p class="text-sm text-muted-foreground">
        {{ $t('activities.subtitle') }}
      </p>
    </header>

    <!-- Search panel -->
    <section v-if="canWrite" class="rounded-2xl border border-border/40 bg-card/40 p-4 space-y-3">
      <div class="flex flex-col sm:flex-row gap-2.5">
        <select
          v-model="selectedType"
          class="h-11 sm:w-44 rounded-xl border border-border/50 bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary/30"
        >
          <option value="movie">{{ $t('activities.types.movie') }}</option>
          <option value="series">{{ $t('activities.types.series') }}</option>
          <option value="place">{{ $t('activities.types.place') }}</option>
          <option value="book">{{ $t('activities.types.book') }}</option>
        </select>

        <div class="relative flex-1">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <input
            v-model="searchQuery"
            type="search"
            :placeholder="searchPlaceholder"
            class="w-full h-11 pl-10 pr-3 rounded-xl border border-border/50 bg-background/70 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/60"
            @keyup.enter="runSearch"
          />
        </div>

        <button
          type="button"
          class="h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all shrink-0"
          :disabled="!searchQuery.trim() || isSearching"
          @click="runSearch"
        >
          <span v-if="isSearching" class="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span v-else>{{ $t('activities.search') }}</span>
        </button>
      </div>

      <p v-if="needsTmdbKey" class="text-xs text-amber-600 dark:text-amber-400">
        {{ $t('activities.tmdbKeyMissing') }}
      </p>

      <!-- Search results -->
      <div v-if="searchResults.length > 0" class="pt-1">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {{ $t('activities.searchResults') }}
        </p>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          <button
            v-for="result in searchResults"
            :key="`${result.externalSource}-${result.externalId}`"
            type="button"
            class="text-left rounded-xl border border-border/40 bg-background/60 overflow-hidden hover:border-primary/40 hover:shadow-sm transition-all group/result"
            @click="addResult(result)"
          >
            <div class="aspect-[2/3] bg-muted relative overflow-hidden">
              <img
                v-if="result.imageUrl"
                :src="result.imageUrl"
                :alt="result.title"
                class="h-full w-full object-cover group-hover/result:scale-105 transition-transform duration-300"
                loading="lazy"
              />
              <div v-else class="h-full w-full flex items-center justify-center text-muted-foreground/50">
                <Plus class="w-6 h-6" />
              </div>
              <div class="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/70 to-transparent">
                <p class="text-[11px] font-semibold text-white line-clamp-2 leading-tight">{{ result.title }}</p>
              </div>
            </div>
            <div class="px-2 py-1.5 flex items-center justify-between gap-1">
              <span class="text-[10px] text-muted-foreground truncate">{{ result.subtitle }}</span>
              <Plus class="w-3 h-3 text-primary shrink-0" />
            </div>
          </button>
        </div>
      </div>

      <p v-else-if="searched && !isSearching" class="text-xs text-muted-foreground py-2">
        {{ $t('activities.noSearchResults') }}
      </p>
    </section>

    <!-- Status filter -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div class="flex rounded-xl border border-border/50 p-0.5 bg-muted/30">
        <button
          v-for="f in statusFilters"
          :key="f.id"
          type="button"
          class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          :class="statusFilter === f.id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'"
          @click="statusFilter = f.id"
        >
          {{ f.label }}
        </button>
      </div>
      <p class="text-xs text-muted-foreground">
        {{ store.wantCount }} {{ $t('activities.wantLabel') }} · {{ store.doneCount }} {{ $t('activities.done') }}
      </p>
    </div>

    <!-- Loading -->
    <div v-if="store.isLoading && store.items.length === 0" class="flex justify-center py-16">
      <span class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
    </div>

    <!-- Grouped lists -->
    <div v-else class="space-y-8">
      <section v-for="group in visibleGroups" :key="group.type" class="space-y-3">
        <div class="flex items-center gap-2">
          <component :is="group.icon" class="w-4 h-4 text-muted-foreground" />
          <h3 class="text-sm font-bold text-foreground">{{ group.label }}</h3>
          <span class="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
            {{ group.items.length }}
          </span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <ActivityCard
            v-for="item in group.items"
            :key="item.id"
            :item="item"
            :data-search-record="item.id"
            @toggle="toggleItem"
            @delete="removeItem"
          />
        </div>
      </section>

      <div
        v-if="visibleGroups.length === 0"
        class="text-center py-14 px-4 rounded-3xl border border-dashed border-border/40 bg-muted/5"
      >
        <div class="w-12 h-12 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
          <Clapperboard class="w-5 h-5 text-muted-foreground/70" />
        </div>
        <p class="text-sm font-medium text-muted-foreground">{{ $t('activities.empty') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSearchReveal } from '@/lib/searchNavigation'
import { useModuleAccess } from '@/lib/workspaceScope'
import { useWorkspaceDraft } from '@/lib/workspaceScope'
import { computed, onMounted, ref, watch } from 'vue'
import { Search, Plus, Film, Tv, MapPin, BookOpen, Clapperboard } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useUIStore } from '@/stores/ui'
import { useActivityListsStore } from '../stores/activityLists'
import {
  searchActivities,
  isTmdbConfigured,
  type ActivityType,
  type SearchResult,
} from '../lib/providers'
import ActivityCard from './ActivityCard.vue'

const { canWrite } = useModuleAccess('activities')

const { t } = useI18n()
const uiStore = useUIStore()
const store = useActivityListsStore()

const selectedType = useWorkspaceDraft<ActivityType>('activity-type', 'movie')
const searchQuery = useWorkspaceDraft('activity-search', '')
const searchResults = ref<SearchResult[]>([])
const isSearching = ref(false)
const searched = ref(false)
const statusFilter = useWorkspaceDraft<'all' | 'want' | 'done'>('activity-status', 'all')

const statusFilters = computed(() => [
  { id: 'all' as const, label: t('activities.filters.all') },
  { id: 'want' as const, label: t('activities.filters.want') },
  { id: 'done' as const, label: t('activities.filters.done') },
])

const searchPlaceholder = computed(() => t(`activities.searchPlaceholders.${selectedType.value}`))

const needsTmdbKey = computed(
  () =>
    (selectedType.value === 'movie' || selectedType.value === 'series') && !isTmdbConfigured()
)

watch(selectedType, () => {
  searchResults.value = []
  searched.value = false
})

const visibleGroups = computed(() => {
  const order: ActivityType[] = ['movie', 'series', 'place', 'book']
  const icons = { movie: Film, series: Tv, place: MapPin, book: BookOpen }

  return order
    .map((type) => {
      let list = store.itemsByType[type] || []
      if (statusFilter.value !== 'all') {
        list = list.filter((i) => i.status === statusFilter.value)
      }
      return {
        type,
        label: t(`activities.types.${type}`),
        icon: icons[type],
        items: list,
      }
    })
    .filter((g) => g.items.length > 0)
})

onMounted(() => {
  store.loadItems()
})

async function runSearch() {
  if (!searchQuery.value.trim() || isSearching.value) return

  if (needsTmdbKey.value) {
    uiStore.addToast(t('activities.tmdbKeyMissing'), 'error')
    return
  }

  isSearching.value = true
  searched.value = true
  try {
    searchResults.value = await searchActivities(selectedType.value, searchQuery.value)
  } catch (err) {
    searchResults.value = []
    const msg = err instanceof Error ? err.message : ''
    if (msg === 'TMDB_KEY_MISSING') {
      uiStore.addToast(t('activities.tmdbKeyMissing'), 'error')
    } else {
      uiStore.addToast(t('activities.searchError'), 'error')
    }
  } finally {
    isSearching.value = false
  }
}

async function addResult(result: SearchResult) {
  const created = await store.addFromSearch(result)
  if (store.error === 'ALREADY_EXISTS') {
    uiStore.addToast(t('activities.alreadyExists'), 'info')
    store.error = null
    return
  }
  if (created) {
    uiStore.addToast(t('activities.added'), 'success')
  } else if (store.error) {
    uiStore.addToast(store.error, 'error')
  }
}

async function toggleItem(id: string) {
  await store.toggleStatus(id)
}

async function removeItem(id: string) {
  const ok = await uiStore.showConfirm(
    t('activities.deleteTitle'),
    t('activities.deleteDesc'),
    t('common.delete'),
    t('common.cancel')
  )
  if (!ok) return
  await store.deleteItem(id)
  if (!store.error) uiStore.addToast(t('activities.deleted'), 'info')
}
useSearchReveal('activities', async (hit, isCurrent) => { await store.loadItems(hit.record_id);if(!isCurrent())return;statusFilter.value='all' })
</script>
