/** A native document scroll range drives one clipped, pinned workspace viewport. */
export function createWorkspaceScroll(stage: HTMLElement, frame: HTMLElement, navigation: HTMLElement, viewport: HTMLElement, content: HTMLElement,
  options: { headerInset?: number; onPinned?: (pinned: boolean) => void; onHeaderOffset?: (offset: number) => void } = {}) {
  let disposed = false, queued = 0, needsMeasure = false, transitioning = false, holdHeight = 0
  let maxScroll = 0, expectedScroll = 0
  let headerInset = Math.max(0, options.headerInset || 0), targetInset = headerInset
  let insetAnimation: { from: number; started: number } | undefined
  let pinned: boolean | undefined, resetAnchor = false
  let reportedInset: number | undefined
  let observedToolbar: HTMLElement | null = null
  const observer = new ResizeObserver(refresh)
  const loadingObserver = new MutationObserver(refresh)
  const px = (value: string) => parseFloat(value) || 0
  const stageTop = () => stage.getBoundingClientRect().top + window.scrollY
  const clamp = (value: number) => Math.max(0, Math.min(maxScroll, value))

  function sync() {
    if (disposed) return
    const offset = window.scrollY - stageTop() + headerInset
    const nextPinned = offset >= -.5
    if (nextPinned !== pinned) { pinned = nextPinned; options.onPinned?.(nextPinned) }
    expectedScroll = clamp(offset)
    if (Math.abs(viewport.scrollTop - expectedScroll) > .5) viewport.scrollTop = expectedScroll
  }

  function measure() {
    if (disposed) return
    const styles = getComputedStyle(frame)
    const chrome = px(styles.paddingTop) + px(styles.paddingBottom) + px(styles.borderTopWidth) + px(styles.borderBottomWidth)
      + navigation.offsetHeight + px(styles.rowGap)
    const contentHeight = content.offsetHeight
    const naturalHeight = Math.ceil(chrome + contentHeight)
    const screenHeight = Math.max(1, window.innerHeight - headerInset)
    if (!transitioning && !content.querySelector('[data-module-loading="true"]')) holdHeight = 0
    const stageHeight = Math.max(naturalHeight, holdHeight)
    const frameHeight = Math.min(stageHeight, screenHeight)
    const viewHeight = Math.max(0, frameHeight - chrome)
    maxScroll = Math.max(0, contentHeight - viewHeight)
    // Identical values do not invalidate layout on every observer callback.
    if (stage.style.height !== `${stageHeight}px`) stage.style.height = `${stageHeight}px`
    if (frame.style.height !== `${frameHeight}px`) frame.style.height = `${frameHeight}px`
    if (frame.style.top !== `${headerInset}px`) frame.style.top = `${headerInset}px`
    if (reportedInset !== headerInset) { reportedInset = headerInset; options.onHeaderOffset?.(headerInset) }
    const toolbar = content.querySelector<HTMLElement>('.workspace-toolbar')
    if (toolbar !== observedToolbar) {
      if (observedToolbar) observer.unobserve(observedToolbar)
      observedToolbar = toolbar
      if (toolbar) observer.observe(toolbar)
    }
    frame.toggleAttribute('data-long-toolbar', !!toolbar && toolbar.offsetHeight > Math.max(120, viewHeight - 120))
    sync()
  }

  function flush() {
    queued = 0
    if (insetAnimation) {
      const progress = Math.min(1, (Date.now() - insetAnimation.started) / 240)
      headerInset = insetAnimation.from + (targetInset - insetAnimation.from) * (1 - Math.pow(1 - progress, 3))
      if (progress >= 1) { headerInset = targetInset; insetAnimation = undefined }
      needsMeasure = true
    }
    if (needsMeasure) { needsMeasure = false; measure() } else sync()
    if (insetAnimation) schedule()
  }
  function schedule() { if (!disposed && !queued) queued = requestAnimationFrame(flush) }
  function refresh() { needsMeasure = true; schedule() }

  // Focus, browser find and editor selection may scroll a hidden overflow box.
  // Reflect those native changes in the document instead of keeping two positions.
  function reflectViewportScroll() {
    if (disposed || needsMeasure || Math.abs(viewport.scrollTop - expectedScroll) <= 1) return
    expectedScroll = clamp(viewport.scrollTop)
    window.scrollTo({ top: Math.max(0, stageTop() - headerInset + expectedScroll), behavior: 'instant' })
  }

  function reset() {
    if (disposed) return
    const top = Math.max(0, stageTop() - headerInset)
    transitioning = true
    resetAnchor = window.scrollY >= top
    if (resetAnchor) {
      holdHeight = Math.min(window.innerHeight - headerInset, frame.offsetHeight)
      window.scrollTo({ top, behavior: 'instant' })
    }
    expectedScroll = 0
    viewport.scrollTop = 0
    refresh()
  }

  function settle() { transitioning = false; resetAnchor = false; refresh() }

  function setHeaderInset(value: number) {
    const next = Math.max(0, Math.min(window.innerHeight - 1, value || 0))
    if (disposed || next === targetInset) return
    targetInset = next
    if (transitioning && resetAnchor || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      headerInset = next; insetAnimation = undefined
      if (resetAnchor) window.scrollTo({ top: Math.max(0, stageTop() - headerInset), behavior: 'instant' })
    } else insetAnimation = { from: headerInset, started: Date.now() }
    refresh()
  }

  function reveal(element: HTMLElement, behavior: ScrollBehavior) {
    if (disposed) return
    measure()
    const toolbar = content.querySelector<HTMLElement>('.workspace-toolbar')
    const toolsHeight = frame.hasAttribute('data-long-toolbar') ? 0 : toolbar?.offsetHeight || 0
    const view = viewport.getBoundingClientRect(), item = element.getBoundingClientRect()
    const offset = toolbar?.contains(element) ? 0
      : viewport.scrollTop + item.top - view.top - toolsHeight - Math.max(0, (viewport.clientHeight - toolsHeight - item.height) / 2)
    window.scrollTo({ top: Math.max(0, stageTop() - headerInset + clamp(offset)), behavior })
  }

  function ancestorTransition(event: Event) {
    const target = event.target as HTMLElement | null
    if (target?.contains(stage) || target?.matches('.pomodoro-host')) refresh()
  }

  loadingObserver.observe(content, { attributes: true, subtree: true, attributeFilter: ['data-module-loading'] })
  observer.observe(navigation)
  observer.observe(content)
  observer.observe(viewport)
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', refresh, { passive: true })
  viewport.addEventListener('scroll', reflectViewportScroll, { passive: true })
  document.addEventListener('transitionend', ancestorTransition, true)
  measure()

  return {
    refresh, reset, settle, reveal, setHeaderInset,
    dispose() {
      disposed = true
      if (queued) cancelAnimationFrame(queued)
      observer.disconnect()
      loadingObserver.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', refresh)
      viewport.removeEventListener('scroll', reflectViewportScroll)
      document.removeEventListener('transitionend', ancestorTransition, true)
      options.onPinned?.(false)
    },
  }
}
