import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

export interface Flashcard {
  id: string
  front: string
  back: string
}

export interface Deck {
  id: string
  title: string
  color: string
  cards: Flashcard[]
}

export const useFlashcardStore = defineStore('flashcards', () => {
  const authStore = useAuthStore()
  const decks = ref<Deck[]>([])
  const isLoading = ref(false)

  const fetchDecks = async () => {
    if (!authStore.user) return
    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('flashcard_decks')
        .select('*')
        .eq('user_id', authStore.user.id)
        .order('created_at', { ascending: true })

      if (error) throw error
      if (data) decks.value = data
    } catch (err) {
      console.error('Error fetching decks:', err)
    } finally {
      isLoading.value = false
    }
  }

  const addDeck = async (title: string, color: string) => {
    if (!authStore.user) return
    const tempId = 'temp-' + Date.now()
    const newDeck: Deck = { id: tempId, title, color, cards: [] }
    decks.value.push(newDeck)

    try {
      const { data, error } = await supabase
        .from('flashcard_decks')
        .insert({ user_id: authStore.user.id, title, color, cards: [] })
        .select().single()

      if (error) throw error
      const index = decks.value.findIndex(d => d.id === tempId)
      if (index !== -1) decks.value[index] = data
    } catch (err) {
      decks.value = decks.value.filter(d => d.id !== tempId)
    }
  }

  const deleteDeck = async (id: string) => {
    const previous = [...decks.value]
    decks.value = decks.value.filter(d => d.id !== id)
    try {
      const { error } = await supabase.from('flashcard_decks').delete().eq('id', id)
      if (error) throw error
    } catch (err) {
      decks.value = previous
    }
  }

  const syncCards = async (deckId: string, cards: Flashcard[]) => {
    try {
      const { error } = await supabase.from('flashcard_decks').update({ cards }).eq('id', deckId)
      if (error) throw error
    } catch (err) {
      console.error('Error updating cards:', err)
    }
  }

  const addCard = (deckId: string, front: string, back: string) => {
    const deck = decks.value.find(d => d.id === deckId)
    if (!deck) return
    deck.cards.push({ id: Date.now().toString(), front, back })
    syncCards(deckId, deck.cards)
  }

  const deleteCard = (deckId: string, cardId: string) => {
    const deck = decks.value.find(d => d.id === deckId)
    if (!deck) return
    deck.cards = deck.cards.filter(c => c.id !== cardId)
    syncCards(deckId, deck.cards)
  }

  return { decks, isLoading, fetchDecks, addDeck, deleteDeck, addCard, deleteCard }
})