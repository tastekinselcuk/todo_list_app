import { mergeAttributes, type Extensions } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import StarterKit from '@tiptap/starter-kit'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import Image from '@tiptap/extension-image'
import { TextStyle, Color, BackgroundColor } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import { Placeholder } from '@tiptap/extensions'
import { safeNoteImageUrl, safeNoteLink, validNoteImageReference } from './noteContent'

interface NoteEditorOptions { placeholder?:string;togglePlaceholder?:string;resolveImage?:(path:string,force?:boolean)=>Promise<string>;imageError?:string;imageLoading?:string;toggleLabel?:(open:boolean)=>string;taskLabel?:(text:string)=>string;openLinks?:boolean;resizeLabel?:string;previewLabel?:string;onImagePreview?:(src:string,alt:string)=>void }
export function createNoteExtensions(options:NoteEditorOptions={}):Extensions {
 const NoteImage=Image.extend({
  addAttributes(){return {
   ...this.parent?.(),
   storagePath:{default:null,parseHTML:element=>element.getAttribute('data-note-image'),renderHTML:attrs=>attrs.storagePath?{'data-note-image':attrs.storagePath}:{}},
   src:{default:null,parseHTML:element=>safeNoteImageUrl(element.getAttribute('src') || ''),renderHTML:attrs=>attrs.storagePath?{}:attrs.src?{src:attrs.src}:{}},
   displayWidth:{default:100,parseHTML:element=>Number(element.getAttribute('data-width') || 100),renderHTML:attrs=>attrs.displayWidth!==100?{'data-width':attrs.displayWidth}:{}},
  }},
  parseHTML(){return [
   {tag:'img[data-note-image]',getAttrs:element=>validNoteImageReference((element as HTMLElement).getAttribute('data-note-image') || '')?null:false},
   {tag:'img[src]',getAttrs:element=>safeNoteImageUrl((element as HTMLElement).getAttribute('src') || '')?null:false},
  ]},
  renderHTML({HTMLAttributes}){return ['img',mergeAttributes(this.options.HTMLAttributes,HTMLAttributes)]},
  addNodeView(){return ({node,editor,getPos})=>{
   const dom=document.createElement('span'),image=document.createElement('img'),message=document.createElement('button'),resize=document.createElement('button')
   dom.className='note-image-node';dom.contentEditable='false';image.draggable=false;image.loading='eager';image.referrerPolicy='no-referrer'
   message.type='button';message.className='note-image-status';message.textContent=options.imageLoading || '…';message.disabled=true
   resize.type='button';resize.className='note-image-resize';resize.setAttribute('role','slider');resize.setAttribute('aria-label',options.resizeLabel || 'Resize image');resize.setAttribute('aria-valuemin','25');resize.setAttribute('aria-valuemax','100')
   dom.append(image,message,resize)
   let current=node,disposed=false,generation=0,lastSource:string|null=null
   let stopResize:(()=>void)|undefined
   let loadTimer:ReturnType<typeof setTimeout>|undefined
   const clearLoadTimer=()=>{if(loadTimer){clearTimeout(loadTimer);loadTimer=undefined}}
   const load=async(force=false)=>{
    clearLoadTimer()
    const request=++generation;image.hidden=true;message.hidden=false;message.disabled=true;message.textContent=options.imageLoading || '…'
    const fail=()=>{
     if(disposed || request!==generation)return
     clearLoadTimer();image.hidden=true;message.hidden=false;message.disabled=false;message.textContent=options.imageError || 'Image unavailable'
    }
    loadTimer=setTimeout(fail,15_000)
    try{
     const src=current.attrs.storagePath?await options.resolveImage?.(current.attrs.storagePath,force):safeNoteImageUrl(current.attrs.src || '')
     if(disposed || request!==generation)return
     if(!src)throw Error('imageUnavailable')
     image.onload=()=>{if(!disposed && request===generation){clearLoadTimer();image.hidden=false;message.hidden=true}}
     image.onerror=fail
     image.removeAttribute('src');image.src=src
     if(image.complete && image.naturalWidth>0){clearLoadTimer();image.hidden=false;message.hidden=true}
    }catch{fail()}
   }
   const render=()=>{
    image.alt=current.attrs.alt || '';image.title=current.attrs.title || ''
    if(!editor.isEditable && options.onImagePreview){image.tabIndex=0;image.setAttribute('role','button');image.setAttribute('aria-label',options.previewLabel || 'Enlarge image')}else{image.removeAttribute('tabindex');image.removeAttribute('role');image.removeAttribute('aria-label')}
    const width=Math.max(25,Math.min(100,Number(current.attrs.displayWidth) || 100))
    dom.style.width=width+'%';resize.setAttribute('aria-valuenow',String(width));resize.hidden=!editor.isEditable
    const source=current.attrs.storagePath || current.attrs.src || ''
    if(source!==lastSource){lastSource=source;void load()}
   }
   const commitWidth=(width:number)=>{
    const position=getPos()
    if(disposed || !editor.isEditable || typeof position!=='number')return
    const found=editor.state.doc.nodeAt(position)
    if(found?.type!==current.type || found.attrs.src!==current.attrs.src || found.attrs.storagePath!==current.attrs.storagePath)return
    editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(position,undefined,{...found.attrs,displayWidth:width}))
   }
   resize.onpointerdown=event=>{
    if(!editor.isEditable || disposed)return
    event.preventDefault();event.stopPropagation();stopResize?.()
    const position=getPos()
    if(typeof position!=='number')return
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc,position)))
    const parentWidth=dom.parentElement?.getBoundingClientRect().width || dom.getBoundingClientRect().width
    if(!parentWidth)return
    const start=event.clientX,initial=Number(current.attrs.displayWidth) || 100,pointer=event.pointerId
    let width=initial
    const move=(next:PointerEvent)=>{
     if(next.pointerId!==pointer)return
     width=Math.max(25,Math.min(100,Math.round(initial+(next.clientX-start)/parentWidth*100)))
     dom.style.width=width+'%';resize.setAttribute('aria-valuenow',String(width))
    }
    const cleanup=()=>{
     document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',finish,true);document.removeEventListener('pointercancel',cancel,true)
     stopResize=undefined
    }
    const finish=(next:PointerEvent)=>{if(next.pointerId!==pointer)return;move(next);cleanup();commitWidth(width);render()}
    const cancel=()=>{cleanup();render()}
    stopResize=cancel
    document.addEventListener('pointermove',move,true);document.addEventListener('pointerup',finish,true);document.addEventListener('pointercancel',cancel,true)
   }
   resize.onkeydown=event=>{
    if(!editor.isEditable || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
    event.preventDefault();event.stopPropagation()
    const width=Number(current.attrs.displayWidth) || 100
    commitWidth(event.key==='Home'?25:event.key==='End'?100:Math.max(25,Math.min(100,width+(event.key==='ArrowLeft'?-5:5))))
   }
   const preview=()=>{
    if(editor.isEditable || image.hidden || !image.naturalWidth)return false
    options.onImagePreview?.(image.currentSrc || image.src,image.alt)
    return true
   }
   image.onclick=event=>{if(preview()){event.preventDefault();event.stopPropagation()}}
   image.onkeydown=event=>{if(['Enter',' '].includes(event.key) && preview()){event.preventDefault();event.stopPropagation()}}
   message.onclick=()=>void load(true);render()
   return {dom,update(next){if(next.type!==current.type)return false;current=next;render();return true},selectNode(){dom.classList.add('is-selected')},deselectNode(){dom.classList.remove('is-selected')},stopEvent:event=>event.target===message || event.target===resize || (!editor.isEditable && event.target===image),ignoreMutation:()=>true,destroy(){disposed=true;generation++;clearLoadTimer();stopResize?.();resize.onpointerdown=null;resize.onkeydown=null;image.onload=null;image.onerror=null;image.onclick=null;image.onkeydown=null;message.onclick=null;image.removeAttribute('src')}}
  }},
 }).configure({inline:true,allowBase64:true})
 return [
  StarterKit.configure({heading:{levels:[1,2,3]},link:{openOnClick:options.openLinks || false,HTMLAttributes:{rel:'noopener noreferrer nofollow',target:'_blank'},isAllowedUri:url=>Boolean(safeNoteLink(url))}}),
  TaskList,TaskItem.configure({HTMLAttributes:{'data-type':'taskItem'},nested:true,onReadOnlyChecked:()=>false,a11y:{checkboxLabel:node=>options.taskLabel?.(node.textContent) || node.textContent || 'Task'}}),
  TableKit.configure({table:{resizable:true,renderWrapper:true,cellMinWidth:80}}),
  Details.configure({persist:false,renderToggleButton:({element,isOpen})=>{element.setAttribute('aria-label',options.toggleLabel?.(isOpen) || (isOpen?'Collapse':'Expand'))}}),DetailsSummary,DetailsContent,
  TextStyle,Color,BackgroundColor,Highlight.configure({multicolor:true}),NoteImage,
  Placeholder.configure({placeholder:({node})=>node.type.name==='detailsSummary'?(options.togglePlaceholder || 'Toggle heading'):(options.placeholder || ''),showOnlyCurrent:false}),
 ]
}
