import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import LandingPage from './components/LandingPage'

// Minimal path-based routing: `/` → marketing landing page, anything under
// `/app` → the trading journal app shell. No router dependency — the server
// serves the same index.html for both paths and the client picks at mount.
const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
const isAppRoute = pathname === '/app' || pathname.startsWith('/app/')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isAppRoute ? <App /> : <LandingPage />}
  </StrictMode>
)
