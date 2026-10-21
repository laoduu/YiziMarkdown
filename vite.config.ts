import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'

/**
 * KaTeX 的字体在 `katex.min.css?inline` 里仍是相对路径（`fonts/KaTeX_*.woff2`）。
 *
 * 导出文档（PDF 的隐藏窗口 / 独立 HTML 文件）不在 `dist/assets/` 里，那些相对路径取不到
 * ⇒ 公式退化成回退字体（字距、根号、分数线全走样）。这里在构建期把 woff2 直接内联成
 * data URL：Chromium/WebView2 都支持 woff2，woff/ttf 是给老浏览器的回退，不用搬。
 *
 * 只处理 `?inline` 的引入 —— 应用自身的 KaTeX 样式仍走正常 CSS，不重复膨胀。
 */
function inlineKatexFonts(): Plugin {
  return {
    name: 'inline-katex-fonts',
    enforce: 'pre',
    transform(code, id) {
      const [file, query = ''] = id.split('?')
      if (!query.includes('inline') || !file.includes('katex') || !file.endsWith('.css')) return
      if (!code.includes('@font-face')) return
      const dir = path.dirname(file)
      let inlined = 0
      const out = code.replace(/url\((['"]?)([^)'"]+\.woff2)\1\)/g, (match, _quote, ref) => {
        try {
          const bytes = readFileSync(path.resolve(dir, ref))
          inlined++
          return `url(data:font/woff2;base64,${bytes.toString('base64')})`
        } catch {
          return match // 找不到就保持原样，构建不因此失败
        }
      })
      if (inlined > 0) console.log(`[inline-katex-fonts] ${inlined} 个 woff2 已内联`)
      return out
    },
  }
}

export default defineConfig({
  plugins: [inlineKatexFonts(), react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tauri-apps/api/tauri': path.resolve(__dirname, './node_modules/@tauri-apps/api/core.js'),
    },
  },
  // Tauri 开发时的配置
  server: {
    port: 1420,
    strictPort: true,
    // 忽略 src-tauri 与 target，避免 Vite 监听 cargo 写入中的文件导致 EBUSY 崩溃
    watch: {
      ignored: ['**/src-tauri/**', '**/target/**'],
    },
  },
  build: {
    outDir: path.resolve(__dirname, './dist'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'codemirror': [
            '@codemirror/view',
            '@codemirror/state',
            '@codemirror/language',
            '@codemirror/commands',
            '@codemirror/search',
            '@codemirror/autocomplete',
            '@codemirror/lang-markdown',
            '@codemirror/lang-javascript',
            '@codemirror/lang-python',
            '@codemirror/lang-html',
            '@codemirror/lang-css',
            '@codemirror/lang-json',
            '@codemirror/lang-xml',
            '@codemirror/lang-java',
            '@codemirror/lang-cpp',
            '@codemirror/lang-rust',
            '@codemirror/lang-go',
            '@codemirror/lang-php',
            '@codemirror/lang-sql',
            '@codemirror/lang-yaml',
            '@codemirror/lang-angular',
            '@codemirror/language-data',
          ],
          'lucide': ['lucide-react'],
        },
      },
    },
  },
})
