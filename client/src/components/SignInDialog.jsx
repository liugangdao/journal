import { useEffect, useState } from 'react'
import { en } from '../i18n/en'

export default function SignInDialog({ onClose }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle') // idle | submitting | sent | error
  const [turnstileToken, setTurnstileToken] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY
    if (!siteKey) {
      // Dev mode: no Turnstile. Server skips verification when NODE_ENV=test.
      setTurnstileToken('skip-in-test')
      return
    }
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad'
    script.async = true
    script.defer = true
    window.onTurnstileLoad = () => {
      const tw = window.turnstile
      if (!tw) return
      tw.render('#cf-turnstile', {
        sitekey: siteKey,
        callback: (token) => setTurnstileToken(token),
      })
    }
    document.body.appendChild(script)
    return () => {
      if (script.parentNode) script.parentNode.removeChild(script)
      delete window.onTurnstileLoad
    }
  }, [])

  async function onSubmit(e) {
    e.preventDefault()
    if (!email || !turnstileToken) return
    setState('submitting')
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, turnstileToken }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setState('sent')
    } catch (err) {
      console.error('[signin]', err)
      setState('error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="rounded-lg bg-card border border-border p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {state === 'sent' ? (
          <>
            <h2 className="text-lg font-semibold">{en.signIn.checkInbox}</h2>
            <p className="mt-2 text-sm text-muted">
              {en.signIn.checkInboxDesc.replace('{email}', email)}
            </p>
            <button
              type="button"
              className="mt-4 w-full rounded bg-neutral-200 dark:bg-neutral-800 px-3 py-2 text-sm"
              onClick={onClose}
            >
              {en.common.close}
            </button>
          </>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block text-sm">
              <span className="text-muted">{en.signIn.emailLabel}</span>
              <input
                type="email"
                required
                autoFocus
                placeholder={en.signIn.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded bg-input border border-border px-3 py-2"
              />
            </label>
            <div id="cf-turnstile" />
            {state === 'error' && (
              <p className="text-sm text-red-500">{en.signIn.error}</p>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-border px-3 py-2 text-sm"
              >
                {en.signIn.cancel}
              </button>
              <button
                type="submit"
                disabled={state === 'submitting'}
                className="rounded bg-emerald-500 text-neutral-950 px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                {state === 'submitting' ? '…' : en.signIn.submit}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
