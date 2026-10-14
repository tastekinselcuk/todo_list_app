<template>
  <button v-if="report" type="button" class="workspace-card flex w-full flex-wrap items-center justify-between gap-2 bg-card/40 px-4 py-3 text-left" :title="t('analytics.coverage',{date:new Date(report.recording_started_at).toLocaleString(locale)})" @click="emit('open')">
    <span class="flex flex-wrap items-center gap-x-3 gap-y-1"><span class="text-xs font-medium">{{ t('analytics.weekly') }}</span><span class="text-xs text-muted-foreground">{{ t('analytics.weeklySummary',{focus:duration,count:summary.completed}) }}</span></span><span class="flex items-center gap-1 text-xs text-muted-foreground">{{ t('analytics.viewReport') }}<ArrowUpRight class="h-3.5 w-3.5" /></span>
  </button>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowUpRight } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useWorkspacesStore } from '@/stores/workspaces'
import { useAnalyticsReport } from '../composables/useAnalyticsReport'
import { totals, type DatePreset } from '../lib/reports'
const emit=defineEmits<{open:[]}>(),{t,locale}=useI18n(),workspaces=useWorkspacesStore()
const {report}=useAnalyticsReport({workspace:ref(workspaces.activeId),preset:ref<DatePreset>('week'),from:ref(''),to:ref(''),personal:ref(true),timezone:ref(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),summary:true,compare:false})
const summary=computed(()=>report.value ? totals(report.value) : {seconds:0,completed:0})
const duration=computed(()=>`${Math.floor(summary.value.seconds/3600)} ${t('analytics.hourShort')} ${Math.floor(summary.value.seconds%3600/60)} ${t('analytics.minShort')}`)
</script>
