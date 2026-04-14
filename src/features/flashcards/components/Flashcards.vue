<template>
  <div class="space-y-5 animate-in fade-in zoom-in-95 duration-500 relative z-10 w-full flex flex-col items-center min-h-[400px]">
    
    <div v-if="currentView === 'decks'" class="w-full max-w-5xl space-y-6">
      <div class="flex flex-col sm:flex-row gap-2.5 w-full relative z-[60]">
        <div class="relative flex-1 group">
          <Layers class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <input
            v-model="newDeckTitle"
            @keyup.enter="handleAddDeck"
            type="text"
            :placeholder="$t('flashcards.deckPlaceholder')"
            class="w-full h-10 pl-10 pr-3 rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground/60 shadow-sm focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all outline-none text-sm font-medium"
          />
        </div>
        
        <div class="flex items-center gap-2">
          <div class="relative w-10 h-10 rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm shadow-sm overflow-hidden cursor-pointer hover:border-primary/40 transition-colors">
            <input v-model="newDeckColor" type="color" class="absolute -top-2 -left-2 w-14 h-14 cursor-pointer" />
          </div>
          <button
            @click="handleAddDeck"
            class="h-10 px-5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-sm hover:shadow-lg transition-all disabled:opacity-50 text-xs flex items-center gap-1.5 shrink-0"
            :disabled="!newDeckTitle.trim()"
          >
            <Plus class="w-3.5 h-3.5" /> {{ $t('flashcards.create') }}
          </button>
        </div>
      </div>

      <div v-if="store.decks.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
        <div
          v-for="deck in store.decks"
          :key="deck.id"
          @click="openDeck(deck)"
          class="group flex flex-col p-5 rounded-[1.5rem] border transition-all duration-300 cursor-pointer overflow-hidden relative bg-card/40 backdrop-blur-xl hover:bg-card hover:border-primary/30 hover:shadow-md hover:-translate-y-1"
          :style="{ borderColor: `${deck.color}40` }"
        >
          <div class="absolute top-0 right-0 w-24 h-24 blur-[40px] -mr-8 -mt-8 pointer-events-none opacity-0 transition-opacity duration-500" :style="{ backgroundColor: deck.color }"></div>

          <div class="flex items-start justify-between relative z-10 mb-2">
            <div class="flex items-center gap-2">
              <Layers class="w-4 h-4 opacity-70" :style="{ color: deck.color }" />
              <h3 class="font-bold text-sm text-foreground tracking-tight line-clamp-1 group-hover:text-primary transition-colors">{{ deck.title }}</h3>
            </div>
            <button @click.stop="handleDeleteDeck(deck.id)" class="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-rose-500 transition-all">
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
          
          <div class="mt-auto relative z-10 pl-6">
            <p class="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">
              {{ $t('flashcards.cardsInDeck', { count: deck.cards.length }) }}
            </p>
          </div>
        </div>
      </div>

      <div v-else class="text-center py-12 flex flex-col items-center justify-center border border-dashed border-border/40 rounded-[2rem] bg-muted/5 w-full max-w-5xl">
        <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
          <Layers class="w-4 h-4 text-muted-foreground/40" />
        </div>
        <p class="text-xs font-semibold text-muted-foreground/80">Henüz hiç deste eklemedin.</p>
      </div>
    </div>

    <div v-else-if="currentView === 'study' && activeDeck" class="w-full max-w-5xl space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between bg-card/40 backdrop-blur-2xl p-3 sm:p-4 rounded-2xl shadow-sm border border-white/10 dark:border-white/5 gap-4 relative overflow-hidden z-20">
        <div class="flex items-center gap-3">
          <button @click="currentView = 'decks'" class="p-2 rounded-xl bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border/50">
            <ArrowLeft class="w-4 h-4" />
          </button>
          <div class="p-2 rounded-xl shadow-inner border" :style="{ backgroundColor: `${activeDeck.color}15`, color: activeDeck.color, borderColor: `${activeDeck.color}30` }">
            <Layers class="w-3.5 h-3.5" />
          </div>
          <h2 class="text-sm font-bold tracking-tight text-foreground">{{ activeDeck.title }}</h2>
        </div>

        <div v-if="activeDeck.cards.length > 0" class="flex items-center gap-2 w-full sm:w-auto">
          <button 
            @click="startTest" 
            class="flex-1 sm:flex-none h-9 px-5 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all border border-border/50"
          >
            <CheckSquare class="w-3.5 h-3.5" /> TEST
          </button>
          <button 
            @click="startMemoryGame" 
            class="flex-1 sm:flex-none h-9 px-5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-sm hover:shadow-md hover:bg-primary/90 flex items-center justify-center gap-1.5 transition-all"
          >
            <Play class="w-3.5 h-3.5 fill-current" /> OYNA
          </button>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row gap-2.5 max-w-5xl w-full relative z-10">
        <input 
          v-model="newCardFront" 
          @keyup.enter="focusBackInput" 
          type="text" 
          :placeholder="$t('flashcards.frontPlaceholder')" 
          class="flex-1 h-10 px-4 rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground/60 shadow-sm focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all outline-none text-sm font-medium" 
        />
        <input 
          id="backInput" 
          v-model="newCardBack" 
          @keyup.enter="handleAddCard" 
          type="text" 
          :placeholder="$t('flashcards.backPlaceholder')" 
          class="flex-1 h-10 px-4 rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground/60 shadow-sm focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all outline-none text-sm font-medium" 
        />
        <button 
          @click="handleAddCard" 
          :disabled="!newCardFront.trim() || !newCardBack.trim()" 
          class="h-10 px-6 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-sm transition-all disabled:opacity-50 text-xs shrink-0"
        >
          {{ $t('flashcards.addCard') }}
        </button>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 perspective-1000 relative z-0">
        <div v-for="card in activeDeck.cards" :key="card.id" class="relative w-full h-32 cursor-pointer group" @click="toggleCard(card.id)">
          <div class="absolute inset-0 w-full h-full transition-all duration-500 transform-style-3d shadow-sm rounded-2xl" :class="{ 'rotate-y-180': flippedCards.includes(card.id) }">
            <div class="absolute inset-0 w-full h-full bg-card/60 backdrop-blur-sm border border-border/50 rounded-2xl backface-hidden flex items-center justify-center p-4 text-center group-hover:border-primary/40 transition-colors">
              <button @click.stop="handleDeleteCard(card.id)" class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all z-10">
                <Trash2 class="w-3.5 h-3.5" />
              </button>
              <span class="font-semibold text-sm text-foreground line-clamp-3">{{ card.front }}</span>
            </div>
            <div class="absolute inset-0 w-full h-full bg-primary/5 border border-primary/20 rounded-2xl backface-hidden rotate-y-180 flex items-center justify-center p-4 text-center shadow-inner">
              <span class="font-bold text-sm text-primary line-clamp-3">{{ card.back }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <FlashcardTest 
      v-else-if="currentView === 'test' && activeDeck" 
      :deck="activeDeck" 
      @back="currentView = 'study'" 
      @finish="handleTestFinish" 
    />
    
    <FlashcardMemoryGame 
      v-else-if="currentView === 'game' && activeDeck" 
      :deck="activeDeck" 
      @back="currentView = 'study'" 
      @finish="handleGameFinish" 
    />

    <div v-else-if="currentView === 'results'" class="w-full max-w-md mx-auto text-center space-y-6 py-12 animate-in slide-in-from-bottom-8 duration-700">
      <div class="relative inline-flex items-center justify-center w-20 h-20 rounded-full mb-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
        <div class="absolute inset-0 rounded-full blur-xl opacity-40 bg-emerald-500"></div>
        <Award class="w-8 h-8 relative z-10" />
      </div>
      
      <div class="space-y-1">
        <template v-if="testResults.length > 0">
          <h2 class="text-3xl font-black tracking-tight text-foreground">{{ scorePercentage }} Puan</h2>
          <p class="text-muted-foreground font-medium text-xs">{{ $t('flashcards.scoreDesc', { correct: correctCount, total: testResults.length }) }}</p>
          <div class="w-full h-2 bg-muted/50 rounded-full overflow-hidden my-4 border border-border/50">
            <div class="h-full transition-all duration-1000" :class="scorePercentage >= 70 ? 'bg-emerald-500' : 'bg-amber-500'" :style="{ width: `${scorePercentage}%` }"></div>
          </div>
        </template>
        
        <template v-else>
          <h2 class="text-3xl font-black tracking-tight text-foreground">Tebrikler!</h2>
          <p class="text-muted-foreground font-medium text-sm mt-2">Hafıza oyununu <span class="font-bold text-primary">{{ gameScore }}</span> puan ile tamamladın.</p>
          <p v-if="gameErrors > 0" class="text-rose-500 font-bold text-[10px] uppercase tracking-widest mt-1">{{ gameErrors }} Hata</p>
          <p v-else class="text-emerald-500 font-bold text-[10px] uppercase tracking-widest mt-1">Kusursuz Performans</p>
        </template>
      </div>

      <button @click="currentView = 'study'" class="h-10 px-6 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 shadow-sm transition-all hover:-translate-y-0.5 mt-4">
        {{ $t('flashcards.backToStudyMode') }}
      </button>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Layers, Plus, Trash2, ArrowLeft, Play, Award, CheckSquare } from 'lucide-vue-next'
import { useFlashcardStore, type Deck } from '@/features/flashcards/stores/flashcards'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'

import FlashcardTest from './FlashcardTest.vue'
import FlashcardMemoryGame from './FlashcardMemoryGame.vue'

const store = useFlashcardStore()
const uiStore = useUIStore()
const { t } = useI18n()

// Base State
const currentView = ref<'decks' | 'study' | 'test' | 'game' | 'results'>('decks')
const activeDeck = ref<Deck | null>(null)
const newDeckTitle = ref('')
const newDeckColor = ref('#f97316') 
const newCardFront = ref('')
const newCardBack = ref('')
const flippedCards = ref<string[]>([]) 

// Results State
const testResults = ref<{cardId: string, isCorrect: boolean}[]>([])
const gameScore = ref(0)
const gameErrors = ref(0)

onMounted(async () => {
  await store.fetchDecks()
})

const handleAddDeck = async () => {
  if (!newDeckTitle.value.trim()) return
  try {
    await store.addDeck(newDeckTitle.value.trim(), newDeckColor.value)
    uiStore.addToast('Deste eklendi', 'success')
    newDeckTitle.value = ''
  } catch (error) {
    uiStore.addToast('Hata', 'error')
  }
}

const handleDeleteDeck = async (id: string) => {
  const isConfirmed = await uiStore.showConfirm('Desteyi Sil', t('flashcards.deleteDeckConfirm'), 'Sil', 'İptal')
  if (isConfirmed) {
    store.deleteDeck(id)
    uiStore.addToast('Deste silindi', 'info')
  }
}

const openDeck = (deck: Deck) => {
  activeDeck.value = deck
  flippedCards.value = []
  currentView.value = 'study'
}

const focusBackInput = () => {
  const el = document.getElementById('backInput')
  if (el) el.focus()
}

const handleAddCard = () => {
  if (!activeDeck.value || !newCardFront.value.trim() || !newCardBack.value.trim()) return
  store.addCard(activeDeck.value.id, newCardFront.value.trim(), newCardBack.value.trim())
  uiStore.addToast('Kart eklendi', 'success')
  newCardFront.value = ''
  newCardBack.value = ''
  const frontInput = document.querySelector('input[type="text"]:first-of-type') as HTMLInputElement
  if (frontInput) frontInput.focus()
}

const handleDeleteCard = async (cardId: string) => {
  const isConfirmed = await uiStore.showConfirm('Kartı Sil', 'Bu kartı desteden silmek istiyor musunuz?', 'Sil', 'İptal')
  if (isConfirmed && activeDeck.value) {
    store.deleteCard(activeDeck.value.id, cardId)
    uiStore.addToast('Kart silindi', 'info')
  }
}

const toggleCard = (cardId: string) => {
  const index = flippedCards.value.indexOf(cardId)
  if (index === -1) flippedCards.value.push(cardId)
  else flippedCards.value.splice(index, 1)
}

const startTest = () => {
  testResults.value = []
  gameScore.value = 0
  currentView.value = 'test'
}

const startMemoryGame = () => {
  if (!activeDeck.value || activeDeck.value.cards.length < 2) {
    uiStore.addToast('Oyun için destede en az 2 kart olmalı!', 'error')
    return
  }
  testResults.value = []
  gameScore.value = 0
  currentView.value = 'game'
}

const handleTestFinish = (results: {cardId: string, isCorrect: boolean}[]) => {
  testResults.value = results
  currentView.value = 'results'
}

const handleGameFinish = (payload: { score: number, errors: number }) => {
  gameScore.value = payload.score
  gameErrors.value = payload.errors
  currentView.value = 'results'
}

// Computed for Results
const correctCount = computed(() => testResults.value.filter(r => r.isCorrect).length)
const scorePercentage = computed(() => activeDeck.value && activeDeck.value.cards.length > 0 ? Math.round((correctCount.value / activeDeck.value.cards.length) * 100) : 0)

</script>

<style scoped>
.perspective-1000 { perspective: 1000px; }
.transform-style-3d { transform-style: preserve-3d; }
.backface-hidden { backface-visibility: hidden; }
.rotate-y-180 { transform: rotateY(180deg); }
</style>