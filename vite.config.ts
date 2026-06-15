import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
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
