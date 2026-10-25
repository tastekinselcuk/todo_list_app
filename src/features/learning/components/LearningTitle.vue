<template>
 <form v-if="editing" class="study-title-editor" @submit.prevent="submit" @keydown.esc.stop.prevent="cancel">
  <input ref="input" v-model="draft" :maxlength="limit" :aria-label="label" :disabled="saving||disabled" class="study-input" />
  <button type="submit" class="title-action" :disabled="saving||disabled||!validStudyName(draft,limit)" :aria-label="t('study.save')"><Check :size="15" /></button>
  <button type="button" class="title-action" :disabled="saving" :aria-label="t('study.cancel')" @click="cancel"><X :size="15" /></button>
 </form>
 <button v-else-if="editable" ref="labelButton" type="button" class="study-title" :disabled="disabled" :title="title" :aria-label="t('study.rename',{name:title})" @click.stop="begin"><span>{{ title }}</span><Pencil :size="12" class="title-pencil" /></button>
 <span v-else class="study-title is-readonly" :title="title"><span>{{ title }}</span></span>
</template>
<script setup lang="ts">
import { nextTick,ref,watch } from 'vue'
import { Check,Pencil,X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { validStudyName } from '../lib/study'
const props=defineProps<{title:string;version?:number;limit:number;label:string;editable:boolean;disabled:boolean;save:(title:string,version?:number)=>Promise<boolean>}>(),{t}=useI18n()
const editing=ref(false),saving=ref(false),draft=ref(''),input=ref<HTMLInputElement>(),labelButton=ref<HTMLButtonElement>()
let original='',version:number|undefined
watch(()=>props.editable,value=>{if(!value)editing.value=false})
async function begin(){if(props.disabled||!props.editable)return;original=props.title;version=props.version;draft.value=original;editing.value=true;await nextTick();input.value?.focus();input.value?.select()}
async function cancel(){if(!saving.value){editing.value=false;await nextTick();labelButton.value?.focus()}}
async function submit(){
 if(saving.value||props.disabled||!validStudyName(draft.value,props.limit))return
 if(draft.value.trim()===original){editing.value=false;return}
 saving.value=true
 try{if(await props.save(draft.value.trim(),version))editing.value=false}finally{saving.value=false;await nextTick();(editing.value?input.value:labelButton.value)?.focus()}
}
</script>
<style scoped>
.study-title,.study-title-editor{display:flex;align-items:center;gap:6px;min-width:0;text-align:left;font-size:13px;line-height:1.6}.study-title{padding:7px 0;max-width:100%}.study-title>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.title-pencil{flex-shrink:0;opacity:0;color:hsl(var(--muted-foreground));transition:opacity 150ms}.study-title:hover .title-pencil,.study-title:focus-visible .title-pencil{opacity:1}.study-title-editor .study-input{min-width:0;min-height:34px;padding:5px 8px}.title-action{padding:5px;border-radius:6px;color:hsl(var(--muted-foreground));flex-shrink:0}.title-action:hover{background:hsl(var(--muted));color:hsl(var(--foreground))}button:disabled{opacity:.45}.study-title:focus-visible{outline:2px solid hsl(var(--primary)/.4);outline-offset:3px;border-radius:4px}@media(hover:none){.title-pencil{opacity:.6}}
</style>
