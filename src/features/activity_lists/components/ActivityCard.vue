<template>
 <article class="activity-entry workspace-card" :data-search-record="item.id">
  <div class="activity-entry-cover"><img v-if="image&&!imgError" :src="image" :alt="item.title" loading="lazy" referrerpolicy="no-referrer" @error="imgError=true" /><component v-else :is="typeIcon" :size="25" :stroke-width="1.3" /></div>
  <div class="activity-entry-body">
   <p class="activity-entry-type">{{ t('activities.types.'+item.type) }}</p>
   <h4 :title="item.title">{{ item.title }}</h4><p v-if="item.subtitle" class="activity-entry-subtitle" :title="item.subtitle">{{ item.subtitle }}</p>
   <div class="activity-entry-actions">
    <button type="button" role="checkbox" class="activity-status" :class="{'is-done':item.status==='done'}" :aria-checked="item.status==='done'" :aria-label="t('activityLibrary.toggleStatus',{title:item.title,status:statusLabel})" :disabled="!canWrite||busy" @click="$emit('toggle',item.id)"><span class="activity-check"><Check v-if="item.status==='done'" :size="11" :stroke-width="2.5" /></span><span>{{ statusLabel }}</span></button>
    <button v-if="canWrite" type="button" class="activity-icon ml-auto" :disabled="busy||!canOrganize" :title="t('activityLibrary.organize')" :aria-label="t('activityLibrary.organizeItem',{title:item.title})" @click="$emit('organize',item)"><FolderInput :size="15" :stroke-width="1.7" /></button>
    <button v-if="canWrite" type="button" class="activity-icon" :disabled="busy" :title="t('common.delete')" :aria-label="t('activityLibrary.deleteItem',{title:item.title})" @click="$emit('delete',item.id)"><Trash2 :size="15" :stroke-width="1.7" /></button>
   </div>
  </div>
 </article>
</template>
<script setup lang="ts">
import { computed,ref,watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check,Trash2,Film,Tv,MapPin,BookOpen,FolderInput } from 'lucide-vue-next'
import { useModuleAccess } from '@/lib/workspaceScope'
import { activityImage } from '../lib/collections'
import type { ActivityItem } from '../stores/activityLists'
const props=withDefaults(defineProps<{item:ActivityItem;busy?:boolean;canOrganize?:boolean;readOnly?:boolean}>(),{canOrganize:true})
defineEmits<{toggle:[id:string];delete:[id:string];organize:[item:ActivityItem]}>()
const {canWrite:moduleWrite}=useModuleAccess('activities'),canWrite=computed(()=>moduleWrite.value&&!props.readOnly),{t}=useI18n(),imgError=ref(false)
const typeIcon=computed(()=>({movie:Film,series:Tv,book:BookOpen,place:MapPin}[props.item.type]||BookOpen)),image=computed(()=>activityImage(props.item.image_url))
const statusLabel=computed(()=>t(`activityLibrary.states.${props.item.type}.${props.item.status}`))
watch(()=>props.item.image_url,()=>{imgError.value=false})
</script>
<style scoped>
.activity-entry{display:flex;align-items:stretch;min-width:0;min-height:136px;overflow:hidden;border-radius:15px;background:hsl(var(--card));padding:10px;gap:12px}.activity-entry-cover{display:flex;align-items:center;justify-content:center;width:76px;min-width:76px;align-self:stretch;min-height:108px;overflow:hidden;border-radius:9px;background:linear-gradient(145deg,hsl(var(--primary)/.08),hsl(var(--muted)/.6));color:hsl(var(--primary)/.6)}.activity-entry-cover img{width:100%;height:100%;max-height:130px;object-fit:cover}.activity-entry-body{display:flex;flex-direction:column;flex:1;min-width:0;padding:1px 0}.activity-entry-type{font-size:10px;line-height:15px;color:hsl(var(--muted-foreground))}.activity-entry h4{font-size:13px;font-weight:500;line-height:1.5;margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.activity-entry-subtitle{font-size:11px;color:hsl(var(--muted-foreground));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px}.activity-entry-actions{display:flex;align-items:center;gap:2px;margin-top:auto;padding-top:8px}.activity-status{display:flex;align-items:center;gap:7px;font-size:11px;color:hsl(var(--muted-foreground));text-align:left;min-height:30px;min-width:0}.activity-check{display:flex;align-items:center;justify-content:center;width:16px;height:16px;flex-shrink:0;border:1px solid hsl(var(--border));border-radius:5px;background:hsl(var(--background))}.activity-status:hover:not(:disabled){color:hsl(var(--primary))}.activity-status.is-done{color:hsl(var(--foreground))}.activity-status.is-done .activity-check{background:hsl(var(--primary));border-color:hsl(var(--primary));color:hsl(var(--primary-foreground))}.activity-status:focus-visible{outline:2px solid hsl(var(--primary)/.4);outline-offset:3px;border-radius:4px}.activity-status:disabled{cursor:default}.activity-entry .activity-icon{width:27px;height:28px}
</style>
