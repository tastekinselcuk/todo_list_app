import { moduleCatalog, type ModuleId } from './moduleCatalog'

export type WorkspaceSectionId = 'notes' | 'planning' | 'learning' | 'life' | 'finance'

export const workspaceSections = [
  { id: 'notes', icon: 'NotebookPen', modules: ['plans', 'detailed', 'quick', 'secure', 'code', 'pomodoro'] },
  { id: 'planning', icon: 'CalendarDays', modules: ['tasks', 'periodic'] },
  { id: 'learning', icon: 'BookOpen', modules: ['learning', 'flashcards'] },
  { id: 'life', icon: 'Heart', modules: ['workout', 'activities'] },
  { id: 'finance', icon: 'Wallet', modules: ['finance'] },
] as const satisfies readonly { id: WorkspaceSectionId; icon: string; modules: readonly ModuleId[] }[]

export interface WorkspaceSection {
  id: WorkspaceSectionId
  icon: string
  modules: ModuleId[]
}

/** The registry owns order; the section definitions only assign a home to each module. */
export function getWorkspaceSections(enabled: readonly string[]): WorkspaceSection[] {
  const available = new Set(enabled)
  return workspaceSections.map(section => ({
    id: section.id,
    icon: section.icon,
    modules: moduleCatalog.filter(module => available.has(module.id) && (section.modules as readonly string[]).includes(module.id)).map(module => module.id),
  })).filter(section => section.modules.length > 0)
}

export function workspaceSectionFor(moduleId: string): WorkspaceSectionId | undefined {
  return workspaceSections.find(section => (section.modules as readonly string[]).includes(moduleId))?.id
}

export function chooseWorkspaceSectionModule(section: WorkspaceSection, remembered?: string): ModuleId | undefined {
  if (remembered && section.modules.includes(remembered as ModuleId)) return remembered as ModuleId
  if (section.id === 'planning' && section.modules.includes('tasks')) return 'tasks'
  return section.modules[0]
}

export interface WorkspaceModuleOption {value:string;module:ModuleId;view?:string;label:string;icon:string}
/** The content picker contains only the active section's enabled modules and their existing views. */
export function getWorkspaceModuleOptions(enabled:readonly string[],activeModule:string):WorkspaceModuleOption[] {
  const section=getWorkspaceSections(enabled).find(item=>item.id===workspaceSectionFor(activeModule))
  if(!section)return []
  const views:Partial<Record<ModuleId,{view:string;label:string;icon:string}[]>>={
    learning:[{view:'topics',label:'study.views.topics',icon:'BookOpen'},{view:'today',label:'study.views.today',icon:'CalendarDays'},{view:'mistakes',label:'study.views.mistakes',icon:'NotebookPen'}],
    finance:[{view:'transaction',label:'finance.cashflow',icon:'ArrowLeftRight'},{view:'position',label:'finance.positions',icon:'TrendingUp'}],
  }
  return section.modules.flatMap((module):WorkspaceModuleOption[]=>{
    if(views[module])return views[module]!.map(view=>({value:`${module}:${view.view}`,module,...view}))
    return [{value:module,module,label:module==='tasks'?'tasks.calendar':module==='pomodoro'?'pomoNotes.tab':`workspace.modules.${module}Name`,icon:moduleCatalog.find(item=>item.id===module)!.icon}]
  })
}
