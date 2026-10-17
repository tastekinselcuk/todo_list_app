export type ThemeMode = 'light' | 'dark'
// Keep the persisted IDs compatible with existing account preferences and database validation.
export type ThemePaletteId = 'classic' | 'ocean' | 'forest' | 'sand' | 'lavender' | 'ruby' | 'cobalt' | 'graphite'

// Semantic tokens keep every module on the same palette without changing status/category colors.
function tokens(background: string, surface: string, foreground: string, primary: string,
  primaryForeground: string, muted: string, mutedForeground: string, border: string) {
  return {
    background, foreground, card: surface, 'card-foreground': foreground,
    popover: surface, 'popover-foreground': foreground, primary, 'primary-foreground': primaryForeground,
    secondary: muted, 'secondary-foreground': foreground, muted, 'muted-foreground': mutedForeground,
    accent: muted, 'accent-foreground': foreground, border, input: border, ring: primary,
  }
}

function rgb(hex: string) {
  return [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
}

// Existing components consume HSL channels; preserve the supplied hex colors exactly.
function hsl(hex: string) {
  const [r, g, b] = rgb(hex)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
  const lightness = (max + min) / 2
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0
  const hue = !delta ? 0 : max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  return `${+(hue * 60).toFixed(4)} ${+(saturation * 100).toFixed(4)}% ${+(lightness * 100).toFixed(4)}%`
}

function premiumMode(mode: ThemeMode, background: string, card: string, primary: string, secondarySurface: string,
  supplied?: { foreground: string; mutedForeground: string; border: string }) {
  const hue = hsl(primary).split(' ')[0]
  const light = mode === 'light'
  const luminance = rgb(primary).reduce((sum, channel, index) => {
    const linear = channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
    return sum + linear * [.2126, .7152, .0722][index]
  }, 0)
  // A few supplied light accents need dark button labels to retain readable contrast.
  const primaryForeground = 1.05 / (luminance + .05) >= 4.5 ? '0 0% 100%' : `${hue} 30% 4%`
  return tokens(hsl(background), hsl(card), supplied ? hsl(supplied.foreground) : `${hue} ${light ? '25% 13%' : '18% 94%'}`,
    hsl(primary), primaryForeground, hsl(secondarySurface), supplied ? hsl(supplied.mutedForeground) : `${hue} ${light ? '15% 32%' : '16% 76%'}`,
    supplied ? hsl(supplied.border) : `${hue} ${light ? '20% 78%' : '18% 30%'}`)
}

export const themePalettes = [
  { id: 'classic', name: { tr: 'Klasik', en: 'Classic' }, colors: {
    light: { ...tokens('0 0% 100%', '0 0% 100%', '222.2 84% 4.9%', '222.2 47.4% 11.2%',
      '210 40% 98%', '210 40% 96.1%', '215.4 16.3% 45.5%', '214.3 31.8% 91.4%'), ring: '222.2 84% 4.9%' },
    dark: { ...tokens('222.2 84% 4.9%', '222.2 84% 4.9%', '210 40% 98%', '210 40% 98%',
      '222.2 47.4% 11.2%', '217.2 32.6% 17.5%', '215 20.2% 65.1%', '217.2 32.6% 17.5%'), ring: '212.7 26.8% 83.9%' },
  } },
  { id: 'forest', name: { tr: 'Orman Yeşili', en: 'Forest Night' }, colors: {
    light: premiumMode('light', '#EDF5EF', '#FBFDFB', '#287755', '#D4E8DB'),
    dark: premiumMode('dark', '#101C19', '#172721', '#8BC4A3', '#293D34'),
  } },
  { id: 'lavender', name: { tr: 'Ametist Moru', en: 'Amethyst' }, colors: {
    light: premiumMode('light', '#F1EEFB', '#FCFAFF', '#7046B8', '#E1D9F3'),
    dark: premiumMode('dark', '#181625', '#242036', '#BAA2F4', '#332D49'),
  } },
  { id: 'sand', name: { tr: 'Toprak Tonları', en: 'Terracotta' }, colors: {
    light: premiumMode('light', '#FAF3E9', '#FFFCF7', '#B96545', '#EFE3D4'),
    dark: premiumMode('dark', '#231A17', '#33251F', '#E5A17F', '#4C3830'),
  } },
  { id: 'ocean', name: { tr: 'Petrol Mavisi', en: 'Ocean Depth' }, colors: {
    light: premiumMode('light', '#EDF7F7', '#FAFEFE', '#258A88', '#D3EBE9'),
    dark: premiumMode('dark', '#071D25', '#102B35', '#67D6C5', '#20424B'),
  } },
  { id: 'ruby', name: { tr: 'Yakut Kırmızısı', en: 'Ruby Noir' }, colors: {
    light: premiumMode('light', '#FBF2F3', '#FFFCFC', '#A93349', '#F1DCE1',
      { foreground: '#382027', mutedForeground: '#916F78', border: '#EBD4D9' }),
    dark: premiumMode('dark', '#1D1015', '#2A171F', '#F08CA0', '#462431',
      { foreground: '#FBE9ED', mutedForeground: '#CCA6AF', border: '#58313D' }),
  } },
  { id: 'cobalt', name: { tr: 'Kobalt Mavisi', en: 'Cobalt Blue' }, colors: {
    light: premiumMode('light', '#F0F4FF', '#FFFFFF', '#315BD5', '#DBE5FF',
      { foreground: '#182B54', mutedForeground: '#7181A6', border: '#D7E1F7' }),
    dark: premiumMode('dark', '#0C1530', '#152242', '#86A8FF', '#253963',
      { foreground: '#EDF2FF', mutedForeground: '#A2B5DD', border: '#354976' }),
  } },
  { id: 'graphite', name: { tr: 'Grafit', en: 'Graphite' }, colors: {
    light: premiumMode('light', '#ECEFF2', '#FAFBFC', '#465668', '#DCE2E8',
      { foreground: '#1E2935', mutedForeground: '#7B8997', border: '#D3DAE1' }),
    dark: premiumMode('dark', '#14171B', '#21262C', '#B7C5D3', '#343C45',
      { foreground: '#F2F5F7', mutedForeground: '#A4B0BC', border: '#46515C' }),
  } },
] as const

export function isThemePaletteId(value: unknown): value is ThemePaletteId {
  return themePalettes.some(palette => palette.id === value)
}

export function normalizeThemePaletteId(value: unknown, fallback: ThemePaletteId = 'classic'): ThemePaletteId {
  // The retired warm palette follows Terracotta instead of leaving the selector empty.
  return value === 'amber' ? 'sand' : isThemePaletteId(value) ? value : fallback
}

export function getThemePalette(id: unknown) {
  return themePalettes.find(palette => palette.id === normalizeThemePaletteId(id)) || themePalettes[0]
}

export function applyThemeAppearance(root: HTMLElement, mode: ThemeMode, id: unknown) {
  const palette = getThemePalette(id)
  root.classList.toggle('dark', mode === 'dark')
  root.style.colorScheme = mode
  root.dataset.palette = palette.id
  for (const [key, value] of Object.entries(palette.colors[mode])) root.style.setProperty(`--${key}`, value)
}
