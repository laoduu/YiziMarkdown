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
        // 指向主题令牌，而不是硬编码字体栈 —— 否则 90 处 font-* 工具类会绕过主题的字体设置
        // （此前 font-mono 指向 DengXian，而 --font-mono 是 JetBrains Mono/Consolas，两套互不相干）
        'sans': 'var(--font-sans)',
        'serif': 'var(--font-serif)',
        'mono': 'var(--font-mono)',
      },
      colors: {
        'editor-bg': 'var(--editor-bg)',
        'editor-text': 'var(--editor-text)',
        'editor-accent': 'var(--editor-accent)',
        'editor-border': 'var(--editor-border)',
        'editor-surface': 'var(--editor-surface)',
        'editor-hover': 'var(--editor-hover)',
      },
      borderRadius: {
        // 主题可控圆角：新键，刻意不与 Tailwind 默认的 sm/md/lg/xl 冲突，
        // 免得一次改配置就把全应用的既有圆角语义整体平移
        'ui': 'var(--radius-md)',
        'card': 'var(--radius-lg)',
        'pop': 'var(--radius-xl)',
      },
      typography: {
        DEFAULT: {
          css: {
            '--tw-prose-body': 'var(--editor-text)',
            '--tw-prose-headings': 'var(--h1-color)',
            '--tw-prose-lead': 'var(--editor-text)',
            '--tw-prose-links': 'var(--link-color)',
            '--tw-prose-bold': 'var(--strong-color)',
            '--tw-prose-counters': 'var(--sidebar-text)',
            '--tw-prose-bullets': 'var(--sidebar-text)',
            '--tw-prose-hr': 'var(--hr-color)',
            '--tw-prose-quotes': 'var(--quote-fg)',
            '--tw-prose-quote-borders': 'var(--quote-bar)',
            '--tw-prose-captions': 'var(--sidebar-text)',
            '--tw-prose-code': 'var(--inline-code-fg)',
            '--tw-prose-pre-code': 'var(--editor-text)',
            '--tw-prose-pre-bg': 'var(--code-pre-bg)',
            '--tw-prose-th-borders': 'var(--table-border)',
            '--tw-prose-td-borders': 'var(--table-border)',
            'color': 'var(--editor-text)',
            'a': {
              'color': 'var(--editor-accent)',
              'textDecoration': 'underline',
              '&:hover': { 'opacity': '0.8' },
            },
            'blockquote': {
              'borderLeftColor': 'var(--quote-bar)',
              'color': 'var(--quote-fg)',
              // 用 background 简写而非 backgroundColor：主题可能给渐变
              'background': 'var(--quote-bg)',
              'fontStyle': 'italic',
              // 上下留白统一为"半行左右"（0.5em margin + 各主题 0.5em 纵向 padding）
              'marginTop': '0.5em',
              'marginBottom': '0.5em',
              // prose 默认会给引用内容强加首尾引号，去掉（用户明确要求）。
              // 两道保险：quotes: none 让 open-quote/close-quote 关键字不产生内容，
              // 不依赖选择器特异性；content: none 则直接改掉那两条伪元素规则。
              'quotes': 'none',
              'p:first-of-type::before': { 'content': 'none' },
              'p:last-of-type::after': { 'content': 'none' },
              // 首尾段落自身的外边距会变成引用块内**可见的**上下留白
              // （看起来像"引用里多了一个空行"），去掉
              'p:first-of-type': { 'marginTop': '0' },
              'p:last-of-type': { 'marginBottom': '0' },
            },
            'code': {
              'color': 'var(--inline-code-fg)',
              'backgroundColor': 'var(--inline-code-bg)',
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
              'backgroundColor': 'var(--table-head-bg)',
              'border': '1px solid var(--table-border)',
              'padding': '8px 12px',
              'fontWeight': '600',
              'textAlign': 'left',
            },
            'td': {
              'border': '1px solid var(--table-border)',
              'padding': '8px 12px',
            },
            'hr': {
              'borderColor': 'var(--hr-color)',
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
