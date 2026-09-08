import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { SettingsProvider } from './store/SettingsProvider'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root が見つかりません')

createRoot(rootEl).render(
  <StrictMode>
    {/* GitHub Pages は SPA のリライトができないため HashRouter を使う（docs/architecture.md） */}
    <HashRouter>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </HashRouter>
  </StrictMode>,
)
