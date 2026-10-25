import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Native dblclick timing avoids treating two unrelated clicks as dismissal. */
export function isDialogBackdropDoubleClick(event: MouseEvent) {
  const dialog = event.currentTarget as HTMLDialogElement | null
  if (event.type !== 'dblclick' || event.detail !== 2 || event.button !== 0 || event.target !== dialog || !dialog?.open) return false
  const rect = dialog.getBoundingClientRect()
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
}
