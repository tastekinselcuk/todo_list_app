import { supabase } from './supabase'
import { useWorkspacesStore } from '@/stores/workspaces'
import { useAuthStore } from '@/stores/auth'
import { checkAndFireReminders } from '@/features/PeriodicTasks/lib/reminders'
import type { PeriodicTask } from '@/features/PeriodicTasks/stores/periodicTasks'

// Browser/email reminders run across active workspaces while the app is open.
export function startWorkspaceReminders(t: (key: string, params?: Record<string, string>) => string) {
  const workspaces = useWorkspacesStore()
  const auth = useAuthStore()
  let stopped = false
  let running = false
  async function check() {
    if (stopped || running || !auth.user || !workspaces.loaded) return
    const owner = auth.user.id
    const email = auth.user.email
    const candidates = workspaces.available.filter(item => item.active_modules.includes('periodic'))
    if (!candidates.length) return
    running = true
    try {
      const shared = workspaces.sharingAvailable && Boolean(workspaces.binding('periodic'))
      const result = shared ? await supabase.rpc('personal_workspace_reminders') : await supabase.from('periodic_tasks').select('*')
        .eq('user_id', owner).in('workspace_id', candidates.map(item => item.id))
      if (result.error || stopped || auth.user?.id !== owner) return
      for (const workspace of candidates) {
        await checkAndFireReminders({
          tasks: (result.data || []).filter((task: PeriodicTask) => task.workspace_id === workspace.id) as PeriodicTask[],
          userEmail: email, workspaceName: workspace.name, t,
          isCurrent: () => !stopped && auth.user?.id === owner && workspaces.available.some(item => item.id === workspace.id),
          onNotified: async id => {
            if (stopped || auth.user?.id !== owner) return
            if (shared) { await supabase.rpc('mark_member_reminder', { task_id: id }); return }
            await supabase.from('periodic_tasks').update({ last_notified_at: new Date().toISOString() })
              .eq('id', id).eq('user_id', owner).eq('workspace_id', workspace.id)
          },
        })
      }
    } finally { running = false }
  }
  const timer = setInterval(() => { void check().catch(() => {}) }, 30_000)
  void check().catch(() => {})
  return () => { stopped = true; clearInterval(timer) }
}
