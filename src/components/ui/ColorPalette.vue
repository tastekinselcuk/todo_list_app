<template>
  <div class="color-palette" :class="{'palette-horizontal':horizontal}">
    <p v-if="label && !horizontal" class="palette-label">{{ label }}</p>
    <div class="palette-grid" role="group" :aria-label="label">
      <button v-if="clearLabel" type="button" class="palette-choice" :aria-label="clearLabel" :title="clearLabel" :aria-pressed="!modelValue" @mousedown.prevent @click="$emit('update:modelValue',null)"><span class="palette-sample palette-default"><span v-if="variant==='text'">A</span><Ban v-else :size="14" /></span></button>
      <button v-for="option in options" :key="option.value" type="button" class="palette-choice" :aria-label="option.label" :title="option.label" :aria-pressed="selected(option.value)" @mousedown.prevent @click="$emit('update:modelValue',option.value)">
        <span class="palette-sample" :class="variant==='text'?'palette-text':'palette-fill'" :style="variant==='text'?{color:option.color}:{backgroundColor:option.color}"><span v-if="variant==='text'">A</span></span>
        <span v-if="selected(option.value)" aria-hidden="true" class="palette-check"><Check :size="9" :stroke-width="2.5" /></span>
      </button>
    </div>
    <div v-if="allowCustom" class="palette-custom">
      <label class="palette-hex"><span aria-hidden="true" class="palette-hex-preview" :style="{backgroundColor:validHex||modelValue||'transparent'}" /><input v-model="customHex" spellcheck="false" autocomplete="off" maxlength="7" :aria-label="t('noteEditor.customColor')" placeholder="#AABBCC" @keydown.enter.stop.prevent="applyCustom" /></label>
      <button type="button" class="palette-apply" :disabled="!validHex" :aria-label="t('noteEditor.applyColor')" :title="t('noteEditor.applyColor')" @mousedown.prevent @click="applyCustom"><Check :size="14" /></button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Ban, Check } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
export interface ColorOption { value:string; label:string; color:string }
const props=withDefaults(defineProps<{modelValue:string|null;options:ColorOption[];label?:string;clearLabel?:string;variant?:'text'|'fill';allowCustom?:boolean;horizontal?:boolean}>(),{variant:'fill'})
const emit=defineEmits<{'update:modelValue':[value:string|null]}>()
const {t}=useI18n(),customHex=ref('')
watch(()=>props.modelValue,value=>{customHex.value=value&&/^#[\da-f]{6}$/i.test(value)?value.toUpperCase():''},{immediate:true})
const validHex=computed(()=>/^#?[\da-f]{6}$/i.test(customHex.value.trim())?'#'+customHex.value.trim().replace(/^#/,'').toUpperCase():null)
const selected=(value:string)=>Boolean(props.modelValue&&props.modelValue.toLowerCase()===value.toLowerCase())
function applyCustom(){if(validHex.value)emit('update:modelValue',validHex.value)}
</script>
<style scoped>
.palette-label{margin:0 0 8px;font-size:10px;font-weight:500;color:hsl(var(--muted-foreground))}
.palette-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}
.palette-choice{position:relative;display:flex;align-items:center;justify-content:center;min-height:34px;border:1px solid transparent;border-radius:9px;transition:background-color 150ms,border-color 150ms}
.palette-choice:hover{background:hsl(var(--muted)/.6)}
.palette-choice[aria-pressed=true]{background:hsl(var(--primary)/.06);border-color:hsl(var(--primary)/.3)}
.palette-choice:focus-visible,.palette-apply:focus-visible{outline:2px solid hsl(var(--primary)/.4);outline-offset:1px}
.palette-sample{display:flex;align-items:center;justify-content:center;width:23px;height:23px;border-radius:6px;font-size:16px;font-weight:550}
.palette-fill{box-shadow:inset 0 0 0 1px hsl(var(--foreground)/.09)}
.palette-text{background:hsl(var(--muted)/.35)}
.palette-default{border:1px solid hsl(var(--border)/.7);color:hsl(var(--foreground))}
.palette-check{position:absolute;right:3px;bottom:3px;display:flex;align-items:center;justify-content:center;width:12px;height:12px;border-radius:50%;background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 0 0 1px hsl(var(--border)/.7)}
.palette-custom{display:flex;gap:6px;margin-top:11px;padding-top:11px;border-top:1px solid hsl(var(--border)/.5)}
.palette-hex{display:flex;align-items:center;gap:8px;min-width:0;flex:1;padding:0 9px;border:1px solid hsl(var(--border)/.6);border-radius:9px;background:hsl(var(--background)/.5)}
.palette-hex:focus-within{border-color:hsl(var(--primary)/.4)}
.palette-hex-preview{width:13px;height:13px;flex-shrink:0;border-radius:4px;box-shadow:inset 0 0 0 1px hsl(var(--foreground)/.12)}
.palette-hex input{width:100%;min-width:0;height:32px;outline:none;background:transparent;font-size:11px;font-variant-numeric:tabular-nums;color:hsl(var(--foreground))}
.palette-apply{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;background:hsl(var(--muted)/.5);color:hsl(var(--foreground));transition:background-color 150ms}
.palette-apply:hover{background:hsl(var(--muted))}.palette-apply:disabled{opacity:.35}
.palette-horizontal{display:flex;align-items:center;gap:8px;min-width:0;container-type:inline-size}
.palette-horizontal .palette-grid{flex:1;grid-template-columns:repeat(9,minmax(0,1fr));gap:2px;min-width:0}
.palette-horizontal .palette-choice{min-height:28px;border-radius:7px}
.palette-horizontal .palette-sample{width:18px;height:18px;border-radius:5px}
.palette-horizontal .palette-check{right:0;bottom:0;width:10px;height:10px}
.palette-horizontal .palette-custom{flex:0 0 116px;gap:3px;margin:0;padding:0 0 0 7px;border-top:0;border-left:1px solid hsl(var(--border)/.5)}
.palette-horizontal .palette-hex{gap:0;padding:0 6px;border:0;background:transparent}
.palette-horizontal .palette-hex-preview{display:none}
.palette-horizontal .palette-hex input{height:28px;font-size:10px}
.palette-horizontal .palette-apply{width:25px;height:28px;flex-shrink:0;border-radius:7px}
@container(max-width:350px){.palette-horizontal .palette-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}
@media(prefers-reduced-motion:reduce){.palette-choice,.palette-apply{transition:none}}
</style>
