import { moduleCatalog, moduleTables, type ModuleId } from './moduleCatalog'
export const shareableModules = moduleCatalog.filter(module => module.id !== 'finance').map(module => module.id)
export type ShareableModule = Exclude<ModuleId, 'finance'>
export type InviteRole = 'viewer' | 'editor'
export const tableModules = moduleTables
export interface ModuleBinding {
  module: ShareableModule
  collection_id: string
  personal_collection_id: string
  origin_workspace_id: string
  owner_id: string
  role: 'owner' | 'editor' | 'viewer'
  shared: boolean
  epoch: number
  name: string
  members: number
  active_modules?: string[]
  timezone?: string
  permissions_ready?: boolean
}
export function parseInviteLink(value: string, origin: string): string {
  try {
    const url = new URL(value.trim())
    if (url.origin !== origin || url.pathname !== '/') return ''
    const params = new URLSearchParams(url.hash.slice(1))
    const token = params.get('invite') || ''
    return /^[a-f0-9]{64}$/.test(token) ? token : ''
  } catch { return '' }
}
export function inviteLink(token: string, origin: string) { return `${origin}/#invite=${token}` }
export function sharingErrorCode(error: { message?: string; code?: string } | null | undefined): string {
  if (error?.code === 'PGRST202' || error?.code === '42883') return 'SETUP_REQUIRED'
  const known = ['SETUP_REQUIRED','SETUP_ROLE_REQUIRED','INVITE_INVALID','INVITE_REVOKED','INVITE_EXPIRED','INVITE_USED','ALREADY_SHARED','ALREADY_MEMBER','INVALID_ROLE','READ_ONLY','OWNER_REQUIRED','AUTH_REQUIRED','WORKSPACE_ACCESS_DENIED','SHARING_CONFLICT','VAULT_UPGRADE_REQUIRED','MODULE_NOT_SHAREABLE']
  return known.find(code => error?.message?.includes(code) || error?.code === code) || 'SAVE_FAILED'
}
