<template>
  <form
    data-ai-provider-settings
    class="space-y-4 rounded-2xl border border-border/60 bg-card/70 p-4 text-xs"
    @submit.prevent="submitSettings"
  >
    <div class="flex items-center justify-between gap-2">
      <h3 class="truncate text-sm font-semibold text-foreground">AI Ayarları</h3>
      <span
        class="inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-medium"
        :class="currentKeyHint ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'"
      >
        {{ currentKeyHint ? `Aktif · ${currentKeyHint}` : 'Yerel Mod' }}
      </span>
    </div>

    <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      <div class="space-y-1">
        <label class="block text-[11px] font-medium text-muted-foreground" for="ai-provider-select">Sağlayıcı</label>
        <select
          id="ai-provider-select"
          v-model="provider"
          class="w-full rounded-xl border border-border/60 bg-background px-2.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          @change="handleProviderChange"
        >
          <option value="gemini">Google Gemini</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic Claude</option>
        </select>
      </div>

      <div class="space-y-1">
        <label class="block text-[11px] font-medium text-muted-foreground" for="ai-model-select">Model</label>
        <select
          id="ai-model-select"
          v-model="model"
          class="w-full rounded-xl border border-border/60 bg-background px-2.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option v-for="item in availableModels" :key="item.id" :value="item.id">
            {{ item.label }}
          </option>
        </select>
      </div>
    </div>

    <div class="space-y-1.5">
      <label class="block text-[11px] font-medium text-muted-foreground">Yazma Modu</label>
      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          data-write-mode="ask_before_write"
          class="flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-all"
          :class="
            writeMode === 'ask_before_write'
              ? 'border-primary bg-primary/[0.07] text-foreground shadow-xs'
              : 'border-border/60 bg-background/60 text-muted-foreground hover:text-foreground'
          "
          @click="writeMode = 'ask_before_write'"
        >
          <span class="font-semibold text-foreground">Onaylı Yazma</span>
          <span class="mt-0.5 text-[10px] leading-snug text-muted-foreground">
            Önizleme sonrası uygular
          </span>
        </button>

        <button
          type="button"
          data-write-mode="auto_apply"
          class="flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-all"
          :class="
            writeMode === 'auto_apply'
              ? 'border-primary bg-primary/[0.07] text-foreground shadow-xs'
              : 'border-border/60 bg-background/60 text-muted-foreground hover:text-foreground'
          "
          @click="writeMode = 'auto_apply'"
        >
          <span class="font-semibold text-foreground">Otomatik</span>
          <span class="mt-0.5 text-[10px] leading-snug text-muted-foreground">
            Düşük riskli işlemleri uygular
          </span>
        </button>
      </div>
    </div>

    <div class="space-y-1.5">
      <label class="block text-[11px] font-medium text-muted-foreground" for="ai-api-key-input">
        API Anahtarı ({{ provider.toUpperCase() }})
      </label>
      <div class="flex items-center gap-2">
        <input
          id="ai-api-key-input"
          v-model="apiKeyInput"
          type="password"
          autocomplete="off"
          :placeholder="currentKeyHint ? `Yeni anahtar (${currentKeyHint})` : 'API anahtarı girin...'"
          class="min-w-0 flex-1 rounded-xl border border-border/60 bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          v-if="currentKeyHint"
          type="button"
          data-clear-ai-key
          :disabled="busy"
          class="shrink-0 rounded-xl border border-destructive/35 px-2.5 py-2 text-[11px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          @click="clearStoredKey"
        >
          Sil
        </button>
      </div>
      <p class="text-[10px] text-muted-foreground/85">
        Anahtar sunucuda izole saklanır, tarayıcıya dönmez.
      </p>
    </div>

    <div class="flex items-center justify-end pt-1">
      <button
        type="submit"
        data-save-ai-settings
        :disabled="busy"
        class="inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
      >
        Kaydet
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  PROVIDER_MODELS,
  type AiProviderId,
  type AiWriteMode,
  type AiSettingsState,
} from '@/features/ai/lib/aiClient'

const props = withDefaults(
  defineProps<{
    settings: AiSettingsState
    busy?: boolean
  }>(),
  {
    busy: false,
  },
)

type AiSettingsSavePayload = {
  provider: AiProviderId
  model: string
  write_mode: AiWriteMode
  api_key?: string | null
  clear_key?: boolean
}

const emit = defineEmits<{
  save: [payload: AiSettingsSavePayload]
}>()

const provider = ref<AiProviderId>(props.settings.provider || 'gemini')
const model = ref<string>(props.settings.model || PROVIDER_MODELS.gemini[0].id)
const writeMode = ref<AiWriteMode>(props.settings.write_mode || 'ask_before_write')
const apiKeyInput = ref('')

watch(
  () => props.settings,
  next => {
    if (!next) return
    provider.value = next.provider || 'gemini'
    model.value = next.model || PROVIDER_MODELS[provider.value][0].id
    writeMode.value = next.write_mode || 'ask_before_write'
  },
  { deep: true },
)

const availableModels = computed(() => PROVIDER_MODELS[provider.value] || PROVIDER_MODELS.gemini)
const currentKeyHint = computed(() => props.settings.key_hints?.[provider.value] || null)

function handleProviderChange() {
  const models = PROVIDER_MODELS[provider.value] || []
  if (!models.some(item => item.id === model.value) && models[0]) {
    model.value = models[0].id
  }
}

function submitSettings() {
  emit('save', {
    provider: provider.value,
    model: model.value,
    write_mode: writeMode.value,
    api_key: apiKeyInput.value.trim() ? apiKeyInput.value.trim() : null,
    clear_key: false,
  })
  apiKeyInput.value = ''
}

function clearStoredKey() {
  emit('save', {
    provider: provider.value,
    model: model.value,
    write_mode: writeMode.value,
    api_key: null,
    clear_key: true,
  })
  apiKeyInput.value = ''
}
</script>
