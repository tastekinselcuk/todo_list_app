import { moduleCatalog } from './moduleCatalog'
export const defaultModules: string[] = moduleCatalog.filter(module=>module.id!=='quick').map(module => module.id)
