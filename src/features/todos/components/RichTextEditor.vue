<template>
  <div ref="rootRef" class="note-editor relative flex min-w-0 flex-col" :class="[fitHeight && 'editor-fitted', disabled && !fitHeight ? 'editor-reader' : 'editor-writer rounded-xl border border-border/50 bg-background/40 transition-colors focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20']" @keydown.esc="handleEscape">
    <div v-if="!disabled" class="flex flex-wrap items-center gap-0.5 rounded-t-xl border-b border-border/40 bg-muted/10 p-1">
      <CustomSelect ref="textSelectRef" :preserve-focus="true" @open-change="selectOpened('text', $event)" :model-value="textMode" :options="textOptions" :aria-label="t('noteEditor.textStyle')" variant="ghost" size="sm" class="w-fit" @update:model-value="setTextMode" />
      <button v-for="tool in formatTools" :key="tool.name" type="button" class="editor-tool" :class="[isActive(tool.name) && 'is-active',['underline','strike'].includes(tool.name) && 'editor-secondary']" :title="t('noteEditor.'+tool.name)" :aria-label="t('noteEditor.'+tool.name)" :aria-pressed="isActive(tool.name)" @mousedown.prevent @click="run(tool.name)"><component :is="tool.icon" class="h-3.5 w-3.5" /></button>
      <button type="button" class="editor-tool editor-secondary" data-editor-menu="color" :class="menu==='color' && 'is-active'" :title="t('noteEditor.colors')" :aria-label="t('noteEditor.colors')" :aria-expanded="menu==='color'" @mousedown.prevent @click="openMenu('color')"><Palette class="h-3.5 w-3.5" /></button>
      <span class="mx-1 h-4 w-px bg-border/50" aria-hidden="true" />
      <button v-for="tool in blockTools" :key="tool.name" type="button" class="editor-tool" :class="[isActive(tool.name) && 'is-active',['orderedList','details'].includes(tool.name) && 'editor-secondary']" :title="t('noteEditor.'+tool.name)" :aria-label="t('noteEditor.'+tool.name)" :aria-pressed="isActive(tool.name)" @mousedown.prevent @click="run(tool.name)"><component :is="tool.icon" class="h-3.5 w-3.5" /></button>
      <button type="button" class="editor-tool editor-secondary" data-editor-menu="table" :class="menu==='table' && 'is-active'" :disabled="isActive('table')" :title="t('noteEditor.table')" :aria-label="t('noteEditor.table')" :aria-expanded="menu==='table'" @mousedown.prevent @click="openMenu('table')"><Table2 class="h-3.5 w-3.5" /></button>
      <button type="button" class="editor-tool" :disabled="uploading" :title="t('noteEditor.image')" :aria-label="t('noteEditor.image')" data-editor-menu="image" :aria-expanded="menu==='image'" @mousedown.prevent @click="openMenu('image')"><ImagePlus class="h-3.5 w-3.5" /></button>
      <button type="button" class="editor-tool editor-secondary" :class="isActive('link') && 'is-active'" :title="t('noteEditor.link')" :aria-label="t('noteEditor.link')" data-editor-menu="link" :aria-expanded="menu==='link'" @mousedown.prevent @click="openMenu('link')"><Link2 class="h-3.5 w-3.5" /></button>
      <button type="button" class="editor-tool" :title="t('noteEditor.more')" :aria-label="t('noteEditor.more')" data-editor-menu="more" :aria-expanded="menu==='more'" @mousedown.prevent @click="openMenu('more')"><MoreHorizontal class="h-3.5 w-3.5" /></button>
      <div class="editor-history ml-auto flex items-center gap-0.5">
        <button v-for="tool in historyTools" :key="tool.name" type="button" class="editor-tool" :disabled="!canHistory(tool.name)" :title="t('noteEditor.'+tool.name)" :aria-label="t('noteEditor.'+tool.name)" @mousedown.prevent @click="run(tool.name)"><component :is="tool.icon" class="h-3.5 w-3.5" /></button>
      </div>
    </div>

    <Transition name="editor-menu">
      <div v-if="menu && !disabled" ref="panelRef" class="editor-panel" :class="{'editor-table-panel':menu==='table'}" @keydown.esc.stop.prevent="menu=null">
        <template v-if="menu==='table'">
          <div class="table-picker-heading"><span>{{ t('noteEditor.table') }}</span><span class="tabular-nums" aria-live="polite" aria-atomic="true">{{ tableSize.columns }} × {{ tableSize.rows }}</span></div>
          <div class="table-picker-grid" role="group" :aria-label="t('noteEditor.tableSize',tableSize)">
            <template v-for="row in 5" :key="row">
              <button v-for="column in 8" :key="column" type="button" class="table-picker-cell" :class="{'is-highlighted':row<=tableSize.rows && column<=tableSize.columns}" :data-table-cell="`${row}-${column}`" :tabindex="row===tableSize.rows && column===tableSize.columns?0:-1" :aria-label="t('noteEditor.tableSize',{rows:row,columns:column})" @pointerenter="tableSize={rows:row,columns:column}" @focus="tableSize={rows:row,columns:column}" @keydown="moveTableSelection($event,row,column)" @mousedown.prevent @click="insertTable(row,column)" />
            </template>
          </div>
        </template>
        <template v-else-if="menu==='color'">
          <ColorPalette :model-value="selectedTextColor" :options="textColors" variant="text" :label="t('noteEditor.textColor')" :clear-label="t('noteEditor.defaultColor')" @update:model-value="applyColor('text',$event)" />
          <ColorPalette class="mt-3 border-t border-border/50 pt-3" :model-value="selectedHighlightColor" :options="highlightColors" :label="t('noteEditor.highlightColor')" :clear-label="t('noteEditor.defaultColor')" @update:model-value="applyColor('bg',$event)" />
        </template>
        <template v-else-if="menu==='image'">
          <button type="button" class="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-background/40 px-3 py-3 text-xs text-muted-foreground transition-colors hover:bg-muted/40 disabled:opacity-50" :disabled="uploading" @click="fileRef?.click()"><Upload class="h-4 w-4" />{{ t('noteEditor.uploadImage') }}</button>
          <p class="mt-1.5 text-[10px] text-muted-foreground">{{ t('noteEditor.imageHint') }}</p>
          <div class="mt-3 flex gap-1.5"><input v-model="imageUrl" type="url" class="editor-field min-w-0 flex-1" placeholder="https://…" :aria-label="t('noteEditor.imageUrl')" @keydown.enter.prevent="insertLinkedImage" /><button type="button" class="editor-confirm" :disabled="!imageUrl.trim()" @click="insertLinkedImage">{{ t('quickNotes.add') }}</button></div>
        </template>
        <template v-else-if="menu==='link'">
          <div class="flex gap-1.5"><input v-model="linkUrl" type="url" class="editor-field min-w-0 flex-1" placeholder="https://…" :aria-label="t('noteEditor.link')" @keydown.enter.prevent="applyLink" /><button type="button" class="editor-confirm" @click="applyLink">{{ t('common.save') }}</button></div>
          <button v-if="isActive('link')" type="button" class="mt-2 text-xs text-muted-foreground hover:text-foreground" @click="removeLink">{{ t('noteEditor.removeLink') }}</button>
        </template>
        <template v-else>
          <button v-for="tool in mobileTools" :key="tool.name" type="button" class="editor-menu-item editor-mobile-only" @mousedown.prevent @click="mobileAction(tool.name)"><component :is="tool.icon" class="h-3.5 w-3.5" />{{ t('noteEditor.'+tool.name) }}</button>
          <button v-for="tool in extraTools" :key="tool.name" type="button" class="editor-menu-item" @mousedown.prevent @click="run(tool.name);menu=null"><component :is="tool.icon" class="h-3.5 w-3.5" />{{ t('noteEditor.'+tool.name) }}</button>
        </template>
      </div>
    </Transition>

    <div v-if="!disabled && isActive('table')" class="flex flex-wrap items-center gap-1 border-b border-border/40 bg-muted/5 px-2 py-1">
      <span class="mr-1 text-[10px] text-muted-foreground">{{ t('noteEditor.table') }}</span>
      <button v-for="action in ['addRowAfter','addColumnAfter']" :key="action" type="button" :disabled="!canTableAction(action)" class="editor-context-action" @mousedown.prevent @click="tableAction(action)"><Plus class="h-3 w-3" />{{ t('noteEditor.'+action) }}</button>
      <CustomSelect ref="tableSelectRef" :preserve-focus="true" @open-change="selectOpened('table', $event)" :model-value="''" :options="tableOptions" :placeholder="t('noteEditor.tableActions')" :aria-label="t('noteEditor.tableActions')" variant="ghost" size="sm" class="w-fit" @update:model-value="tableAction" />
      <button type="button" class="editor-tool" :title="t('noteEditor.deleteTable')" :aria-label="t('noteEditor.deleteTable')" @mousedown.prevent @click="tableAction('deleteTable')"><Trash2 class="h-3.5 w-3.5" /></button>
    </div>
    <div v-if="!disabled && isActive('image')" class="flex flex-wrap items-center gap-1 border-b border-border/40 bg-muted/5 px-2 py-1">
      <span class="mr-1 text-[10px] text-muted-foreground">{{ t('noteEditor.imageSize') }}</span>
      <button v-for="width in [25,50,75,100]" :key="width" type="button" class="rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted/50" :class="Number(editor?.getAttributes('image').displayWidth || 100)===width && 'bg-muted/50 text-foreground'" @mousedown.prevent @click="resizeImage(width)">{{ width }}%</button>
      <input v-model="imageAlt" :aria-label="t('noteEditor.imageAlt')" :placeholder="t('noteEditor.imageAlt')" maxlength="200" class="editor-field ml-1 min-w-24 flex-1" @input="updateImageAlt" />
      <button type="button" class="editor-tool" :title="t('common.delete')" :aria-label="t('common.delete')" @mousedown.prevent @click="deleteImage"><Trash2 class="h-3.5 w-3.5" /></button>
    </div>
    <EditorContent :editor="editor" class="editor-content min-w-0" :class="disabled?'editor-readonly':'editor-editable'" />
    <Teleport to="body">
      <dialog ref="imageDialogRef" class="note-image-viewer" :aria-label="t('noteEditor.imagePreview')" @cancel.prevent="closeImagePreview" @close="onPreviewClosed" @click="event=>{if(event.target===imageDialogRef)closeImagePreview()}">
        <div v-if="imagePreview" class="image-viewer-shell">
          <header class="flex h-12 shrink-0 items-center gap-2 border-b border-border/50 px-3 text-muted-foreground">
            <span class="min-w-0 flex-1 truncate text-xs">{{ imagePreview.alt || t('noteEditor.imagePreview') }}</span>
            <button type="button" class="editor-tool" :aria-label="t(previewZoom?'noteEditor.fitImage':'noteEditor.zoomImage')" :title="t(previewZoom?'noteEditor.fitImage':'noteEditor.zoomImage')" @click="previewZoom=!previewZoom"><ZoomOut v-if="previewZoom" class="h-4 w-4" /><ZoomIn v-else class="h-4 w-4" /></button>
            <button type="button" autofocus class="editor-tool" :aria-label="t('common.close')" :title="t('common.close')" @click="closeImagePreview"><X class="h-4 w-4" /></button>
          </header>
          <div class="image-viewer-canvas"><img :src="imagePreview.src" :alt="imagePreview.alt" referrerpolicy="no-referrer" :class="{'image-original-size':previewZoom}" /></div>
        </div>
      </dialog>
    </Teleport>
    <input ref="fileRef" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple class="hidden" :disabled="disabled || uploading" :aria-label="t('noteEditor.uploadImage')" @change="chooseFiles" />
    <div v-if="uploading || error" class="flex items-center gap-1.5 px-3 pb-2 text-[11px]" :class="error?'text-destructive':'text-muted-foreground'" role="status"><Loader2 v-if="uploading" class="h-3 w-3 animate-spin motion-reduce:animate-none" />{{ error?t('noteEditor.'+error):t('noteEditor.imageUploading') }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { Extension } from '@tiptap/core'
import { NodeSelection, Plugin, PluginKey, TextSelection, type SelectionBookmark } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Bold, Italic, Strikethrough, Underline, List, ListOrdered, ListTodo, ChevronRight, Table2, ImagePlus, Link2, Palette, MoreHorizontal, Undo2, Redo2, Quote, Code2, Minus, RemoveFormatting, Upload, Loader2, X, Trash2, Plus, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import ColorPalette from '@/components/ui/ColorPalette.vue'
import { createNoteExtensions } from '@/lib/noteEditor'
import { sanitizeNoteHtml, safeNoteImageUrl, safeNoteLink } from '@/lib/noteContent'
import { uploadNoteImage, resolveNoteImage, discardNoteImage } from '@/lib/noteImages'

const props=defineProps<{modelValue:string;placeholder?:string;disabled?:boolean;fitHeight?:boolean}>()
const emit=defineEmits<{'update:modelValue':[value:string];'busy-change':[value:boolean];focus:[]}>()
const {t}=useI18n()
const rootRef=ref<HTMLElement|null>(null),fileRef=ref<HTMLInputElement|null>(null),panelRef=ref<HTMLElement|null>(null)
const textSelectRef=ref<InstanceType<typeof CustomSelect>|null>(null),tableSelectRef=ref<InstanceType<typeof CustomSelect>|null>(null)
const menu=ref<'color'|'image'|'link'|'more'|'table'|null>(null),imageUrl=ref(''),linkUrl=ref(''),imageAlt=ref(''),error=ref(''),uploading=ref(false),revision=ref(0)
const tableSize=ref({rows:1,columns:1})
const imageDialogRef=ref<HTMLDialogElement|null>(null),imagePreview=ref<{src:string;alt:string}|null>(null),previewZoom=ref(false)
let previewEpoch=0,previousBodyOverflow:string|null=null
async function openImagePreview(src:string,alt:string){
 if(!props.disabled || !safeNoteImageUrl(src))return
 const epoch=++previewEpoch
 imagePreview.value={src,alt};previewZoom.value=false
 await nextTick()
 if(disposed || epoch!==previewEpoch || !imageDialogRef.value)return
 if(!imageDialogRef.value.open){
  previousBodyOverflow=document.body.style.overflow
  document.body.style.overflow='hidden'
  imageDialogRef.value.showModal()
 }
}
function onPreviewClosed(){
 if(imageDialogRef.value?.open)return
 previewEpoch++;imagePreview.value=null;previewZoom.value=false
 if(previousBodyOverflow!==null){document.body.style.overflow=previousBodyOverflow;previousBodyOverflow=null}
}
function closeImagePreview(){imageDialogRef.value?.close();onPreviewClosed()}
let disposed=false,bookmark:SelectionBookmark|null=null,lastEmitted=''
// View-only selection feedback: never saved into note HTML or undo history.
const colorSelectionKey=new PluginKey<boolean>('noteColorSelection')
const ColorSelectionPreview=Extension.create({
 name:'noteColorSelection',
 addProseMirrorPlugins(){return [new Plugin<boolean>({
  key:colorSelectionKey,
  state:{
   init:()=>false,
   apply(transaction,active,previous){
    const requested=transaction.getMeta(colorSelectionKey)
    if(typeof requested==='boolean')return requested
    return transaction.selection.eq(previous.selection)?active:false
   },
  },
  props:{
   attributes:(state):Record<string,string>=>colorSelectionKey.getState(state)?{'data-color-selection-preview':'true'}:{},
   decorations(state){
    const {selection,doc}=state
    if(!colorSelectionKey.getState(state) || !(selection instanceof TextSelection) || selection.empty)return null
    return DecorationSet.create(doc,[Decoration.inline(selection.from,selection.to,{class:'note-color-selection'})])
   },
   handleDOMEvents:{pointerdown(view){
    if(colorSelectionKey.getState(view.state))view.dispatch(view.state.tr.setMeta(colorSelectionKey,false).setMeta('addToHistory',false))
    return false
   }},
  },
 })]},
})
const editor=useEditor({
 extensions:[...createNoteExtensions({openLinks:Boolean(props.disabled),placeholder:props.placeholder,togglePlaceholder:t('noteEditor.toggleTitle'),resolveImage:resolveNoteImage,imageError:t('noteEditor.imageUnavailable'),imageLoading:t('noteEditor.imageLoading'),toggleLabel:open=>t(open?'noteEditor.collapse':'noteEditor.expand'),taskLabel:text=>t('todo.toggleCompletion')+': '+text,resizeLabel:t('noteEditor.resizeImage'),previewLabel:t('noteEditor.previewImage'),onImagePreview:(src,alt)=>void openImagePreview(src,alt)}),ColorSelectionPreview],
 content:sanitizeNoteHtml(props.modelValue || ''),editable:!props.disabled,
 editorProps:{
  attributes:{class:'note-prose',role:props.disabled?'document':'textbox','aria-multiline':props.disabled?'false':'true','aria-label':props.placeholder || t('todo.description')},
  transformPastedHTML:sanitizeNoteHtml,
  handlePaste:(_view,event)=>handlePaste(event),
  handleDrop:(_view,event,_slice,moved)=>moved?false:handleDrop(event),
 },
 onUpdate:()=>emitChange(),
 onFocus:()=>{if(!props.disabled)emit('focus')},
 onTransaction:({transaction})=>{revision.value++;if(bookmark)bookmark=bookmark.map(transaction.mapping)},
 onSelectionUpdate:({editor:current})=>{imageAlt.value=current.isActive('image')?(current.getAttributes('image').alt || ''):''},
})
const formatTools=[{name:'bold',icon:Bold},{name:'italic',icon:Italic},{name:'underline',icon:Underline},{name:'strike',icon:Strikethrough}]
const blockTools=[{name:'bulletList',icon:List},{name:'orderedList',icon:ListOrdered},{name:'taskList',icon:ListTodo},{name:'details',icon:ChevronRight}]
const historyTools=[{name:'undo',icon:Undo2},{name:'redo',icon:Redo2}]
const extraTools=[{name:'blockquote',icon:Quote},{name:'codeBlock',icon:Code2},{name:'divider',icon:Minus},{name:'clear',icon:RemoveFormatting}]
const mobileTools=[{name:'underline',icon:Underline},{name:'strike',icon:Strikethrough},{name:'orderedList',icon:ListOrdered},{name:'details',icon:ChevronRight},{name:'table',icon:Table2},{name:'link',icon:Link2},{name:'colors',icon:Palette},...historyTools]
const colors=['gray','brown','orange','yellow','green','blue','purple','pink','red']
const textColors=computed(()=>colors.map(value=>({value,label:t('noteEditor.colorNames.'+value),color:`var(--tt-color-text-${value})`})))
const highlightColors=computed(()=>colors.map(value=>({value,label:t('noteEditor.colorNames.'+value),color:`var(--tt-color-highlight-${value})`})))
const selectedTextColor=computed(()=>colors.find(color=>isColorSelected('text',color))||null)
const selectedHighlightColor=computed(()=>colors.find(color=>isColorSelected('bg',color))||null)
const textOptions=computed(()=>['paragraph','h1','h2','h3'].map(value=>({value,label:t('noteEditor.'+value)})))
const textMode=computed(()=>{revision.value;for(const level of [1,2,3])if(editor.value?.isActive('heading',{level}))return 'h'+level;return 'paragraph'})
const tableOptions=computed(()=>['addRowBefore','addRowAfter','deleteRow','addColumnBefore','addColumnAfter','deleteColumn','mergeCells','splitCell','toggleHeaderRow'].map(value=>({value,label:t('noteEditor.'+value),disabled:!canTableAction(value)})))
function isActive(name:string){revision.value;return Boolean(editor.value?.isActive(name))}
function canHistory(name:string){revision.value;return !props.disabled && Boolean(name==='undo'?editor.value?.can().undo():editor.value?.can().redo())}
function openMenu(value:typeof menu.value){
 if(props.disabled || value==='table' && isActive('table'))return
 textSelectRef.value?.close(false);tableSelectRef.value?.close(false)
 error.value='';if(value==='link')linkUrl.value=editor.value?.getAttributes('link').href || ''
 if(value==='table')tableSize.value={rows:1,columns:1}
 if(value==='color')showColorSelection()
 menu.value=menu.value===value?null:value
}
function showColorSelection(){
 const current=editor.value
 if(!current || props.disabled || !(current.state.selection instanceof TextSelection) || current.state.selection.empty)return
 current.view.dispatch(current.state.tr.setMeta(colorSelectionKey,true).setMeta('addToHistory',false))
}
function insertTable(rows:number,columns:number){
 if(props.disabled || !editor.value || isActive('table') || !Number.isInteger(rows) || !Number.isInteger(columns) || rows<1 || rows>5 || columns<1 || columns>8)return
 editor.value.chain().focus(undefined,{scrollIntoView:false}).insertTable({rows,cols:columns,withHeaderRow:true}).run()
 menu.value=null
}
function moveTableSelection(event:KeyboardEvent,row:number,column:number){
 const offsets:Record<string,[number,number]>={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}
 const offset=offsets[event.key]
 if(!offset)return
 event.preventDefault()
 const rows=Math.max(1,Math.min(5,row+offset[0])),columns=Math.max(1,Math.min(8,column+offset[1]))
 tableSize.value={rows,columns}
 void nextTick(()=>panelRef.value?.querySelector<HTMLButtonElement>(`[data-table-cell="${rows}-${columns}"]`)?.focus({preventScroll:true}))
}
function selectOpened(kind:'text'|'table',open:boolean){
 if(!open)return
 menu.value=null
 if(kind==='text')tableSelectRef.value?.close(false);else textSelectRef.value?.close(false)
}
function run(name:string){
 const current=editor.value;if(!current || props.disabled)return
 if(name==='table'){openMenu('table');return}
 error.value='';menu.value=null
 const chain=current.chain().focus()
 switch(name){
  case 'bold':chain.toggleBold().run();break
  case 'italic':chain.toggleItalic().run();break
  case 'underline':chain.toggleUnderline().run();break
  case 'strike':chain.toggleStrike().run();break
  case 'bulletList':chain.toggleBulletList().run();break
  case 'orderedList':chain.toggleOrderedList().run();break
  case 'taskList':chain.toggleTaskList().run();break
  case 'details':if(current.isActive('details'))chain.unsetDetails().run();else chain.setDetails().run();break
  case 'blockquote':chain.toggleBlockquote().run();break
  case 'codeBlock':chain.toggleCodeBlock().run();break
  case 'divider':chain.setHorizontalRule().run();break
  case 'clear':chain.unsetAllMarks().clearNodes().run();break
  case 'undo':chain.undo().run();break
  case 'redo':chain.redo().run();break
 }
}
function mobileAction(name:string){if(name==='colors' || name==='link' || name==='table')openMenu(name==='colors'?'color':name);else{run(name);menu.value=null}}
function setTextMode(value:string){
 if(props.disabled || !editor.value)return
 if(value==='paragraph')editor.value.chain().focus().setParagraph().run()
 else if(['h1','h2','h3'].includes(value))editor.value.chain().focus().setHeading({level:Number(value.slice(1)) as 1|2|3}).run()
}
function isColorSelected(type:'text'|'bg',color:string|null){
 revision.value
 const attrs=editor.value?.getAttributes('textStyle')
 const value=type==='text'?attrs?.color:attrs?.backgroundColor || editor.value?.getAttributes('highlight').color
 return color?value==='var(--tt-color-'+(type==='text'?'text-':'highlight-')+color+')':!value
}
function applyColor(type:'text'|'bg',color:string|null){
 if(props.disabled || !editor.value || color&&!colors.includes(color))return
 showColorSelection()
 const chain=editor.value.chain().focus()
 if(type==='text'){if(color)chain.setColor('var(--tt-color-text-'+color+')').run();else chain.unsetColor().run()}
 else{if(color)chain.unsetHighlight().setBackgroundColor('var(--tt-color-highlight-'+color+')').run();else chain.unsetBackgroundColor().unsetHighlight().run()}
 menu.value=null
}
function canTableAction(name:string){
 revision.value
 if(props.disabled || !editor.value)return false
 const commands=editor.value.can()
 switch(name){
  case 'addRowBefore':return commands.addRowBefore();case 'addRowAfter':return commands.addRowAfter()
  case 'deleteRow':return commands.deleteRow();case 'addColumnBefore':return commands.addColumnBefore()
  case 'addColumnAfter':return commands.addColumnAfter();case 'deleteColumn':return commands.deleteColumn()
  case 'mergeCells':return commands.mergeCells();case 'splitCell':return commands.splitCell()
  case 'toggleHeaderRow':return commands.toggleHeaderRow();case 'deleteTable':return commands.deleteTable()
  default:return false
 }
}
function tableAction(name:string){
 if(!canTableAction(name) || !editor.value)return
 const chain=editor.value.chain().focus()
 switch(name){
  case 'addRowBefore':chain.addRowBefore().run();break;case 'addRowAfter':chain.addRowAfter().run();break
  case 'deleteRow':chain.deleteRow().run();break;case 'addColumnBefore':chain.addColumnBefore().run();break
  case 'addColumnAfter':chain.addColumnAfter().run();break;case 'deleteColumn':chain.deleteColumn().run();break
  case 'mergeCells':chain.mergeCells().run();break;case 'splitCell':chain.splitCell().run();break
  case 'toggleHeaderRow':chain.toggleHeaderRow().run();break;case 'deleteTable':chain.deleteTable().run();break
 }
}
function updateImageAttribute(name:'alt'|'displayWidth',value:string|number){
 const current=editor.value
 if(!current || props.disabled)return
 const selection=current.state.selection
 if(!(selection instanceof NodeSelection) || selection.node.type.name!=='image')return
 // Attribute steps preserve node selection and the focus/caret in the caption input.
 current.view.dispatch(current.state.tr.setNodeAttribute(selection.from,name,value))
}
function resizeImage(width:number){updateImageAttribute('displayWidth',width)}
function updateImageAlt(){updateImageAttribute('alt',imageAlt.value)}
function deleteImage(){if(!props.disabled)editor.value?.chain().focus().deleteSelection().run()}
function applyLink(){
 if(props.disabled || !editor.value)return
 const href=safeNoteLink(linkUrl.value)
 if(!href){error.value='invalidUrl';return}
 if(editor.value.state.selection.empty && !editor.value.isActive('link'))editor.value.chain().focus().insertContent({type:'text',text:href,marks:[{type:'link',attrs:{href}}]}).run()
 else editor.value.chain().focus().extendMarkRange('link').setLink({href}).run()
 menu.value=null
}
function removeLink(){if(!props.disabled)editor.value?.chain().focus().extendMarkRange('link').unsetLink().run();menu.value=null}
function insertLinkedImage(){
 if(props.disabled || !editor.value)return
 const src=safeNoteImageUrl(imageUrl.value.trim())
 if(!src || !src.startsWith('https://')){error.value='invalidUrl';return}
 editor.value.chain().focus().setImage({src,alt:''}).run();imageUrl.value='';menu.value=null
}
async function processImageFiles(files:FileList|File[]){
 if(props.disabled || disposed || uploading.value || !editor.value)return false
 const images=Array.from(files)
 if(!images.length)return false
 if(images.length>6){error.value='imageCount';return false}
 uploading.value=true;emit('busy-change',true);error.value='';menu.value=null
 bookmark=editor.value.state.selection.getBookmark()
 try{
  for(const file of images){
   const image=await uploadNoteImage(file)
   if(disposed || props.disabled || !editor.value || editor.value.isDestroyed){void discardNoteImage(image.path);return false}
   const selection=bookmark?.resolve(editor.value.state.doc) || editor.value.state.selection
   editor.value.chain().focus().insertContentAt({from:selection.from,to:selection.to},{type:'image',attrs:{storagePath:image.path,alt:image.alt}}).run()
  }
  return true
 }catch(failure){if(!disposed){const code=(failure as Error).message;error.value=['imagePermission','imageType','imageSizeError','imageDimensions','imageCount','imageSetup','imageUploadFailed'].includes(code)?code:'imageUploadFailed'}return false}
 finally{bookmark=null;uploading.value=false;if(!disposed)emit('busy-change',false)}
}
function chooseFiles(event:Event){const input=event.target as HTMLInputElement;if(input.files)void processImageFiles(input.files);input.value=''}
function handlePaste(event:ClipboardEvent){
 if(props.disabled){event.preventDefault();return true}
 const items=Array.from(event.clipboardData?.items || []).filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter((file):file is File=>Boolean(file))
 const files=items.length?items:Array.from(event.clipboardData?.files || [])
 if(files.length){event.preventDefault();void processImageFiles(files);return true}
 return false
}
function handleDrop(event:DragEvent){
 if(props.disabled){event.preventDefault();return true}
 const files=event.dataTransfer?.files
 if(files?.length){
  event.preventDefault()
  const position=editor.value?.view.posAtCoords({left:event.clientX,top:event.clientY})?.pos
  if(position!==undefined)editor.value?.commands.setTextSelection(position)
  void processImageFiles(files);return true
 }
 return false
}
function emitChange(){
 if(!editor.value || props.disabled || disposed)return
 lastEmitted=editor.value.isEmpty?'':sanitizeNoteHtml(editor.value.getHTML())
 emit('update:modelValue',lastEmitted)
}
watch(()=>props.modelValue,value=>{
 const current=editor.value,cleaned=sanitizeNoteHtml(value || '')
 if(!current || value===lastEmitted || cleaned===sanitizeNoteHtml(current.getHTML()))return
 current.commands.setContent(cleaned,{emitUpdate:false})
})
watch(()=>props.disabled,value=>{editor.value?.setEditable(!value,false);if(value)menu.value=null})
function handleEscape(event:KeyboardEvent){if(menu.value){event.preventDefault();event.stopPropagation();menu.value=null}}
function clickOutside(event:Event){
 if(!menu.value)return
 const target=event.target as Node
 if(panelRef.value?.contains(target))return
 const trigger=rootRef.value?.querySelector('[data-editor-menu="'+menu.value+'"]')
 if(trigger?.contains(target))return
 menu.value=null
}
onMounted(()=>{
 document.addEventListener('pointerdown',clickOutside,true)
 document.addEventListener('focusin',clickOutside,true)
})
onBeforeUnmount(()=>{
 disposed=true;closeImagePreview()
 document.removeEventListener('pointerdown',clickOutside,true)
 document.removeEventListener('focusin',clickOutside,true)
})
function focusEditor(){if(!props.disabled)editor.value?.commands.focus(undefined,{scrollIntoView:false})}
defineExpose({focus:focusEditor})
</script>

<style scoped>
.note-image-viewer { width:calc(100vw - 32px); max-width:1200px; max-height:calc(100dvh - 32px); padding:0; margin:auto; border:1px solid hsl(var(--border)/.6); border-radius:16px; background:hsl(var(--card)); color:hsl(var(--foreground)); box-shadow:0 24px 80px rgb(0 0 0 / .25); }
.note-image-viewer::backdrop { background:hsl(var(--background)/.85); backdrop-filter:blur(8px); }
.image-viewer-shell { display:flex; flex-direction:column; max-height:calc(100dvh - 34px); }
.image-viewer-canvas { overflow:auto; padding:16px; min-height:0; }
.image-viewer-canvas img { display:block; margin:auto; max-width:100%; max-height:calc(100dvh - 116px); object-fit:contain; border-radius:8px; }
.image-viewer-canvas img.image-original-size { max-width:none; max-height:none; }
.editor-reader :deep(.note-prose) { padding:0; }
.editor-reader :deep(.note-image-node img) { cursor:zoom-in; }
.editor-reader :deep(.note-image-node img:focus-visible) { outline:2px solid hsl(var(--primary)/.5); outline-offset:3px; }
.editor-tool { @apply inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-30; }
.editor-context-action { @apply inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:cursor-default disabled:opacity-40; }
.editor-tool.is-active { @apply bg-primary/10 text-primary; }
.editor-panel { @apply absolute left-2 top-10 z-50 w-72 rounded-xl border border-border/60 bg-card p-3 shadow-xl; max-width:calc(100% - 1rem); max-height:min(70vh,420px); overflow-y:auto; }
.editor-table-panel{width:232px;padding:12px;box-shadow:0 8px 24px hsl(var(--foreground)/.1)}
.table-picker-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px;font-size:11px;font-weight:500;color:hsl(var(--muted-foreground))}
.table-picker-grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px}
.table-picker-cell{aspect-ratio:1;min-width:0;border:1px solid hsl(var(--border)/.85);border-radius:4px;background:hsl(var(--muted)/.25);transition:background-color 90ms,border-color 90ms}
.table-picker-cell.is-highlighted{border-color:hsl(var(--primary)/.6);background:hsl(var(--primary)/.18)}
.table-picker-cell:focus-visible{outline:2px solid hsl(var(--primary));outline-offset:1px}
@media(prefers-reduced-motion:reduce){.table-picker-cell{transition:none}}
.editor-menu-label { @apply mb-1.5 text-[10px] font-medium text-muted-foreground; }
.editor-menu-item { @apply flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-foreground transition-colors hover:bg-muted/50; }
.editor-menu-item.editor-mobile-only { display:none; }
.editor-field { @apply h-8 rounded-lg border border-border/50 bg-background/50 px-2 text-xs outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/30; }
.editor-confirm { @apply rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-40; }
:deep(.note-prose) { @apply min-w-0 break-words p-3 text-sm leading-relaxed outline-none; overflow-wrap:anywhere; }
:deep(.note-color-selection){box-shadow:0 1px 0 hsl(var(--muted-foreground)/.45);box-decoration-break:clone;-webkit-box-decoration-break:clone}
@media(forced-colors:none){
 :deep(.note-prose[data-color-selection-preview]::selection),:deep(.note-prose[data-color-selection-preview] ::selection){background:transparent;color:inherit;text-shadow:none}
}
.editor-editable :deep(.note-prose) { min-height:112px; max-height:60vh; overflow-y:auto; resize:vertical; }
.editor-fitted { flex:1; min-height:0; }
.editor-fitted .editor-panel { max-height:min(360px,45dvh); }
.editor-fitted .editor-content { display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden; }
.editor-fitted .editor-content :deep(.note-prose) { flex:1; min-height:0; max-height:none; overflow-y:auto; overscroll-behavior:contain; resize:none; }
:deep(.note-prose > * + *) { margin-top:.6em; }
:deep(.note-prose p) { margin:.25em 0; }
:deep(.note-prose h1) { font-size:1.5em; font-weight:600; line-height:1.4; }
:deep(.note-prose h2) { font-size:1.3em; font-weight:600; line-height:1.4; }
:deep(.note-prose h3) { font-size:1.1em; font-weight:600; }
:deep(.note-prose a) { color:hsl(var(--primary)); text-decoration:underline; text-underline-offset:3px; }
:deep(.note-prose ul) { list-style:disc; padding-left:1.4em; }
:deep(.note-prose ol) { list-style:decimal; padding-left:1.4em; }
:deep(.note-prose li + li) { margin-top:.25em; }
:deep(.note-prose ul[data-type="taskList"]) { list-style:none; padding-left:0; }
:deep(.note-prose li[data-type="taskItem"]) { display:flex; align-items:flex-start; gap:.6em; }
:deep(.note-prose li[data-type="taskItem"] > label) { flex-shrink:0; padding-top:.1em; }
:deep(.note-prose li[data-type="taskItem"] > div) { min-width:0; flex:1; }
:deep(.note-prose li[data-type="taskItem"] > div > p:first-child) { margin-top:0; }
:deep(.note-prose input[type="checkbox"]) { width:14px; height:14px; accent-color:hsl(var(--primary)); cursor:pointer; }
:deep(.note-prose li[data-checked="true"] > div > p) { color:hsl(var(--muted-foreground)); text-decoration:line-through; }
:deep(.note-prose blockquote) { border-left:2px solid hsl(var(--border)); padding:.25em 0 .25em .9em; color:hsl(var(--muted-foreground)); }
:deep(.note-prose pre) { overflow:auto; border:1px solid hsl(var(--border)/.6); border-radius:8px; background:hsl(var(--muted)/.25); padding:.75em; font-size:.9em; }
:deep(.note-prose code) { border-radius:4px; background:hsl(var(--muted)/.4); padding:.1em .25em; font-family:monospace; }
:deep(.note-prose pre code) { background:none; padding:0; }
:deep(.note-prose hr) { border:0; border-top:1px solid hsl(var(--border)/.6); margin:1em 0; }
:deep(.note-prose p.is-editor-empty:first-child::before) { float:left; height:0; color:hsl(var(--muted-foreground)/.5); content:attr(data-placeholder); pointer-events:none; }
:deep(.note-prose [data-type="details"]) { display:flex; gap:.5em; border:1px solid hsl(var(--border)/.6); border-radius:8px; padding:.5em .65em; }
:deep(.note-prose [data-type="details"] > button) { width:16px; height:22px; flex-shrink:0; color:hsl(var(--muted-foreground)); }
:deep(.note-prose [data-type="details"] > button::before) { content:'›'; font-size:18px; display:block; transition:transform 150ms ease; }
:deep(.note-prose [data-type="details"].is-open > button::before) { transform:rotate(90deg); }
:deep(.note-prose [data-type="details"] > div) { flex:1; min-width:0; }
:deep(.note-prose summary) { display:block; font-weight:500; }
:deep(.note-prose summary.is-empty::before) { float:left; height:0; color:hsl(var(--muted-foreground)/.5); content:attr(data-placeholder); pointer-events:none; }
:deep(.note-prose [data-type="detailsContent"]) { margin-top:.5em; }
:deep(.note-prose .tableWrapper) { overflow-x:auto; margin:.6em 0; }
:deep(.note-prose table) { border-collapse:collapse; table-layout:fixed; width:100%; }
:deep(.note-prose th), :deep(.note-prose td) { position:relative; min-width:80px; border:1px solid hsl(var(--border)/.8); padding:.5em .6em; vertical-align:top; }
:deep(.note-prose th) { font-weight:600; background:hsl(var(--muted)/.35); }
:deep(.note-prose .selectedCell::after) { position:absolute; inset:0; z-index:1; background:hsl(var(--primary)/.08); content:''; pointer-events:none; }
:deep(.note-prose .column-resize-handle) { position:absolute; top:0; right:-2px; bottom:0; width:4px; background:hsl(var(--primary)/.4); pointer-events:none; }
:deep(.note-prose.resize-cursor) { cursor:col-resize; }
:deep(.note-image-node) { display:block; position:relative; max-width:100%; margin:.5em 0; border-radius:8px; }
:deep(.note-image-node img) { display:block; max-width:100%; height:auto; border-radius:8px; border:1px solid hsl(var(--border)/.5); }
:deep(.note-image-resize) { display:none; position:absolute; bottom:4px; right:4px; width:18px; height:18px; border:2px solid hsl(var(--background)); border-radius:5px; background:hsl(var(--primary)); cursor:nwse-resize; touch-action:none; }
:deep(.note-image-node.is-selected .note-image-resize) { display:block; }
:deep(.note-image-node.is-selected) { outline:2px solid hsl(var(--primary)/.4); outline-offset:2px; }
:deep(.note-image-status) { display:block; width:100%; min-height:48px; border:1px solid hsl(var(--border)/.6); border-radius:8px; background:hsl(var(--muted)/.2); color:hsl(var(--muted-foreground)); font-size:11px; text-align:center; padding:12px; }
:deep(.note-image-node [hidden]) { display:none; }
.editor-menu-enter-active, .editor-menu-leave-active { transition:opacity 180ms ease,transform 180ms cubic-bezier(.22,1,.36,1); }
.editor-menu-enter-from, .editor-menu-leave-to { opacity:0; transform:translateY(-4px); }
@media(prefers-reduced-motion:reduce){.editor-menu-enter-active,.editor-menu-leave-active{transition:none}}
@media(max-width:639px){.editor-tool{width:24px}.editor-tool.editor-secondary,.editor-history{display:none}.editor-menu-item.editor-mobile-only{display:flex}}
:global(:root) {
  /* Tiptap Arka Plan (Highlight) Renkleri - Açık Tema */
  --tt-color-highlight-yellow: #fef9c3;
  --tt-color-highlight-green: #dcfce7;
  --tt-color-highlight-blue: #e0f2fe;
  --tt-color-highlight-purple: #f3e8ff;
  --tt-color-highlight-red: #ffe4e6;
  --tt-color-highlight-gray: #f8f8f7;
  --tt-color-highlight-brown: #f4eeee;
  --tt-color-highlight-orange: #fbecdd;
  --tt-color-highlight-pink: #fcf1f6;

  /* Contrast renkleri eklendi */
  --tt-color-highlight-yellow-contrast: #fbe604;
  --tt-color-highlight-green-contrast: #c7fad8;
  --tt-color-highlight-blue-contrast: #ceeafd;
  --tt-color-highlight-purple-contrast: #e4ccff;
  --tt-color-highlight-red-contrast: #ffccd0;
  --tt-color-highlight-gray-contrast: #54483126;
  --tt-color-highlight-brown-contrast: #d2a28d59;
  --tt-color-highlight-orange-contrast: #e07c3945;
  --tt-color-highlight-pink-contrast: #e188b345;
  
  /* Tiptap Metin Renkleri - Açık Tema */
  --tt-color-text-gray: #6b7280;
  --tt-color-text-brown: #92400e;
  --tt-color-text-orange: #ea580c;
  --tt-color-text-yellow: #ca8a04;
  --tt-color-text-green: #16a34a;
  --tt-color-text-blue: #2563eb;
  --tt-color-text-purple: #9333ea;
  --tt-color-text-pink: #db2777;
  --tt-color-text-red: #dc2626;
}

:global(.dark) {
  /* Tiptap Arka Plan (Highlight) Renkleri - Koyu Tema */
  --tt-color-highlight-yellow: #6b6524;
  --tt-color-highlight-green: #509568;
  --tt-color-highlight-blue: #6e92aa;
  --tt-color-highlight-purple: #583e74;
  --tt-color-highlight-red: #743e42;
  --tt-color-highlight-gray: #2f2f2f;
  --tt-color-highlight-brown: #4a3228;
  --tt-color-highlight-orange: #5c3b23;
  --tt-color-highlight-pink: #4e2c3c;

  /* Contrast renkleri eklendi */
  --tt-color-highlight-yellow-contrast: #58531e;
  --tt-color-highlight-green-contrast: #47855d;
  --tt-color-highlight-blue-contrast: #5e86a1;
  --tt-color-highlight-purple-contrast: #4c3564;
  --tt-color-highlight-red-contrast: #643539;
  --tt-color-highlight-gray-contrast: #ffffff18;
  --tt-color-highlight-brown-contrast: #b8654540;
  --tt-color-highlight-orange-contrast: #e97e2533;
  --tt-color-highlight-pink-contrast: #dc4c9138;

  /* Tiptap Metin Renkleri - Koyu Tema */
  --tt-color-text-gray: #9ca3af;
  --tt-color-text-brown: #d97706;
  --tt-color-text-orange: #f97316;
  --tt-color-text-yellow: #eab308;
  --tt-color-text-green: #22c55e;
  --tt-color-text-blue: #3b82f6;
  --tt-color-text-purple: #a855f7;
  --tt-color-text-pink: #ec4899;
  --tt-color-text-red: #ef4444;
}


</style>
