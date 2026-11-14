import hljs from 'highlight.js/lib/core'
import type {LanguageFn} from 'highlight.js'
import {createLazyHighlighter} from './lazyHighlighter'
const modules=import.meta.glob<LanguageFn>(['/node_modules/highlight.js/es/languages/*.js','!/node_modules/highlight.js/es/languages/*.js.js'],{import:'default'})
const loaders:Record<string,()=>Promise<LanguageFn>>={}
for(const [path,load] of Object.entries(modules)){
 const name=path.split('/').pop()!.slice(0,-3)
 if(!name.endsWith('.js'))loaders[name]=load
}
export const codeLanguages=[...new Set(['plaintext',...Object.keys(loaders)])].sort((a,b)=>a.localeCompare(b))
export const highlightCode=createLazyHighlighter(hljs,loaders)
