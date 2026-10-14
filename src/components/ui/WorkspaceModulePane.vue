<template>
  <div :id="`workspace-panel-${tabId}`" role="tabpanel" :aria-labelledby="`workspace-tab-${tabId}`" tabindex="0" class="relative min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:rounded-xl">
    <div v-if="binding?.shared" class="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Users class="h-3 w-3 text-primary" /><span>{{ t('sharing.sharedStatus', { count: binding.members }) }}</span><span v-if="binding.role === 'viewer'" class="ml-1 rounded-md bg-muted/60 px-1.5 py-0.5">{{ t('sharing.readOnlyStatus') }}</span></div>
    <component :is="moduleComponent" />
  </div>
</template>
<script setup lang="ts">
import type { Component } from 'vue'
import { computed } from 'vue'
import { Users } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useWorkspacesStore } from '@/stores/workspaces'
const props = defineProps<{ tabId: string; moduleComponent: Component }>()
const workspaces = useWorkspacesStore()
const { t } = useI18n()
const binding = computed(() => workspaces.binding(props.tabId))
</script>
