<template>
  <div class="w-full max-w-4xl mx-auto pt-4 space-y-6 animate-in slide-in-from-bottom-4 duration-500">
    <div class="flex items-center justify-between bg-card/40 backdrop-blur-xl p-4 rounded-2xl border border-border/50 shadow-sm">
      <div class="flex items-center gap-3">
        <button @click="$emit('back')" class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"><ArrowLeft class="w-4 h-4" /></button>
        <div class="flex flex-col">
          <h2 class="text-sm font-bold tracking-tight text-foreground ml-1">{{ deck.title }} (Oyun)</h2>
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

    <div v-if="matchedPairs.length === deck.cards.length" class="mt-8 flex justify-center animate-in zoom-in duration-500">
      <button @click="$emit('finish', { score: gameScore, errors: gameErrors })" class="h-10 px-6 rounded-xl bg-emerald-500 text-white font-bold text-xs shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 flex items-center gap-2">
        <Award class="w-4 h-4" /> SONUÇLARI GÖR
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ArrowLeft, Award } from 'lucide-vue-next'
import type { Deck } from '@/features/flashcards/stores/flashcards'

const props = defineProps<{ deck: Deck }>()
const emit = defineEmits(['back', 'finish'])

interface MemoryCard { uniqueId: string; cardId: string; text: string; type: 'front' | 'back'; isMatched: boolean; isError?: boolean }

const gameCards = ref<MemoryCard[]>([]) 
const flippedMemoryCards = ref<string[]>([]) 
const matchedPairs = ref<string[]>([]) 
const gameErrors = ref(0)
const gameScore = ref(0)
const isChecking = ref(false)

onMounted(() => {
  const cardsArr: MemoryCard[] = []
  props.deck.cards.forEach(c => {
    cardsArr.push({ uniqueId: c.id + '-front', cardId: c.id, text: c.front, type: 'front', isMatched: false })
    cardsArr.push({ uniqueId: c.id + '-back', cardId: c.id, text: c.back, type: 'back', isMatched: false })
  })
  gameCards.value = cardsArr.sort(() => Math.random() - 0.5)
})

const flipMemoryCard = (card: MemoryCard) => {
  if (isChecking.value || card.isMatched || flippedMemoryCards.value.includes(card.uniqueId)) return
  flippedMemoryCards.value.push(card.uniqueId)
  playWarmTick()

  if (flippedMemoryCards.value.length === 2) {
    isChecking.value = true
    checkMatch()
  }
}

const checkMatch = () => {
  const card1 = gameCards.value.find(c => c.uniqueId === flippedMemoryCards.value[0])!
  const card2 = gameCards.value.find(c => c.uniqueId === flippedMemoryCards.value[1])!

  if (card1.cardId === card2.cardId && card1.type !== card2.type) {
    setTimeout(() => {
      playSuccessSound()
      card1.isMatched = true; card2.isMatched = true
      matchedPairs.value.push(card1.cardId)
      gameScore.value += 10
      flippedMemoryCards.value = []; isChecking.value = false
    }, 400)
  } else {
    gameErrors.value += 1; gameScore.value -= 1 
    card1.isError = true; card2.isError = true
    playErrorSound()
    setTimeout(() => {
      card1.isError = false; card2.isError = false
      flippedMemoryCards.value = []; isChecking.value = false
    }, 1000)
  }
}

// Ses Efektleri
const playWarmTick = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'sine'; osc.frequency.setValueAtTime(600, ctx.currentTime) 
    gain.gain.setValueAtTime(0, ctx.currentTime); gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.02); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.1)
  } catch(e) {}
}

const playSuccessSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'sine'; osc.frequency.setValueAtTime(440, ctx.currentTime); osc.frequency.setValueAtTime(554.37, ctx.currentTime + 0.1) 
    gain.gain.setValueAtTime(0, ctx.currentTime); gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4)
  } catch(e) {}
}

const playErrorSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'triangle'; osc.frequency.setValueAtTime(200, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.15) 
    gain.gain.setValueAtTime(0, ctx.currentTime); gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2)
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