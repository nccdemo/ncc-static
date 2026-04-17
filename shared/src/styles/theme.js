/**
 * NCC shared design system — tokens + CSS custom properties for all frontends.
 *
 * Import from each app as `./styles/theme.js` (re-export) and call `injectNccTheme()`
 * once at startup before global CSS so `var(--ncc-*)` resolves everywhere.
 */

export const colors = {
  primary: '#0B1F3A',
  accent: '#C8A96A',
  background: '#F8F9FB',
  text: '#1A1A1A',
}

/** Spacing scale (rem) */
export const spacing = {
  0: '0',
  1: '0.25rem', // 4px
  2: '0.5rem', // 8px
  3: '0.75rem', // 12px
  4: '1rem', // 16px
  5: '1.25rem', // 20px
  6: '1.5rem', // 24px
  8: '2rem', // 32px
  10: '2.5rem', // 40px
  12: '3rem', // 48px
}

/** Border radius */
export const radius = {
  sm: '8px',
  md: '12px',
}

/** Soft elevation for cards */
export const shadows = {
  card: '0 1px 2px rgba(11, 31, 58, 0.06), 0 4px 14px rgba(11, 31, 58, 0.07)',
  cardSoft: '0 2px 8px rgba(11, 31, 58, 0.08), 0 12px 28px rgba(11, 31, 58, 0.06)',
}

export const theme = {
  colors,
  spacing,
  radius,
  shadows,
}

function buildCssVarEntries() {
  const entries = [
    ['--ncc-primary', colors.primary],
    ['--ncc-accent', colors.accent],
    ['--ncc-background', colors.background],
    ['--ncc-text', colors.text],
    ['--ncc-radius-sm', radius.sm],
    ['--ncc-radius-md', radius.md],
    ['--ncc-shadow-card', shadows.card],
    ['--ncc-shadow-card-soft', shadows.cardSoft],
  ]
  for (const [k, v] of Object.entries(spacing)) {
    entries.push([`--ncc-space-${k}`, v])
  }
  return entries
}

const CSS_VAR_ENTRIES = buildCssVarEntries()

/**
 * Pushes design tokens onto `document.documentElement` (or another element) as CSS variables.
 */
export function injectNccTheme(target = typeof document !== 'undefined' ? document.documentElement : null) {
  if (!target?.style) return
  for (const [key, val] of CSS_VAR_ENTRIES) {
    target.style.setProperty(key, val)
  }
}

export default theme
