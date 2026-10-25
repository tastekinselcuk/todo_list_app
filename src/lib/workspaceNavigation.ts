import type { InjectionKey, Ref } from 'vue'
import type { SearchHit } from './workspaceSearch'

// An explicit navigation command may choose a module's existing view.
// Merely hovering a section never creates an intent or changes open content.
export interface WorkspaceNavigationIntent { module:string; view:string; sequence:number }
export const workspaceNavigationKey:InjectionKey<Ref<WorkspaceNavigationIntent|null>>=Symbol('workspace-navigation')
export const workspaceActiveViewKey:InjectionKey<(module:string,view:string)=>void>=Symbol('workspace-active-view')
export const workspaceOpenItemKey:InjectionKey<(hit:SearchHit)=>void>=Symbol('workspace-open-item')
