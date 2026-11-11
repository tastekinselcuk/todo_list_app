<template>
  <Teleport to="body">
    <dialog ref="dialog" class="task-completion-dialog" role="alertdialog" :aria-labelledby="titleId" :aria-describedby="descriptionId" @cancel.prevent="$emit('resolve',false)" @keydown.esc.stop.prevent="$emit('resolve',false)">
      <div class="flex items-start gap-3">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/[0.08] text-primary"><ListChecks :size="18" :stroke-width="1.6" /></span>
        <div class="min-w-0 pt-0.5">
          <h3 :id="titleId" class="text-sm font-medium">{{ t('tasks.completeAllTitle') }}</h3>
          <p class="mt-1.5 line-clamp-2 break-words text-xs text-muted-foreground">{{ title }}</p>
        </div>
      </div>
      <p :id="descriptionId" class="mt-4 text-xs leading-6 text-muted-foreground">{{ t('tasks.completeAllBody',{count}) }}</p>
      <div class="mt-5 flex justify-end gap-2">
        <button ref="cancelButton" type="button" autofocus class="h-9 rounded-xl border border-border/70 px-3 text-xs transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" @click="$emit('resolve',false)">{{ t('tasks.cancelCompletion') }}</button>
        <button type="button" class="workspace-add-button !h-9 !px-3 !font-medium" @click="$emit('resolve',true)">{{ t('tasks.completeAll') }}</button>
      </div>
    </dialog>
  </Teleport>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ListChecks } from 'lucide-vue-next'
defineProps<{title:string;count:number}>()
const emit=defineEmits<{resolve:[confirmed:boolean]}>()
const {t}=useI18n(),dialog=ref<HTMLDialogElement>(),cancelButton=ref<HTMLButtonElement>()
const titleId=`task-completion-${crypto.randomUUID()}`,descriptionId=`${titleId}-description`
let disposed=false,previousFocus:HTMLElement|null=null,scroll:{body:string;root:string;gutter:string}|null=null
onMounted(async()=>{
  await nextTick()
  if(disposed||!dialog.value)return
  previousFocus=document.activeElement as HTMLElement
  // A task editor may already own the scroll lock underneath this dialog.
  if(document.body.style.overflow!=='hidden'&&document.documentElement.style.overflow!=='hidden'){
    scroll={body:document.body.style.overflow,root:document.documentElement.style.overflow,gutter:document.documentElement.style.scrollbarGutter}
    document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';document.documentElement.style.scrollbarGutter='stable'
  }
  try{dialog.value.showModal();cancelButton.value?.focus({preventScroll:true})}catch{emit('resolve',false)}
})
onBeforeUnmount(()=>{
  disposed=true;dialog.value?.close()
  if(scroll){document.body.style.overflow=scroll.body;document.documentElement.style.overflow=scroll.root;document.documentElement.style.scrollbarGutter=scroll.gutter}
  if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true})
})
</script>
<style scoped>
.task-completion-dialog{width:min(400px,calc(100vw - 32px));max-height:calc(100dvh - 32px);margin:auto;padding:20px;border:1px solid hsl(var(--border)/.7);border-radius:20px;background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 20px 70px rgb(0 0 0/.16);overflow:auto}
.task-completion-dialog::backdrop{background:hsl(var(--background)/.65);backdrop-filter:blur(5px)}
@media(prefers-reduced-motion:no-preference){.task-completion-dialog[open]{animation:task-confirm-enter .16s ease-out}@keyframes task-confirm-enter{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}}
</style>
