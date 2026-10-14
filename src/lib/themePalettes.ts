export type ThemeMode = 'light' | 'dark'
export type ThemePaletteId = 'classic' | 'ocean' | 'forest' | 'sand' | 'lavender' | 'amber'

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

function colorFamily(hue: number, lightAccent: string, darkAccent: string) {
  return {
    light: tokens(`${hue} 24% 98%`, `${hue} 20% 99.5%`, `${hue} 25% 14%`, lightAccent,
      '0 0% 100%', `${hue} 22% 94%`, `${hue} 12% 40%`, `${hue} 18% 84%`),
    dark: tokens(`${hue} 24% 8%`, `${hue} 22% 10%`, `${hue} 18% 95%`, darkAccent,
      `${hue} 30% 10%`, `${hue} 18% 16%`, `${hue} 14% 70%`, `${hue} 16% 27%`),
  }
}

export const themePalettes = [
  { id: 'classic', name: { tr: 'Klasik', en: 'Classic' }, colors: {
    light: { ...tokens('0 0% 100%', '0 0% 100%', '222.2 84% 4.9%', '222.2 47.4% 11.2%',
      '210 40% 98%', '210 40% 96.1%', '215.4 16.3% 45.5%', '214.3 31.8% 91.4%'), ring: '222.2 84% 4.9%' },
    dark: { ...tokens('222.2 84% 4.9%', '222.2 84% 4.9%', '210 40% 98%', '210 40% 98%',
      '222.2 47.4% 11.2%', '217.2 32.6% 17.5%', '215 20.2% 65.1%', '217.2 32.6% 17.5%'), ring: '212.7 26.8% 83.9%' },
  } },
  { id: 'ocean', name: { tr: 'Okyanus', en: 'Ocean' }, colors: colorFamily(218, '217 74% 43%', '217 85% 72%') },
  { id: 'forest', name: { tr: 'Orman', en: 'Forest' }, colors: colorFamily(158, '160 48% 28%', '160 45% 65%') },
  { id: 'sand', name: { tr: 'Kum', en: 'Sand' }, colors: colorFamily(28, '20 46% 35%', '24 52% 72%') },
  { id: 'lavender', name: { tr: 'Lavanta', en: 'Lavender' }, colors: colorFamily(262, '262 50% 45%', '262 75% 78%') },
  { id: 'amber', name: { tr: 'Kehribar', en: 'Amber' }, colors: colorFamily(38, '35 85% 32%', '38 80% 65%') },
] as const

export function isThemePaletteId(value: unknown): value is ThemePaletteId {
  return themePalettes.some(palette => palette.id === value)
}

export function getThemePalette(id: unknown) {
  return themePalettes.find(palette => palette.id === id) || themePalettes[0]
}

export function applyThemeAppearance(root: HTMLElement, mode: ThemeMode, id: unknown) {
  const palette = getThemePalette(id)
  root.classList.toggle('dark', mode === 'dark')
  root.style.colorScheme = mode
  root.dataset.palette = palette.id
  for (const [key, value] of Object.entries(palette.colors[mode])) root.style.setProperty(`--${key}`, value)
}
