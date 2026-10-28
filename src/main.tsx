import React from 'react'
import ReactDOM from 'react-dom/client'
// Constructable Stylesheets polyfill：支持 macOS < 13.3 的旧 WebKit（mermaid 依赖它）
import 'construct-style-sheets-polyfill'
// highlight.js 代码高亮样式：变量化版本，跟随主题（取代写死的浅色 github.css）
import './styles/hljs-theme.css'
import App from './App'
import './styles/globals.css'
import { applyInstallLanguage } from './lib/installLanguage'

/**
 * 先交接「安装时选的语言」，再渲染首帧。
 *
 * 顺序很重要：设置默认语言是简体中文，若先渲染再改语言，非中文用户会看到
 * 一帧中文闪一下。这里 await 一次 IPC（注册表/命令行读取，微秒级）换取
 * 「打开即是安装语言」的正确观感；失败（非 Tauri 环境、读不到）就按默认继续。
 */
async function bootstrap() {
  try {
    await applyInstallLanguage()
  } catch (e) {
    console.error('[boot] apply install language failed:', e)
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

void bootstrap()
