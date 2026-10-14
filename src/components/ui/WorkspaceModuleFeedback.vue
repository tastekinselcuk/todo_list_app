<template>
  <div class="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-border/40 bg-background/20 p-5 text-center" role="status" :aria-busy="!error">
    <template v-if="error">
      <p class="text-sm text-muted-foreground">{{ t('workspace.moduleLoadFailed') }}</p>
      <button type="button" class="inline-flex items-center gap-1.5 rounded-xl border border-border/50 px-3 py-2 text-xs text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" @click="onRetry?.()"><RotateCcw class="h-3.5 w-3.5" />{{ t('workspace.retryModule') }}</button>
    </template>
    <template v-else><Loader2 class="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" /><p class="text-xs text-muted-foreground">{{ t('workspace.loadingModule') }}</p></template>
  </div>
</template>
<script setup lang="ts">
import { Loader2, RotateCcw } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
defineProps<{ error?: boolean; onRetry?: () => void }>()
const { t } = useI18n()
</script>
