import type { InjectionKey, Ref } from 'vue'

// An explicit navigation command may choose a module's existing view.
// Merely hovering a section never creates an intent or changes open content.
export interface WorkspaceNavigationIntent { module:string; view:string; sequence:number }
export const workspaceNavigationKey:InjectionKey<Ref<WorkspaceNavigationIntent|null>>=Symbol('workspace-navigation')
