export interface NavigationScrollState {
  visible: boolean
  position: number
  direction: -1 | 0 | 1
  distance: number
}

export function createNavigationScrollState(position = 0): NavigationScrollState {
  return { visible: true, position: Math.max(0, position), direction: 0, distance: 0 }
}

export function updateNavigationScroll(state: NavigationScrollState, position: number, focused = false, distances = { reveal: 8, hide: 24 }) {
  const next = Math.max(0, position)
  const delta = next - state.position
  state.position = next
  if (next <= 48 || focused) {
    state.visible = true
    state.direction = 0
    state.distance = 0
    return state.visible
  }
  if (!delta) return state.visible
  const direction = delta > 0 ? 1 : -1
  state.distance = state.direction === direction ? state.distance + Math.abs(delta) : Math.abs(delta)
  state.direction = direction
  if (direction === -1 && state.distance >= distances.reveal) state.visible = true
  if (direction === 1 && state.distance >= distances.hide) state.visible = false
  return state.visible
}
