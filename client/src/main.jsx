import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { TelegramProvider, tg } from './hooks/useTelegram'

// Tell Telegram the app is ready
if (tg) {
  tg.ready()
  tg.expand()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TelegramProvider>
      <App />
    </TelegramProvider>
  </StrictMode>
)
