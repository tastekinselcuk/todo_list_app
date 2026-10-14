import DOMPurify from 'dompurify'

export function sanitizeNoteHtml(html: string) {
  const fragment=DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style','form','input','button','video','audio','iframe'], ADD_ATTR:['colwidth'], RETURN_DOM_FRAGMENT:true })
  for(const element of fragment.querySelectorAll('*')){
    for(const attribute of [...element.attributes]){
      const name=attribute.name
      if(name==='class' && !(element.tagName==='CODE' && /^language-[\w#+-]+$/.test(attribute.value)))element.removeAttribute(name)
      if(name.startsWith('data-') && !['data-type','data-checked','data-note-image','data-color','data-width'].includes(name))element.removeAttribute(name)
    }
    const style=(element as HTMLElement).style
    if(style){
      const color=style.color,background=style.backgroundColor,align=style.textAlign
      element.removeAttribute('style')
      if(safeNoteColor(color))style.color=color
      if(safeNoteColor(background))style.backgroundColor=background
      if(['left','right','center','justify','start','end'].includes(align))style.textAlign=align
      if(!element.getAttribute('style'))element.removeAttribute('style')
    }
    if(element.tagName==='A'){
      const href=safeNoteLink(element.getAttribute('href') || '')
      if(href){element.setAttribute('href',href);element.setAttribute('target','_blank');element.setAttribute('rel','noopener noreferrer nofollow')}
      else element.removeAttribute('href')
    }
    if(element.tagName==='IMG'){
      const path=element.getAttribute('data-note-image')
      if(path && validNoteImageReference(path))element.removeAttribute('src')
      else{
        element.removeAttribute('data-note-image')
        const src=element.getAttribute('src') || ''
        if(!safeNoteImageUrl(src))element.removeAttribute('src')
      }
    }
    for(const attribute of ['colspan','rowspan']){
      if(element.hasAttribute(attribute) && (!/^\d+$/.test(element.getAttribute(attribute)!) || Number(element.getAttribute(attribute))>100))element.removeAttribute(attribute)
    }
    if(element.hasAttribute('colwidth') && !/^\d{1,4}(?:,\d{1,4}){0,99}$/.test(element.getAttribute('colwidth')!))element.removeAttribute('colwidth')
    if(element.hasAttribute('data-width') && (!/^\d{2,3}$/.test(element.getAttribute('data-width')!) || Number(element.getAttribute('data-width'))<25 || Number(element.getAttribute('data-width'))>100))element.removeAttribute('data-width')
  }
  const container=fragment.ownerDocument.createElement('div');container.append(fragment)
  return container.innerHTML
}

export function safeNoteColor(color:string){return /^(?:#[\da-f]{3,8}|[a-z]{1,24}|(?:rgba?|hsla?)\([\d.%+,\s/-]+\)|var\(--tt-color-(?:text|highlight)-[a-z]+(?:-contrast)?\))$/i.test(color)}
export function safeNoteLink(value:string){
  try{const url=new URL(value.trim());return ['http:','https:','mailto:'].includes(url.protocol) && !url.username && !url.password?url.href:null}catch{return null}
}
export function safeNoteImageUrl(value:string){
  if(/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z\d+/=\s]+$/i.test(value))return value
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol) && !url.username && !url.password?url.href:null}catch{return null}
}
export function validNoteImageReference(value:string){return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.(?:webp|png|jpe?g|gif)$/i.test(value)}
