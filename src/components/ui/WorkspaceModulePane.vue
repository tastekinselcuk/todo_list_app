<template>
  <div :id="`workspace-panel-${tabId}`" role="region" :aria-label="moduleLabel" :aria-busy="loading > 0" :data-module-loading="loading > 0 || undefined" tabindex="0" class="relative min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:rounded-xl">
    <div v-if="binding?.shared" class="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Users class="h-3 w-3 text-primary" /><span>{{ t('sharing.sharedStatus', { count: binding.members }) }}</span><span v-if="binding.role === 'viewer'" class="ml-1 rounded-md bg-muted/60 px-1.5 py-0.5">{{ t('sharing.readOnlyStatus') }}</span></div>
    <component :is="moduleComponent" />
  </div>
</template>
<script setup lang="ts">
import type { Component } from 'vue'
import { computed, provide, ref } from 'vue'
import { moduleLoadKey } from '@/lib/workspaceScope'
import { Users } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useWorkspacesStore } from '@/stores/workspaces'
const props = defineProps<{ tabId: string; moduleComponent: Component }>()
const loading = ref(0)
provide(moduleLoadKey, delta => { loading.value = Math.max(0, loading.value + delta) })
const workspaces = useWorkspacesStore()
const { t } = useI18n()
const moduleLabel = computed(() => t(props.tabId === 'pomodoro' ? 'pomoNotes.tab' : props.tabId === 'tasks' ? 'tasks.calendar' : `workspace.modules.${props.tabId}Name`))
const binding = computed(() => workspaces.binding(props.tabId))
</script>
