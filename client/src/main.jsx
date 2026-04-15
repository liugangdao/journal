import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import LandingPage from './components/LandingPage'
import AboutPage from './components/AboutPage'
import PrivacyPage from './components/PrivacyPage'
import TermsPage from './components/TermsPage'

function pickRoot(pathname) {
  if (pathname === '/app' || pathname.startsWith('/app/')) return <App />
  if (pathname === '/about') return <AboutPage />
  if (pathname === '/privacy') return <PrivacyPage />
  if (pathname === '/terms') return <TermsPage />
  return <LandingPage />
}

const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {pickRoot(pathname)}
  </StrictMode>
)
