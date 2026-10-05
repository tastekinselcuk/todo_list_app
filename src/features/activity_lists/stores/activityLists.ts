import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { ActivitySource, ActivityType, SearchResult } from '../lib/providers'

export type ActivityStatus = 'want' | 'done'

export interface ActivityItem {
  id: string
  user_id: string
  type: ActivityType
  title: string
  subtitle: string | null
  image_url: string | null
  external_id: string | null
  external_source: ActivitySource | string | null
  meta: Record<string, unknown>
  status: ActivityStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export const useActivityListsStore = defineStore('activityLists', () => {
  const authStore = useAuthStore()

  const items = ref<ActivityItem[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const wantCount = computed(() => items.value.filter((i) => i.status === 'want').length)
  const doneCount = computed(() => items.value.filter((i) => i.status === 'done').length)

  const itemsByType = computed(() => {
    const groups: Record<ActivityType, ActivityItem[]> = {
      movie: [],
      series: [],
      place: [],
      book: [],
    }
    for (const item of items.value) {
      groups[item.type]?.push(item)
    }
    return groups
  })

  const loadItems = async () => {
    if (!authStore.user) return
    isLoading.value = true
    error.value = null

    try {
      const { data, error: supabaseError } = await supabase
        .from('activity_items')
        .select('*')
        .eq('user_id', authStore.user.id)
        .order('created_at', { ascending: false })

      if (supabaseError) throw supabaseError
      items.value = (data || []) as ActivityItem[]
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load list'
      console.error('Error loading activity items:', err)
    } finally {
      isLoading.value = false
    }
  }

  const addFromSearch = async (result: SearchResult, notes?: string) => {
    if (!authStore.user) return null

    const exists = items.value.find(
      (i) =>
        i.type === result.type &&
        i.external_source === result.externalSource &&
        i.external_id === result.externalId
    )
    if (exists) {
      error.value = 'ALREADY_EXISTS'
      return exists
    }

    isLoading.value = true
    error.value = null

    try {
      const payload = {
        user_id: authStore.user.id,
        type: result.type,
        title: result.title,
        subtitle: result.subtitle || null,
        image_url: result.imageUrl,
        external_id: result.externalId,
        external_source: result.externalSource,
        meta: result.meta || {},
        status: 'want' as const,
        notes: notes?.trim() || null,
      }

      const { data, error: supabaseError } = await supabase
        .from('activity_items')
        .insert([payload])
        .select()

      if (supabaseError) {
        if (supabaseError.code === '23505') {
          error.value = 'ALREADY_EXISTS'
          return null
        }
        throw supabaseError
      }

      if (data?.[0]) {
        items.value.unshift(data[0] as ActivityItem)
        return data[0] as ActivityItem
      }
      return null
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to add item'
      console.error('Error adding activity item:', err)
      return null
    } finally {
      isLoading.value = false
    }
  }

  const toggleStatus = async (id: string) => {
    const item = items.value.find((i) => i.id === id)
    if (!item) return

    const next: ActivityStatus = item.status === 'want' ? 'done' : 'want'
    const prev = item.status
    item.status = next

    try {
      const { error: supabaseError } = await supabase
        .from('activity_items')
        .update({ status: next, updated_at: new Date().toISOString() })
        .eq('id', id)

      if (supabaseError) throw supabaseError
    } catch (err) {
      item.status = prev
      error.value = err instanceof Error ? err.message : 'Failed to update'
      console.error('Error toggling activity status:', err)
    }
  }

  const deleteItem = async (id: string) => {
    try {
      const { error: supabaseError } = await supabase
        .from('activity_items')
        .delete()
        .eq('id', id)

      if (supabaseError) throw supabaseError
      items.value = items.value.filter((i) => i.id !== id)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete'
      console.error('Error deleting activity item:', err)
    }
  }

  return {
    items,
    isLoading,
    error,
    wantCount,
    doneCount,
    itemsByType,
    loadItems,
    addFromSearch,
    toggleStatus,
    deleteItem,
  }
})
