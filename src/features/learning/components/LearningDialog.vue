<template>
 <dialog ref="dialog" class="study-dialog" :class="{'is-wide':wide}" :aria-labelledby="titleId" @cancel.prevent="dismiss" @dblclick="backdrop">
  <header><div class="study-dialog-heading"><h3 :id="titleId" :class="{'sr-only':Boolean($slots.title)}">{{ title }}</h3><slot name="title" /></div><button type="button" :disabled="busy" :aria-label="t('study.close')" @click="dismiss"><X :size="18" /></button></header>
  <div class="study-dialog-body"><slot /></div>
  <footer v-if="$slots.footer"><slot name="footer" /></footer>
 </dialog>
</template>
<script setup lang="ts">
import { onMounted,onBeforeUnmount,ref } from 'vue'
import { X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { isDialogBackdropDoubleClick } from '@/lib/utils'
const props=defineProps<{title:string;busy?:boolean;wide?:boolean}>(),emit=defineEmits<{close:[]}>(),{t}=useI18n()
const dialog=ref<HTMLDialogElement>(),titleId=`study-${crypto.randomUUID()}`
let overflow='',rootOverflow='',previous:HTMLElement|null=null
function dismiss(){if(!props.busy)emit('close')}
function backdrop(event:MouseEvent){if(isDialogBackdropDoubleClick(event))dismiss()}
onMounted(()=>{previous=document.activeElement as HTMLElement;overflow=document.body.style.overflow;rootOverflow=document.documentElement.style.overflow;document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';dialog.value?.showModal()})
onBeforeUnmount(()=>{dialog.value?.close();document.body.style.overflow=overflow;document.documentElement.style.overflow=rootOverflow;previous?.focus({preventScroll:true})})
</script>
<style>
.study-dialog-heading{flex:1;min-width:0}.study-dialog-heading .study-detail-title{width:100%;max-width:100%;font-size:15px;font-weight:550}.study-dialog-heading .study-title{padding:0}.study-dialog-heading .study-title-editor{gap:4px}.study-dialog-heading .title-pencil{opacity:.65}
.study-drag-handle{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:20px;height:30px;border-radius:6px;color:hsl(var(--muted-foreground)/.5);cursor:grab;touch-action:none}.study-drag-handle:hover{color:hsl(var(--foreground));background:hsl(var(--muted)/.6)}.study-drag-handle:disabled{opacity:.25;cursor:default}.study-drag-handle:focus-visible{outline:2px solid hsl(var(--primary)/.4);outline-offset:2px}.study-order-ghost{opacity:.3}.study-order-dragging{opacity:.96;box-shadow:0 8px 24px #0002;border-radius:12px;background:hsl(var(--card))}
.study-dialog{position:fixed;inset:0;margin:auto;width:min(560px,calc(100vw - 28px));max-height:calc(100dvh - 40px);padding:0;border:1px solid hsl(var(--border));border-radius:22px;background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 24px 80px #0002;overflow:hidden}
.study-dialog[open]{display:flex;flex-direction:column;animation:study-dialog-in 180ms ease-out}.study-dialog.is-wide{width:min(740px,calc(100vw - 28px))}.study-dialog::backdrop{background:#0b12205c;backdrop-filter:blur(5px)}
.study-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 22px;border-bottom:1px solid hsl(var(--border)/.6)}.study-dialog h3{font-size:15px;font-weight:550;line-height:1.5;overflow-wrap:anywhere}.study-dialog header button{padding:6px;border-radius:8px;color:hsl(var(--muted-foreground));flex-shrink:0}.study-dialog header button:hover{background:hsl(var(--muted))}
.study-dialog-body{padding:20px 22px;overflow-y:auto;overscroll-behavior:contain;min-height:0}.study-dialog footer{padding:14px 22px;border-top:1px solid hsl(var(--border)/.6);display:flex;gap:8px;justify-content:flex-end;flex-shrink:0}
.study-field{display:block;font-size:12px;color:hsl(var(--muted-foreground));margin-bottom:14px}.study-field>span{display:block;margin-bottom:6px}.study-input{width:100%;min-height:40px;padding:9px 12px;border:1px solid hsl(var(--border));border-radius:11px;background:hsl(var(--background)/.5);color:hsl(var(--foreground));font-size:13px;outline:none}.study-input:focus{border-color:hsl(var(--primary)/.45);box-shadow:0 0 0 2px hsl(var(--primary)/.08)}textarea.study-input{resize:vertical;min-height:90px;line-height:1.6}.study-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 12px;min-height:36px;border:1px solid hsl(var(--border));border-radius:10px;font-size:12px;font-weight:500;color:hsl(var(--foreground));transition:background 150ms}.study-btn:hover{background:hsl(var(--muted)/.7)}.study-btn.is-primary{background:hsl(var(--primary));border-color:transparent;color:hsl(var(--primary-foreground))}.study-btn:disabled{opacity:.45;cursor:default}.study-hint{font-size:11px;line-height:1.6;color:hsl(var(--muted-foreground))}.study-empty{padding:28px 12px;text-align:center;font-size:13px;color:hsl(var(--muted-foreground))}
@keyframes study-dialog-in{from{opacity:0;transform:translateY(6px) scale(.99)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.study-dialog[open]{animation:none}}
</style>
