import type { Config } from 'tailwindcss'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        'sans': ['DengXian', 'Microsoft YaHei', 'Noto Sans SC', 'system-ui', 'sans-serif'],
        'serif': ['Playfair Display', 'Source Serif Pro', 'Georgia', 'serif'],
        'mono': ['DengXian', 'Consolas', 'Courier New', 'monospace'],
      },
      colors: {
        'editor-bg': 'var(--editor-bg)',
        'editor-text': 'var(--editor-text)',
        'editor-accent': 'var(--editor-accent)',
        'editor-border': 'var(--editor-border)',
        'editor-surface': 'var(--editor-surface)',
        'editor-hover': 'var(--editor-hover)',
      },
      typography: {
        DEFAULT: {
          css: {
            '--tw-prose-body': 'var(--editor-text)',
            '--tw-prose-headings': 'var(--editor-text)',
            '--tw-prose-lead': 'var(--editor-text)',
            '--tw-prose-links': 'var(--editor-accent)',
            '--tw-prose-bold': 'var(--editor-text)',
            '--tw-prose-counters': 'var(--sidebar-text)',
            '--tw-prose-bullets': 'var(--sidebar-text)',
            '--tw-prose-hr': 'var(--editor-border)',
            '--tw-prose-quotes': 'var(--editor-text)',
            '--tw-prose-quote-borders': 'var(--editor-accent)',
            '--tw-prose-captions': 'var(--sidebar-text)',
            '--tw-prose-code': 'var(--editor-text)',
            '--tw-prose-pre-code': 'var(--editor-text)',
            '--tw-prose-pre-bg': 'var(--editor-surface)',
            '--tw-prose-th-borders': 'var(--editor-border)',
            '--tw-prose-td-borders': 'var(--editor-border)',
            'color': 'var(--editor-text)',
            'a': {
              'color': 'var(--editor-accent)',
              'textDecoration': 'underline',
              '&:hover': { 'opacity': '0.8' },
            },
            'blockquote': {
              'borderLeftColor': 'var(--editor-accent)',
              'color': 'var(--editor-text)',
              'fontStyle': 'italic',
            },
            'code': {
              'color': 'var(--editor-text)',
              'backgroundColor': 'var(--editor-surface)',
              'padding': '2px 6px',
              'borderRadius': '4px',
              'fontSize': '0.875em',
            },
            'code::before': { 'content': 'none' },
            'code::after': { 'content': 'none' },
            'pre': {
              'backgroundColor': 'var(--editor-surface)',
              'border': '1px solid var(--editor-border)',
              'borderRadius': '8px',
              'padding': '16px',
              'overflow': 'auto',
            },
            'pre code': {
              'backgroundColor': 'transparent',
              'padding': '0',
              'fontSize': '0.875em',
            },
            'table': {
              'width': '100%',
              'borderCollapse': 'collapse',
            },
            'th': {
              'backgroundColor': 'var(--editor-surface)',
              'border': '1px solid var(--editor-border)',
              'padding': '8px 12px',
              'fontWeight': '600',
              'textAlign': 'left',
            },
            'td': {
              'border': '1px solid var(--editor-border)',
              'padding': '8px 12px',
            },
            'hr': {
              'borderColor': 'var(--editor-border)',
              'marginTop': '2em',
              'marginBottom': '2em',
            },
            'h1': { 'fontSize': '2em', 'fontWeight': '700', 'marginTop': '1.5em', 'marginBottom': '0.5em' },
            'h2': { 'fontSize': '1.5em', 'fontWeight': '600', 'marginTop': '1.3em', 'marginBottom': '0.4em' },
            'h3': { 'fontSize': '1.25em', 'fontWeight': '600', 'marginTop': '1.2em', 'marginBottom': '0.3em' },
            'img': { 'borderRadius': '8px', 'maxWidth': '100%' },
            'ul > li': { 'paddingLeft': '0.25em' },
            'ol > li': { 'paddingLeft': '0.25em' },
            'ul > li::marker': { 'color': 'var(--sidebar-text)' },
            'ol > li::marker': { 'color': 'var(--sidebar-text)', 'fontWeight': '400' },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
} satisfies Config
