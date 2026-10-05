const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { ref, effectScope } = require('vue')
const moduleExports = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/ui/useTabStrip.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: moduleExports, require })

function fixture(values = [45, 92, 80, 95, 105, 115, 85, 130, 155, 65], width = 1100, isDesktop = true, active = 0) {
  const labels = ref(values)
  const available = ref(width)
  const desktop = ref(isDesktop)
  const selected = ref(active)
  const scope = effectScope()
  const strip = scope.run(() => moduleExports.useTabStrip(labels, available, desktop, selected))
  return { labels, available, desktop, selected, strip, stop: () => scope.stop() }
}
test('desktop preserves natural widths with exactly seven visible tabs', () => {
  const { strip, selected, stop } = fixture()
  assert.equal(strip.layout.value.count, 7)
  assert.equal(strip.layout.value.padding, 20)
  assert.equal(strip.layout.value.gap, 4)
  assert.equal(strip.canGoLeft.value, false)
  strip.move(1)
  assert.equal(strip.first.value, 1)
  assert.equal(strip.offset.value, 45 + 40 + 4)
  strip.move(1)
  assert.equal(strip.offset.value, 45 + 92 + 80 + 8)
  assert.equal(selected.value, 0)
  strip.move(1)
  assert.equal(strip.first.value, 3)
  assert.equal(strip.canGoRight.value, false)
  strip.move(1)
  assert.equal(strip.first.value, 3)
  strip.move(-1)
  assert.equal(strip.first.value, 2)
  strip.move(-1)
  strip.move(-1)
  strip.move(-1)
  assert.equal(strip.first.value, 0)
  assert.equal(strip.canGoLeft.value, false)
  stop()
})
test('spacing uses the widest seven-tab window so navigating does not change button widths', () => {
  const { strip, stop } = fixture(undefined, 1060)
  const padding = strip.layout.value.padding
  const gap = strip.layout.value.gap
  assert.ok(gap < 4)
  assert.equal(padding, 20)
  for (let position = 0; position <= 3; position++) {
    assert.equal(strip.layout.value.count, 7)
    assert.ok(strip.visibleWidth.value <= 1060 + .01)
    assert.equal(strip.layout.value.padding, padding)
    assert.equal(strip.layout.value.gap, gap)
    strip.move(1)
  }
  stop()
})
test('a tighter desktop reduces empty button padding after reducing gaps, preserving text sizes and seven tabs', () => {
  const { strip, stop } = fixture(undefined, 860)
  assert.equal(strip.layout.value.count, 7)
  assert.equal(strip.layout.value.gap, 0)
  assert.ok(strip.layout.value.padding < 20)
  for (let position = 0; position <= 3; position++) {
    assert.ok(strip.visibleWidth.value <= 860 + .01)
    strip.move(1)
  }
  stop()
})
test('seven or fewer enabled tabs have no desktop arrows', () => {
  for (const count of [0, 1, 5, 7]) {
    const { strip, stop } = fixture(Array(count).fill(70))
    assert.equal(strip.layout.value.count, count)
    assert.equal(strip.canGoLeft.value, false)
    assert.equal(strip.canGoRight.value, false)
    stop()
  }
})
test('mobile fits fewer whole tabs while preserving original button padding', () => {
  const { strip, selected, stop } = fixture([40, 60, 75, 55, 65], 250, false)
  assert.equal(strip.layout.value.count, 2)
  assert.equal(strip.layout.value.padding, 20)
  assert.equal(strip.layout.value.gap, 4)
  assert.equal(strip.visibleWidth.value, 184)
  strip.move(1)
  assert.equal(strip.first.value, 1)
  assert.equal(strip.offset.value, 84)
  assert.equal(strip.visibleWidth.value, 219)
  assert.equal(selected.value, 0)
  stop()
})
test('responsive changes and disabled modules clamp navigation without changing selection', () => {
  const { strip, labels, available, desktop, selected, stop } = fixture(Array(10).fill(70), 250, false, 9)
  assert.equal(strip.first.value, 8)
  available.value = 960
  desktop.value = true
  assert.equal(strip.layout.value.count, 7)
  assert.equal(strip.first.value, 3)
  assert.equal(selected.value, 9)
  labels.value = Array(5).fill(70)
  selected.value = 4
  assert.equal(strip.first.value, 0)
  assert.equal(strip.canGoRight.value, false)
  labels.value = []
  selected.value = -1
  assert.equal(strip.first.value, 0)
  stop()
})
test('right navigation selects the next tab when the active leftmost tab leaves the window', () => {
  for (const desktop of [true, false]) {
    const { strip, selected, stop } = fixture(undefined, desktop ? 1100 : 250, desktop)
    const nextSelection = strip.move(1)
    assert.equal(nextSelection, 1)
    selected.value = nextSelection
    assert.equal(strip.first.value, 1, 'updating selection must preserve the new visible window')
    assert.equal(selected.value, 1)
    selected.value = strip.move(1)
    assert.equal(strip.first.value, 2)
    assert.equal(selected.value, 2)
    stop()
  }
})
test('navigation preserves selection when it is not the departing tab or there is no further movement', () => {
  const { strip, selected, stop } = fixture(undefined, 1100, true, 3)
  assert.equal(strip.move(1), undefined)
  assert.equal(selected.value, 3)
  assert.equal(strip.move(-1), undefined)
  assert.equal(selected.value, 3)
  strip.move(1)
  strip.move(1)
  strip.move(1)
  assert.equal(strip.first.value, 3)
  assert.equal(strip.move(1), undefined, 'last position must not advance the selected tab')
  assert.equal(selected.value, 3)
  stop()
})
test('left navigation transfers selection from the departing rightmost tab to its left neighbour', () => {
  for (const desktop of [true, false]) {
    const { strip, selected, stop } = fixture(Array(10).fill(70), desktop ? 960 : 250, desktop, 9)
    const previousStart = strip.first.value
    const nextSelection = strip.move(-1)
    assert.equal(nextSelection, 8)
    selected.value = nextSelection
    assert.equal(strip.first.value, previousStart - 1)
    assert.equal(selected.value, strip.first.value + strip.layout.value.count - 1)
    selected.value = strip.move(-1)
    assert.equal(selected.value, 7)
    assert.equal(strip.first.value, previousStart - 2)
    stop()
  }
})
test('left navigation at the first window does not transfer the rightmost selection', () => {
  const { strip, selected, stop } = fixture(undefined, 1100, true, 6)
  assert.equal(strip.first.value, 0)
  assert.equal(strip.move(-1), undefined)
  assert.equal(selected.value, 6)
  assert.equal(strip.first.value, 0)
  stop()
})
