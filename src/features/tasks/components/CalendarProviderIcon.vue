<script setup lang="ts">
import type { CalendarProvider } from '../lib/connectedCalendars'
withDefaults(defineProps<{provider:CalendarProvider;size?:number}>(),{size:18})
</script>
<template>
 <svg v-if="provider==='google'" :width="size" :height="size" viewBox="0 0 48 48" fill="none" aria-hidden="true" class="shrink-0">
  <path fill="#fff" d="M12 12h24v24H12z"/><path fill="#EA4335" d="M36 12H12V3h24z"/><path fill="#4285F4" d="M12 36H3V12h9z"/><path fill="#FBBC04" d="M45 12H36v24h9z"/><path fill="#34A853" d="M12 36h24v9H12z"/><path fill="#188038" d="m36 45 9-9h-9z"/><path fill="#1967D2" d="M12 3H6a3 3 0 0 0-3 3v6h9z"/><path fill="#C5221F" d="M42 3h-6v9h9V6a3 3 0 0 0-3-3"/><path fill="#1967D2" d="M3 36v6a3 3 0 0 0 3 3h6v-9z"/>
  <text x="24" y="30" text-anchor="middle" fill="#4285F4" font-size="17" font-family="Arial,sans-serif" font-weight="600">31</text>
 </svg>
 <svg v-else :width="size" :height="size" viewBox="0 0 32 32" fill="none" aria-hidden="true" class="shrink-0">
  <rect x="11" y="3" width="18" height="22" rx="2" fill="#0364B8"/><path fill="#0078D4" d="M13 6h6v7h-6z"/><path fill="#28A8EA" d="M19 6h7v7h-7z"/><path fill="#50D9FF" d="M13 13h6v7h-6z"/><path fill="#1490DF" d="M19 13h7v7h-7z"/>
  <path fill="#0078D4" d="m10 15 10 7 11-7v12a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2z"/><path fill="#28A8EA" d="m10 27 10-7 11 7a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2"/>
  <rect x="1" y="8" width="16" height="19" rx="2" fill="#0F6CBD"/><ellipse cx="9" cy="17.5" rx="4" ry="5" stroke="#fff" stroke-width="2"/>
 </svg>
</template>
