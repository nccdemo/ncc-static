/**
 * Tailwind preset: NCC design tokens (requires injectNccTheme() at app bootstrap).
 * Usage: `import nccPreset from '../shared/tailwind-ncc-preset.js'` then `presets: [nccPreset]`.
 */

/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        'ncc-primary': 'var(--ncc-primary)',
        'ncc-accent': 'var(--ncc-accent)',
        'ncc-bg': 'var(--ncc-background)',
        'ncc-text': 'var(--ncc-text)',
      },
      spacing: {
        'ncc-0': 'var(--ncc-space-0)',
        'ncc-1': 'var(--ncc-space-1)',
        'ncc-2': 'var(--ncc-space-2)',
        'ncc-3': 'var(--ncc-space-3)',
        'ncc-4': 'var(--ncc-space-4)',
        'ncc-5': 'var(--ncc-space-5)',
        'ncc-6': 'var(--ncc-space-6)',
        'ncc-8': 'var(--ncc-space-8)',
        'ncc-10': 'var(--ncc-space-10)',
        'ncc-12': 'var(--ncc-space-12)',
      },
      borderRadius: {
        'ncc-sm': 'var(--ncc-radius-sm)',
        'ncc-md': 'var(--ncc-radius-md)',
      },
      boxShadow: {
        'ncc-card': 'var(--ncc-shadow-card)',
        'ncc-card-soft': 'var(--ncc-shadow-card-soft)',
      },
    },
  },
}
