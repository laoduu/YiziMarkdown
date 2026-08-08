import React from 'react'
import ReactDOM from 'react-dom/client'
// Constructable Stylesheets polyfill：支持 macOS < 13.3 的旧 WebKit（mermaid 依赖）
import 'construct-style-sheets-polyfill'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
