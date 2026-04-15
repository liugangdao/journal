import { useRegisterSW } from 'virtual:pwa-register/react'
import { useTelegram } from '../hooks/useTelegram'
import { en } from '../i18n/en'

export default function PwaPrompt() {
  const isTelegram = useTelegram()
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (isTelegram || !needRefresh) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:bottom-4 sm:left-auto sm:right-4 sm:w-80 bg-card border border-border rounded-xl p-4 shadow-2xl z-[100]">
      <p className="text-sm mb-3">{en.pwa.description}</p>
      <div className="flex gap-2">
        <button
          onClick={() => updateServiceWorker(true)}
          className="bg-accent text-white px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer hover:brightness-110 transition-all"
        >
          {en.pwa.install}
        </button>
      </div>
    </div>
  )
}
