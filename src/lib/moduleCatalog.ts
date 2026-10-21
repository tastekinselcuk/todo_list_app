// One ordered client registry. SQL compatibility is verified separately in integration tests.
export const moduleCatalog = [
  { id:'plans', icon:'ListTodo', required:false, tables:{plans:'user_id'}, theme:{border:'border-stone-400/30',accent:'bg-stone-500',icon:'bg-stone-500/[0.15] text-stone-500'} },
  { id:'tasks', icon:'CalendarDays', required:false, tables:{work_tasks:'user_id',work_projects:'user_id',work_blocks:'user_id'}, theme:{border:'border-sky-500/30',accent:'bg-sky-500',icon:'bg-sky-500/[0.15] text-sky-500'} },
  { id:'detailed', icon:'CheckSquare', required:true, tables:{categories:'created_by',todos:'created_by'}, theme:{border:'border-blue-500/30',accent:'bg-blue-500',icon:'bg-blue-500/[0.15] text-blue-500'} },
  { id:'quick', icon:'Zap', required:false, tables:{quick_notes:'created_by'}, theme:{border:'border-amber-500/30',accent:'bg-amber-500',icon:'bg-amber-500/[0.15] text-amber-500'} },
  { id:'secure', icon:'ShieldCheck', required:false, tables:{password_sessions:'created_by',secure_notes:'created_by'}, theme:{border:'border-emerald-500/30',accent:'bg-emerald-500',icon:'bg-emerald-500/[0.15] text-emerald-500'} },
  { id:'code', icon:'Code2', required:false, tables:{code_snippets:'created_by'}, theme:{border:'border-violet-500/30',accent:'bg-violet-500',icon:'bg-violet-500/[0.15] text-violet-500'} },
  { id:'pomodoro', icon:'Timer', required:false, tables:{pomo_tasks:'created_by'}, theme:{border:'border-rose-500/30',accent:'bg-rose-500',icon:'bg-rose-500/[0.15] text-rose-500'} },
  { id:'learning', icon:'Target', required:false, tables:{learning_subjects:'user_id'}, theme:{border:'border-indigo-500/30',accent:'bg-indigo-500',icon:'bg-indigo-500/[0.15] text-indigo-500'} },
  { id:'flashcards', icon:'Layers', required:false, tables:{flashcard_decks:'user_id'}, theme:{border:'border-orange-500/30',accent:'bg-orange-500',icon:'bg-orange-500/[0.15] text-orange-500'} },
  { id:'workout', icon:'Dumbbell', required:false, tables:{workout_routines:'user_id'}, theme:{border:'border-teal-500/30',accent:'bg-teal-500',icon:'bg-teal-500/[0.15] text-teal-500'} },
  { id:'periodic', icon:'Repeat', required:false, tables:{periodic_tasks:'user_id'}, theme:{border:'border-pink-500/30',accent:'bg-pink-500',icon:'bg-pink-500/[0.15] text-pink-500'} },
  { id:'activities', icon:'Clapperboard', required:false, tables:{activity_items:'user_id'}, theme:{border:'border-cyan-500/30',accent:'bg-cyan-500',icon:'bg-cyan-500/[0.15] text-cyan-500'} },
  { id:'finance', icon:'Wallet', required:false, tables:{finance_transactions:'user_id',finance_positions:'user_id'}, theme:{border:'border-lime-500/30',accent:'bg-lime-500',icon:'bg-lime-500/[0.15] text-lime-600 dark:text-lime-400'} },
] as const
export type ModuleId = typeof moduleCatalog[number]['id']
export const moduleTableOwners: Record<string,string> = Object.fromEntries(moduleCatalog.flatMap(module => Object.entries(module.tables)))
export const moduleTables: Record<string,ModuleId> = Object.fromEntries(moduleCatalog.flatMap(module => Object.keys(module.tables).map(table => [table,module.id])))
