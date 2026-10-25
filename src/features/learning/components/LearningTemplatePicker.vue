<template>
 <div class="study-template-picker">
  <div class="template-selectors" :class="{'has-variants':variants.length>1}">
   <label><span>{{ t('study.exam') }}</span><CustomSelect :model-value="current.family" :options="families" :disabled="busy" :aria-label="t('study.exam')" @update:model-value="chooseFamily(String($event) as ExamFamily)" /></label>
   <label v-if="variants.length>1"><span>{{ t('study.examVariant') }}</span><CustomSelect :model-value="current.key" :options="variants" :disabled="busy" :aria-label="t('study.examVariant')" @update:model-value="chooseTemplate(String($event))" /></label>
  </div>
  <div class="template-meta"><span class="template-basis">{{ t('study.templateBasis.'+current.basis) }}</span><span v-if="variants.length===1">{{ current.variant }}</span><span v-if="current.sourceYear">{{ t('study.sourceYear',{year:current.sourceYear}) }}</span><span>{{ t('study.checkedAt',{date:checkedDate}) }}</span></div>
  <p class="study-hint mt-2">{{ t('study.templateNotes.'+current.note) }}</p>
  <details class="template-sources"><summary>{{ t('study.officialSources') }} <span>{{ current.sources.length }}</span></summary><a v-for="source in current.sources" :key="source.url" :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.label }}<ExternalLink :size="11" /></a></details>
  <div class="template-selection"><button type="button" :disabled="busy" @click="selected=allExamTopicKeys(current)">{{ t('study.selectAll') }}</button><button type="button" :disabled="busy" @click="selected=new Set()">{{ t('study.clearSelection') }}</button><span>{{ t('study.selected',{count:selectionCount}) }}</span></div>
  <p class="study-hint mb-3">{{ t('study.templateHint') }}</p>
  <details v-for="subject in current.subjects" :key="current.key+':'+subject.key" class="template-subject">
   <summary><input type="checkbox" :checked="subject.topics.every(topic=>selected.has(topic.key))" :indeterminate="subject.topics.some(topic=>selected.has(topic.key))&&!subject.topics.every(topic=>selected.has(topic.key))" :disabled="busy" :aria-label="subject.title" @click.stop @keydown.space.stop @keydown.enter.stop @change="selectSubject(subject,($event.target as HTMLInputElement).checked)" /><span>{{ subject.title }}</span><span class="template-subject-count">{{ subject.topics.filter(topic=>selected.has(topic.key)).length }}/{{ subject.topics.length }}</span></summary>
   <div class="template-topics"><label v-for="topic in subject.topics" :key="topic.key"><input type="checkbox" :checked="selected.has(topic.key)" :disabled="busy" @change="selectTopic(topic.key)" /><span>{{ topic.title }}</span></label></div>
  </details>
 </div>
</template>
<script setup lang="ts">
import { computed,ref,watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ExternalLink } from 'lucide-vue-next'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { examFamilies,examTemplates,examTemplate,allExamTopicKeys,selectedExamTemplate,type ExamFamily,type ExamImport } from '../lib/examTemplates'
import type { StudyTemplateSubject } from '../lib/templates'
const props=defineProps<{busy:boolean}>(),emit=defineEmits<{'update:selection':[selection:ExamImport]}>(),{t,locale}=useI18n()
const templateId=ref(examTemplates[0]!.key),selections=ref<Record<string,Set<string>>>({})
const current=computed(()=>examTemplate(templateId.value)!)
const selected=computed({get:()=>selections.value[current.value.key]||allExamTopicKeys(current.value),set:value=>{selections.value={...selections.value,[current.value.key]:value}}})
const families=computed(()=>examFamilies.map(value=>({value,label:examTemplates.find(template=>template.family===value)!.label})))
const variants=computed(()=>examTemplates.filter(template=>template.family===current.value.family).map(template=>({value:template.key,label:template.variant})))
const checkedDate=computed(()=>new Intl.DateTimeFormat(locale.value,{day:'2-digit',month:'short',year:'numeric'}).format(new Date(current.value.checkedAt+'T12:00:00')))
const selection=computed(()=>selectedExamTemplate(current.value,selected.value))
const selectionCount=computed(()=>selection.value.subjects.reduce((count,subject)=>count+subject.topics.length,0))
watch(selection,value=>emit('update:selection',value),{immediate:true})
function chooseTemplate(id:string){if(!props.busy&&examTemplate(id))templateId.value=id}
function chooseFamily(family:ExamFamily){const match=examTemplates.find(template=>template.family===family);if(match)chooseTemplate(match.key)}
function selectSubject(subject:StudyTemplateSubject,checked:boolean){if(props.busy)return;const next=new Set(selected.value);subject.topics.forEach(topic=>checked?next.add(topic.key):next.delete(topic.key));selected.value=next}
function selectTopic(key:string){if(props.busy)return;const next=new Set(selected.value);if(next.has(key))next.delete(key);else next.add(key);selected.value=next}
</script>
<style scoped>
.template-selectors{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}.template-selectors.has-variants{grid-template-columns:minmax(0,.7fr) minmax(0,1.3fr)}.template-selectors label{min-width:0}.template-selectors label>span{display:block;margin-bottom:6px;font-size:11px;color:hsl(var(--muted-foreground))}.template-meta{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;margin-top:14px;font-size:11px;color:hsl(var(--muted-foreground))}.template-basis{padding:4px 7px;border-radius:6px;background:hsl(var(--muted)/.6);color:hsl(var(--foreground))}.template-sources{margin-top:10px;font-size:11px;color:hsl(var(--muted-foreground))}.template-sources summary{cursor:pointer;width:fit-content}.template-sources summary span{margin-left:4px;font-variant-numeric:tabular-nums}.template-sources a{display:flex;align-items:center;gap:6px;width:fit-content;max-width:100%;margin-top:8px;line-height:1.6}.template-sources a:hover{color:hsl(var(--primary));text-decoration:underline}.template-selection{display:flex;align-items:center;gap:14px;margin-top:18px;margin-bottom:8px;font-size:12px;color:hsl(var(--primary))}.template-selection span{margin-left:auto;color:hsl(var(--muted-foreground));font-size:11px}.template-subject{border:1px solid hsl(var(--border)/.65);border-radius:11px;margin-top:7px;padding:8px 12px}.template-subject summary{display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;padding:3px 0}.template-subject-count{margin-left:auto;color:hsl(var(--muted-foreground));font-size:11px;font-variant-numeric:tabular-nums}.template-topics{padding:8px 0 2px 3px;animation:template-topics-in 160ms ease-out}.template-topics label{display:flex;align-items:flex-start;gap:9px;padding:6px 0;font-size:12px;line-height:1.5}.template-topics input{margin-top:3px;flex-shrink:0}.study-template-picker input[type=checkbox]{accent-color:hsl(var(--primary));width:14px;height:14px}.study-template-picker button:disabled,.study-template-picker input:disabled{opacity:.45}.study-template-picker button:focus-visible,.template-sources a:focus-visible,.template-subject summary:focus-visible{outline:2px solid hsl(var(--primary)/.4);outline-offset:3px;border-radius:4px}@keyframes template-topics-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}@media(max-width:520px){.template-selectors.has-variants{grid-template-columns:minmax(0,1fr)}.template-selection{gap:10px}}@media(prefers-reduced-motion:reduce){.template-topics{animation:none}}
</style>
