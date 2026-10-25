<template>
 <dialog ref="dialog" class="activity-dialog" data-shared-editing="true" :aria-labelledby="titleId" @cancel.prevent="close" @dblclick="backdrop">
  <header><h3 :id="titleId">{{ t(mode==='memberships'?'activityLibrary.organize':collection?'activityLibrary.editCollection':'activityLibrary.newCollection') }}</h3><button type="button" class="activity-icon" :aria-label="t('common.close')" :disabled="busy" @click="close"><X :size="18" /></button></header>
  <div class="activity-dialog-body">
   <template v-if="mode==='collection'">
    <label class="activity-field"><span>{{ t('activityLibrary.collectionName') }}</span><input v-model="name" class="activity-input" maxlength="80" autofocus :readonly="!!collection?.archived_at" :disabled="busy" @keydown.enter.prevent="submit" /></label>
    <ColorPalette v-if="!collection?.archived_at" v-model="color" :options="collectionColors" :label="t('activityLibrary.color')" allow-custom horizontal />
    <p v-if="collection" class="activity-hint mt-4">{{ t('activityLibrary.archiveHint') }}</p>
   </template>
   <template v-else>
    <p class="text-[13px] mb-1 font-medium">{{ item?.title }}</p><p class="activity-hint mb-4">{{ t('activityLibrary.organizeHint') }}</p>
    <label v-for="group in collections" :key="group.id" class="activity-membership" :class="{'is-archived':group.archived_at}"><input type="checkbox" :checked="chosen.has(group.id)" :disabled="busy||!!group.archived_at" @change="toggle(group.id)" /><span class="activity-color-dot" :style="{backgroundColor:group.color}" /><span>{{ group.name }}</span><span v-if="group.archived_at" class="activity-hint">{{ t('activityLibrary.archived') }}</span></label>
    <p v-if="!collections.length" class="activity-hint py-3">{{ t('activityLibrary.noCollectionsHint') }}</p>
   </template>
   <p v-if="error" role="alert" class="text-xs text-destructive mt-4">{{ t('activityLibrary.errors.'+error) }}</p>
  </div>
  <footer><button v-if="mode==='collection'&&collection" type="button" class="activity-button mr-auto" :disabled="busy" @click="$emit('archive')"><RotateCcw v-if="collection.archived_at" :size="14" /><Archive v-else :size="14" />{{ t(collection.archived_at?'activityLibrary.restore':'activityLibrary.archive') }}</button><button type="button" class="activity-button" :disabled="busy" @click="close">{{ t('common.cancel') }}</button><button v-if="!collection?.archived_at||mode==='memberships'" type="button" class="activity-button is-primary" :disabled="busy||(mode==='collection'&&!name.trim())" @click="submit">{{ t('common.save') }}</button></footer>
 </dialog>
</template>
<script setup lang="ts">
import { ref,onMounted,onBeforeUnmount } from 'vue'
import { X,Archive,RotateCcw } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import ColorPalette from '@/components/ui/ColorPalette.vue'
import { isDialogBackdropDoubleClick } from '@/lib/utils'
import { collectionColors,type ActivityCollection } from '../lib/collections'
import type { ActivityItem } from '../stores/activityLists'
const props=defineProps<{mode:'collection'|'memberships';collection?:ActivityCollection|null;item?:ActivityItem|null;collections:ActivityCollection[];groupIds?:string[];busy:boolean;error:string|null}>()
const emit=defineEmits<{close:[];save:[payload:{name:string;color:string;group_ids:string[]}];archive:[]}>(),{t}=useI18n()
const name=ref(props.collection?.name||''),color=ref<string|null>(props.collection?.color||'#64748B'),chosen=ref(new Set(props.groupIds||[])),dialog=ref<HTMLDialogElement>(),titleId=`activity-${crypto.randomUUID()}`
let previous:HTMLElement|null=null,bodyOverflow='',rootOverflow=''
function toggle(id:string){const next=new Set(chosen.value);if(next.has(id))next.delete(id);else next.add(id);chosen.value=next}
function close(){if(!props.busy)emit('close')}
function backdrop(event:MouseEvent){if(isDialogBackdropDoubleClick(event))close()}
function submit(){if(props.busy||(props.mode==='collection'&&(!name.value.trim()||props.collection?.archived_at)))return;emit('save',{name:name.value.trim(),color:color.value||'#64748B',group_ids:[...chosen.value]})}
onMounted(()=>{previous=document.activeElement as HTMLElement;bodyOverflow=document.body.style.overflow;rootOverflow=document.documentElement.style.overflow;document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';dialog.value?.showModal()})
onBeforeUnmount(()=>{dialog.value?.close();document.body.style.overflow=bodyOverflow;document.documentElement.style.overflow=rootOverflow;previous?.focus({preventScroll:true})})
</script>
<style>
.activity-input{width:100%;min-width:0;height:40px;border:1px solid hsl(var(--border)/.8);border-radius:11px;background:hsl(var(--card));padding:0 12px;color:hsl(var(--foreground));font-size:13px;outline:none;box-shadow:0 1px 2px hsl(var(--foreground)/.025);transition:border-color 150ms,box-shadow 150ms}.activity-input:focus{border-color:hsl(var(--primary)/.45);box-shadow:0 0 0 2px hsl(var(--primary)/.08)}.activity-input::placeholder{color:hsl(var(--muted-foreground)/.75)}
.activity-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;padding:8px 12px;border:1px solid hsl(var(--border)/.7);border-radius:10px;color:hsl(var(--foreground));font-size:12px;font-weight:500;white-space:nowrap;transition:background 150ms,border-color 150ms}.activity-button:hover{background:hsl(var(--muted)/.6)}.activity-button.is-primary{background:hsl(var(--primary));border-color:transparent;color:hsl(var(--primary-foreground))}.activity-button.is-primary:hover{background:hsl(var(--primary)/.9)}.activity-button:disabled,.activity-icon:disabled{opacity:.45;cursor:default}.activity-icon{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:30px;height:30px;border-radius:8px;color:hsl(var(--muted-foreground));transition:background 150ms,color 150ms}.activity-icon:hover{background:hsl(var(--muted)/.6);color:hsl(var(--foreground))}.activity-button:focus-visible,.activity-icon:focus-visible{outline:2px solid hsl(var(--primary)/.4);outline-offset:2px}
.activity-hint{font-size:11px;line-height:1.65;color:hsl(var(--muted-foreground))}.activity-color-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.activity-dialog{position:fixed;inset:0;margin:auto;padding:0;width:min(480px,calc(100vw - 28px));max-height:calc(100dvh - 40px);border:1px solid hsl(var(--border));border-radius:20px;background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 24px 80px #0002;overflow:hidden}.activity-dialog[open]{display:flex;flex-direction:column;animation:activity-dialog-in 180ms ease-out}.activity-dialog::backdrop{background:#0b12205c;backdrop-filter:blur(5px)}.activity-dialog header{padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid hsl(var(--border)/.6)}.activity-dialog h3{font-size:14px;font-weight:550}.activity-dialog-body{padding:20px;overflow:auto;overscroll-behavior:contain}.activity-dialog footer{display:flex;gap:8px;padding:14px 20px;border-top:1px solid hsl(var(--border)/.6);flex-shrink:0;justify-content:flex-end;flex-wrap:wrap}.activity-field{display:block;font-size:12px;color:hsl(var(--muted-foreground));margin-bottom:14px}.activity-field>span{display:block;margin-bottom:7px}.activity-membership{display:flex;align-items:center;gap:10px;min-height:42px;padding:9px 7px;border-radius:9px;font-size:13px;cursor:pointer}.activity-membership:hover{background:hsl(var(--muted)/.45)}.activity-membership>span:nth-last-child(2){flex:1}.activity-membership.is-archived{opacity:.6;cursor:default}.activity-membership input{accent-color:hsl(var(--primary));width:15px;height:15px;flex-shrink:0}
@keyframes activity-dialog-in{from{opacity:0;transform:translateY(6px) scale(.99)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.activity-dialog[open]{animation:none}.activity-button,.activity-icon,.activity-input{transition:none}}
</style>
