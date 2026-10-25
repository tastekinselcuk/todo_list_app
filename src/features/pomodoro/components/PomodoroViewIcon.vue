<template>
  <svg class="pomodoro-view-icon" :data-direction="inward ? 'inward' : 'outward'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path v-if="inward" d="M4 4l5 5m-4 0h4V5m11-1l-5 5m0-4v4h4M4 20l5-5m-4 0h4v4m11 1l-5-5m0 4v-4h4" />
    <path v-else d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
  </svg>
</template>
<script setup lang="ts">
defineProps<{inward?:boolean}>()
</script>
