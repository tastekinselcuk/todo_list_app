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
          <div class="absolute top-0 right-0 w-24 h-24 blur-[40px] -mr-8 -mt-8 pointer-events-none opacity-0 transition-opacity duration-500 group-hover:opacity-20" :style="{ backgroundColor: deck.color }"></div>

          <div class="flex items-start justify-between relative z-10 mb-3">
            <div class="p-2.5 rounded-xl shadow-inner transition-colors" :style="{ backgroundColor: `${deck.color}15`, color: deck.color }">
              <Layers class="w-4 h-4" />
            </div>
            <button @click.stop="handleDeleteDeck(deck.id)" class="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all">
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
          
          <div class="mt-auto space-y-1 relative z-10">
            <h3 class="font-bold text-base text-foreground tracking-tight group-hover:text-primary transition-colors truncate">{{ deck.title }}</h3>
            <p class="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">{{ $t('flashcards.cardsInDeck', { count: deck.cards.length }) }}</p>
          </div>
        </div>
      </div>

      <div v-else class="text-center py-16 flex flex-col items-center justify-center border border-dashed border-border/40 rounded-2xl bg-muted/5 w-full max-w-5xl">
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
          <div class="flex flex-col min-w-0">
            <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{{ $t('flashcards.title') }}</span>
            <h2 class="text-sm font-bold tracking-tight text-foreground truncate">{{ activeDeck.title }}</h2>
          </div>
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

    <div v-else-if="currentView === 'test' && activeDeck" class="w-full max-w-2xl mx-auto pt-4 space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      
      <div class="flex items-center justify-between mb-8 bg-card/40 backdrop-blur-xl p-4 rounded-2xl border border-border/50 shadow-sm">
        <div class="flex items-center gap-3">
          <button @click="currentView = 'study'" class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"><ArrowLeft class="w-4 h-4" /></button>
          <h2 class="text-sm font-bold tracking-tight text-foreground">{{ $t('flashcards.testTitle', { title: activeDeck.title }) }} (Test)</h2>
        </div>
        <span class="text-[10px] font-bold px-3 py-1.5 bg-muted/50 rounded-lg uppercase tracking-widest text-muted-foreground border border-border/50">
          {{ $t('flashcards.answeredCount', { answered: testResults.length, total: activeDeck.cards.length }) }}
        </span>
      </div>

      <div class="space-y-3">
        <div v-for="(card, index) in activeDeck.cards" :key="card.id" class="p-4 rounded-2xl border transition-all duration-300 relative overflow-hidden" :class="getCardStatusClass(card.id)">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <span class="text-sm font-semibold w-1/3 text-foreground">{{ card.front }}</span>
            
            <div class="flex-1 flex gap-2">
              <input 
                v-model="testInputs[card.id]" 
                @keyup.enter="checkAnswer(card.id, card.back)"
                :disabled="hasAnswered(card.id)"
                type="text" 
                :placeholder="$t('flashcards.typeMeaningPlaceholder')" 
                class="flex-1 h-9 px-4 rounded-xl border bg-background/50 text-sm font-medium focus:outline-none transition-colors"
                :class="hasAnswered(card.id) ? 'border-transparent bg-transparent text-foreground' : 'border-border/50 focus:ring-1 focus:ring-primary/30'"
              />
              <button v-if="!hasAnswered(card.id)" @click="checkAnswer(card.id, card.back)" class="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 shadow-sm">{{ $t('flashcards.check') }}</button>
            </div>
            
            <div v-if="hasAnswered(card.id)" class="w-6 flex justify-end shrink-0">
              <Check v-if="isCorrect(card.id)" class="w-4 h-4 text-emerald-500" />
              <X v-else class="w-4 h-4 text-destructive" />
            </div>
          </div>
          
          <div v-if="hasAnswered(card.id) && !isCorrect(card.id)" class="mt-2 text-[10px] text-destructive font-bold border-t border-destructive/20 pt-2 relative z-10 uppercase tracking-widest">
            {{ $t('flashcards.correctAnswer') }} <span class="text-foreground text-xs font-black tracking-normal ml-1">{{ card.back }}</span>
          </div>
        </div>
      </div>

      <div v-if="testResults.length === activeDeck.cards.length" class="mt-8 flex justify-center animate-in zoom-in duration-500">
        <button @click="finishTest" class="h-10 px-6 rounded-xl bg-emerald-500 text-white font-bold text-xs shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 flex items-center gap-2">
          <Award class="w-4 h-4" /> {{ $t('flashcards.seeFinalResults') }}
        </button>
      </div>
    </div>

    <div v-else-if="currentView === 'game' && activeDeck" class="w-full max-w-4xl mx-auto pt-4 space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      
      <div class="flex items-center justify-between bg-card/40 backdrop-blur-xl p-4 rounded-2xl border border-border/50 shadow-sm">
        <div class="flex items-center gap-3">
          <button @click="currentView = 'study'" class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"><ArrowLeft class="w-4 h-4" /></button>
          <div class="flex flex-col">
            <h2 class="text-sm font-bold tracking-tight text-foreground ml-1">{{ activeDeck.title }} (Oyun)</h2>
            <span class="text-[10px] font-medium text-muted-foreground ml-1 mt-0.5">Eşleşenleri bul.</span>
          </div>
        </div>
        
        <div class="flex items-center gap-4">
          <div class="text-right">
            <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">Puan</span>
            <span class="text-lg font-black" :class="gameScore < 0 ? 'text-rose-500' : 'text-primary'">{{ gameScore }}</span>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 perspective-1000">
        <div 
          v-for="gameCard in gameCards" 
          :key="gameCard.uniqueId" 
          @click="flipMemoryCard(gameCard)"
          class="relative w-full h-28 sm:h-32 cursor-pointer group"
          :class="{ 'pointer-events-none': gameCard.isMatched || isChecking || flippedMemoryCards.includes(gameCard.uniqueId) }"
        >
          <div 
            class="absolute inset-0 w-full h-full transition-all duration-500 transform-style-3d shadow-sm rounded-2xl" 
            :class="{ 'rotate-y-180': flippedMemoryCards.includes(gameCard.uniqueId) || gameCard.isMatched, 'shake': gameCard.isError }"
          >
            <div class="absolute inset-0 w-full h-full bg-card/60 backdrop-blur-sm border border-border/50 rounded-2xl backface-hidden flex items-center justify-center p-4 group-hover:border-primary/40 transition-colors">
              <div class="w-8 h-8 rounded-full border border-border/50 flex items-center justify-center shadow-inner bg-background/50">
                <div class="w-2 h-2 bg-muted-foreground/30 rounded-full"></div>
              </div>
            </div>
            
            <div 
              class="absolute inset-0 w-full h-full rounded-2xl backface-hidden rotate-y-180 flex items-center justify-center p-3 text-center transition-colors duration-300 border bg-card/80 backdrop-blur-sm"
              :class="gameCard.isMatched ? 'border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)] text-emerald-500' : (gameCard.isError ? 'border-rose-500/30 text-rose-500 bg-rose-500/5' : 'border-primary/30 text-foreground')"
            >
              <span class="font-bold text-sm line-clamp-3 leading-snug">{{ gameCard.text }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="matchedPairs.length === activeDeck.cards.length" class="mt-8 flex justify-center animate-in zoom-in duration-500">
        <button @click="currentView = 'results'" class="h-10 px-6 rounded-xl bg-emerald-500 text-white font-bold text-xs shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 flex items-center gap-2">
          <Award class="w-4 h-4" /> SONUÇLARI GÖR
        </button>
      </div>
    </div>

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
import { Layers, Plus, Trash2, ArrowLeft, Play, Check, Award, CheckSquare } from 'lucide-vue-next'
import { useFlashcardStore, type Deck, type Flashcard } from '@/stores/flashcards'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'

const store = useFlashcardStore()
const uiStore = useUIStore()
const { t } = useI18n()

// Base State (Orijinal yapıyı koruduk, "game" seçeneği eklendi)
const currentView = ref<'decks' | 'study' | 'test' | 'game' | 'results'>('decks')
const activeDeck = ref<Deck | null>(null)
const newDeckTitle = ref('')
const newDeckColor = ref('#f97316') 
const newCardFront = ref('')
const newCardBack = ref('')

const flippedCards = ref<string[]>([]) 

// Eski TEST (Sınav) Modu State'leri
const testInputs = ref<Record<string, string>>({})
const testResults = ref<{cardId: string, isCorrect: boolean}[]>([])

// YENİ HAFIZA OYUNU State'leri
interface MemoryCard {
  uniqueId: string
  cardId: string
  text: string
  type: 'front' | 'back'
  isMatched: boolean
  isError?: boolean
}
const gameCards = ref<MemoryCard[]>([]) 
const flippedMemoryCards = ref<string[]>([]) 
const matchedPairs = ref<string[]>([]) 
const gameErrors = ref(0)
const gameScore = ref(0)
const isChecking = ref(false)

onMounted(async () => {
  await store.fetchDecks()
})

// Decks Logic
const handleAddDeck = async () => {
  if (!newDeckTitle.value.trim()) return
  const result = await store.addDeck(newDeckTitle.value.trim(), newDeckColor.value)
  if (result.success) {
    uiStore.addToast('Deste eklendi', 'success')
    newDeckTitle.value = ''
  } else {
    uiStore.addToast(result.message || 'Hata', 'error')
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

// Cards Logic
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

// --- ESKİ TEST MANTIĞI ---
const startTest = () => {
  testInputs.value = {}
  testResults.value = []
  // Oyun verilerini temizle ki sonuç ekranı karışmasın
  gameScore.value = 0
  gameErrors.value = 0
  currentView.value = 'test'
}

const checkAnswer = (cardId: string, correctBack: string) => {
  if (hasAnswered(cardId)) return
  
  const userInput = (testInputs.value[cardId] || '').trim().toLowerCase()
  const correctAnswer = correctBack.trim().toLowerCase()
  const isCorrectAnswer = userInput === correctAnswer
  
  testResults.value.push({ cardId, isCorrect: isCorrectAnswer })

  if (isCorrectAnswer) playSuccessSound()
  else playErrorSound()
}

const hasAnswered = (cardId: string) => testResults.value.some(r => r.cardId === cardId)
const isCorrect = (cardId: string) => testResults.value.find(r => r.cardId === cardId)?.isCorrect

const getCardStatusClass = (cardId: string) => {
  if (!hasAnswered(cardId)) return 'bg-card/40'
  return isCorrect(cardId) 
    ? 'bg-emerald-500/10 border-emerald-500/30' 
    : 'bg-destructive/10 border-destructive/30'
}

const correctCount = computed(() => testResults.value.filter(r => r.isCorrect).length)
const scorePercentage = computed(() => activeDeck.value ? Math.round((correctCount.value / activeDeck.value.cards.length) * 100) : 0)


// --- YENİ HAFIZA OYUNU MANTIĞI ---
const startMemoryGame = () => {
  if (!activeDeck.value) return
  
  if (activeDeck.value.cards.length < 2) {
    uiStore.addToast('Oyun için destede en az 2 kart olmalı!', 'error')
    return
  }

  // Test verilerini temizle ki sonuç ekranı karışmasın
  testResults.value = []
  
  gameScore.value = 0
  gameErrors.value = 0
  flippedMemoryCards.value = []
  matchedPairs.value = []
  isChecking.value = false

  const cardsArr: MemoryCard[] = []

  activeDeck.value.cards.forEach(c => {
    cardsArr.push({ uniqueId: c.id + '-front', cardId: c.id, text: c.front, type: 'front', isMatched: false })
    cardsArr.push({ uniqueId: c.id + '-back', cardId: c.id, text: c.back, type: 'back', isMatched: false })
  })

  gameCards.value = cardsArr.sort(() => Math.random() - 0.5)
  currentView.value = 'game'
}

const flipMemoryCard = (card: MemoryCard) => {
  if (isChecking.value || card.isMatched || flippedMemoryCards.value.includes(card.uniqueId)) return

  flippedMemoryCards.value.push(card.uniqueId)
  playWarmTick() // Kart çevirme sesi

  if (flippedMemoryCards.value.length === 2) {
    isChecking.value = true
    checkMatch()
  }
}

const checkMatch = () => {
  const id1 = flippedMemoryCards.value[0]
  const id2 = flippedMemoryCards.value[1]
  
  const card1 = gameCards.value.find(c => c.uniqueId === id1)!
  const card2 = gameCards.value.find(c => c.uniqueId === id2)!

  if (card1.cardId === card2.cardId && card1.type !== card2.type) {
    // DOĞRU
    setTimeout(() => {
      playSuccessSound()
      card1.isMatched = true
      card2.isMatched = true
      matchedPairs.value.push(card1.cardId)
      gameScore.value += 10
      
      flippedMemoryCards.value = []
      isChecking.value = false
    }, 400)
  } 
  else {
    // YANLIŞ
    gameErrors.value += 1
    gameScore.value -= 1 
    card1.isError = true
    card2.isError = true
    playErrorSound()

    setTimeout(() => {
      card1.isError = false
      card2.isError = false
      flippedMemoryCards.value = []
      isChecking.value = false
    }, 1000)
  }
}

const finishTest = () => {
  currentView.value = 'results'
}

// SICAK VE OYUNU HİSSETTİREN SESLER
const playWarmTick = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(600, ctx.currentTime) 
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.1)
  } catch(e) {}
}

const playSuccessSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    // Yumuşak, neşeli bir ton
    osc.frequency.setValueAtTime(440, ctx.currentTime) // A4
    osc.frequency.setValueAtTime(554.37, ctx.currentTime + 0.1) // C#5
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
  } catch(e) {}
}

const playErrorSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'triangle'
    // Tok ve kısa bir hata sesi
    osc.frequency.setValueAtTime(200, ctx.currentTime) 
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.15) 
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.2)
  } catch(e) {}
}
</script>

<style scoped>
.perspective-1000 { perspective: 1000px; }
.transform-style-3d { transform-style: preserve-3d; }
.backface-hidden { backface-visibility: hidden; }
.rotate-y-180 { transform: rotateY(180deg); }

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px) rotate(-1deg); }
  75% { transform: translateX(4px) rotate(1deg); }
}
.shake { animation: shake 0.3s ease-in-out; }
</style>