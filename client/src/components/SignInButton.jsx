import { useState } from 'react'
import SignInDialog from './SignInDialog'
import { en } from '../i18n/en'

export default function SignInButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-emerald-500 text-neutral-950 px-3 py-1.5 text-sm font-medium hover:bg-emerald-400"
      >
        {en.app.signInToSync}
      </button>
      {open && <SignInDialog onClose={() => setOpen(false)} />}
    </>
  )
}
