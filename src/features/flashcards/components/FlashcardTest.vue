<template>
  <div class="w-full max-w-2xl mx-auto pt-4 space-y-6 animate-in slide-in-from-bottom-4 duration-500">
    <div class="flex items-center justify-between mb-8 bg-card/40 backdrop-blur-xl p-4 rounded-2xl border border-border/50 shadow-sm">
      <div class="flex items-center gap-3">
        <button @click="$emit('back')" class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"><ArrowLeft class="w-4 h-4" /></button>
        <h2 class="text-sm font-bold tracking-tight text-foreground">{{ $t('flashcards.testTitle', { title: deck.title }) }} (Test)</h2>
      </div>
      <span class="text-[10px] font-bold px-3 py-1.5 bg-muted/50 rounded-lg uppercase tracking-widest text-muted-foreground border border-border/50">
        {{ $t('flashcards.answeredCount', { answered: testResults.length, total: deck.cards.length }) }}
      </span>
    </div>

    <div class="space-y-3">
      <div v-for="card in deck.cards" :key="card.id" class="p-4 rounded-2xl border transition-all duration-300 relative overflow-hidden" :class="getCardStatusClass(card.id)">
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

    <div v-if="testResults.length === deck.cards.length" class="mt-8 flex justify-center animate-in zoom-in duration-500">
      <button @click="$emit('finish', testResults)" class="h-10 px-6 rounded-xl bg-emerald-500 text-white font-bold text-xs shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 flex items-center gap-2">
        <Award class="w-4 h-4" /> {{ $t('flashcards.seeFinalResults') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ArrowLeft, Check, X, Award } from 'lucide-vue-next'
import type { Deck } from '@/features/flashcards/stores/flashcards'

defineProps<{ deck: Deck }>()
const emit = defineEmits(['back', 'finish'])

const testInputs = ref<Record<string, string>>({})
const testResults = ref<{cardId: string, isCorrect: boolean}[]>([])

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

// Ses Efektleri
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