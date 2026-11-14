import type {HLJSApi,LanguageFn} from 'highlight.js'
export function escapeCode(code:string){return code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
export function createLazyHighlighter(engine:Pick<HLJSApi,'getLanguage'|'registerLanguage'|'highlight'>,loaders:Record<string,()=>Promise<LanguageFn>>){
 const pending=new Map<string,Promise<void>>()
 return async(code:string,language:string)=>{
  if(!code)return ''
  if(language==='plaintext')return escapeCode(code)
  try{
   if(!engine.getLanguage(language)){
    if(!loaders[language])return escapeCode(code)
    if(!pending.has(language))pending.set(language,loaders[language]().then(grammar=>{engine.registerLanguage(language,grammar)}).finally(()=>{pending.delete(language)}))
    await pending.get(language)
   }
   return engine.highlight(code,{language,ignoreIllegals:true}).value
  }catch{return escapeCode(code)}
 }
}
