import { defineWorkspaceStore as defineStore, useWorkspaceClient } from '@/lib/workspaceScope'
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

export interface Flashcard {
  _version?: number
  id: string
  front: string
  back: string
}

export interface Deck {
  version?: number
  id: string
  title: string
  color: string
  cards: Flashcard[]
}

export const useFlashcardStore = defineStore('flashcards', () => {
  const authStore = useAuthStore()
  const supabase = useWorkspaceClient()
  const decks = ref<Deck[]>([])
  const isLoading = ref(false)
  const savingChildren = ref(0)
  async function changeItem(parentId: string, operation: string, item: Record<string, unknown>, version?: number) {
    savingChildren.value++
    try {
      const result = await supabase.mutateItem('flashcards', parentId, operation, item, version)
      const current = decks.value.find(deck => deck.id === parentId)
      if (current && (current.version ?? 0) <= result.version) Object.assign(current, result)
      return true
    } catch (err) { console.error('Card not saved:', err); return false }
    finally { savingChildren.value-- }
  }

  let fetchDecksGeneration = 0
  const fetchDecks = async (targetId?: string) => {
    const request = ++fetchDecksGeneration
    if (!authStore.user) return false
    isLoading.value = true
    try {
      let { data, error } = await supabase
        .from('flashcard_decks')
        .select('*')
        .eq('user_id', authStore.user.id)
        .order('created_at', { ascending: true })

      if (request !== fetchDecksGeneration) return false
      if (error) throw error
      if (typeof targetId === 'string' && !(data || []).some((row: { id: string }) => row.id === targetId)) {
        const located = await supabase.from('flashcard_decks').select('*').eq('id', targetId).maybeSingle()
        if (located.error) throw located.error
        if (located.data) data = [located.data, ...(data || [])]
      }
      if (request !== fetchDecksGeneration) return false
      if (data) decks.value = data
      return true
    } catch (err) {
      if (request !== fetchDecksGeneration) return false
      console.error('Error fetching decks:', err)
      return false
    } finally {
      if (request === fetchDecksGeneration) isLoading.value = false
    }
  }

  const addDeck = async (title: string, color: string) => {
    if (!authStore.user) return false
    savingChildren.value++
    try {
      const { data, error } = await supabase.from('flashcard_decks').insert({ user_id: authStore.user.id, title, color, cards: [] }).select().single()
      if (error) throw error
      decks.value.push(data)
      return true
    } catch { return false }
    finally { savingChildren.value-- }
  }

  const deleteDeck = async (id: string) => {
    savingChildren.value++
    try {
      const { error } = await supabase.from('flashcard_decks').delete().eq('id', id)
      if (error) throw error
      decks.value = decks.value.filter(item => item.id !== id)
      return true
    } catch { return false }
    finally { savingChildren.value-- }
  }

  const syncCards = async (deckId: string, cards: Flashcard[]) => {
    try {
      const { error } = await supabase.from('flashcard_decks').update({ cards }).eq('id', deckId)
      if (error) throw error
    } catch (err) {
      console.error('Error updating cards:', err)
    }
  }

  const addCard = async (deckId: string, front: string, back: string) => {
    const deck = decks.value.find(d => d.id === deckId)
    if (!deck) return
    if (supabase.collection('flashcards')) {
      return changeItem(deckId, 'add', { front, back })
    }
    deck.cards.push({ id: Date.now().toString(), front, back })
    syncCards(deckId, deck.cards)
    return true
  }

  const deleteCard = async (deckId: string, cardId: string) => {
    const deck = decks.value.find(d => d.id === deckId)
    if (!deck) return
    if (supabase.collection('flashcards')) {
      const card = deck.cards.find(c => c.id === cardId)
      return changeItem(deckId, 'delete', { id: cardId }, card?._version)
    }
    deck.cards = deck.cards.filter(c => c.id !== cardId)
    syncCards(deckId, deck.cards)
    return true
  }

  supabase.listen?.({ flashcard_decks: fetchDecks }, () => isLoading.value || Boolean(savingChildren.value))
  return { decks, isLoading, fetchDecks, addDeck, deleteDeck, addCard, deleteCard }
})
