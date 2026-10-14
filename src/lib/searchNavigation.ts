import { inject, nextTick, onActivated, onDeactivated, onMounted, onScopeDispose, watch, type InjectionKey, type Ref } from 'vue'
import type { SearchHit } from './workspaceSearch'

export interface SearchDestination extends SearchHit { sequence: number }
export const searchDestinationKey: InjectionKey<Ref<SearchDestination | null>> = Symbol('workspace-search-destination')
export const searchRevealErrorKey: InjectionKey<() => void> = Symbol('workspace-search-unavailable')

// A destination is an explicit user action. Revealing a card never clicks it,
// starts a timer, completes a task, or opens an editor.
export function useSearchReveal(module: string, prepare: (hit: SearchDestination, isCurrent: () => boolean) => Promise<unknown>) {
  const destination = inject(searchDestinationKey, null)
  if (!destination) return
  const unavailable = inject(searchRevealErrorKey, () => {})
  let handled = -1, generation = 0, alive = true
  let marked: HTMLElement | undefined
  let observer: MutationObserver | undefined, timeout: ReturnType<typeof setTimeout> | undefined
  const clear = () => { marked?.classList.remove('search-revealed');marked = undefined; observer?.disconnect();observer = undefined;clearTimeout(timeout);timeout = undefined }
  async function reveal() {
    const hit = destination!.value
    if (!alive || !hit || hit.module !== module || hit.sequence === handled) return
    handled = hit.sequence
    const request = ++generation
    clear()
    try {
      const isCurrent = () => alive && generation === request && destination!.value?.sequence === hit.sequence
      await prepare(hit, isCurrent)
      await nextTick()
      if (!alive || generation !== request || destination!.value?.sequence !== hit.sequence) return
      const locate = () => {
        const panel = document.getElementById(`workspace-panel-${module}`)
        const cards = Array.from(panel?.querySelectorAll<HTMLElement>('[data-search-record]') || [])
        const card = cards.find(el => el.dataset.searchRecord === hit.record_id && (!hit.child_id || el.dataset.searchChild === hit.child_id))
        if (!card) return false
        clear()
        card.closest('details')?.setAttribute('open', '')
        card.tabIndex = -1
        card.focus({ preventScroll: true })
        card.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
        marked = card;card.classList.add('search-revealed')
        timeout = setTimeout(clear, 1800)
        return true
      }
      if (!locate()) {
        observer = new MutationObserver(locate)
        observer.observe(document.body, { childList: true, subtree: true })
        timeout = setTimeout(() => { clear();if (isCurrent()) unavailable() }, 8000)
      }
    } catch { if (alive && generation === request && destination!.value?.sequence === hit.sequence) unavailable() }
  }
  watch(destination, () => { void reveal() }, { flush: 'post' })
  onMounted(() => { void reveal() })
  onActivated(() => { alive = true;void reveal() })
  onDeactivated(() => { alive = false;generation++;clear() })
  onScopeDispose(() => { alive = false;generation++;clear() })
}
