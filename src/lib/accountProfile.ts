export const avatarTones = ['slate', 'indigo', 'emerald', 'amber', 'rose'] as const
export type AvatarTone = typeof avatarTones[number]
export const avatarClasses: Record<AvatarTone, string> = {
  slate: 'bg-muted text-foreground',
  indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
}
export function validAvatarTone(value: unknown): AvatarTone {
  return avatarTones.includes(value as AvatarTone) ? value as AvatarTone : 'slate'
}
export function accountName(user: { displayName?: string; email?: string } | null | undefined) {
  return user?.displayName?.trim() || user?.email?.split('@')[0] || ''
}
export function accountInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : name.trim().slice(0, 2)).toLocaleUpperCase('tr') || '?'
}
