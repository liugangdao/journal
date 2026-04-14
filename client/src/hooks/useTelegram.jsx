import { createContext, useContext } from 'react'

const TelegramContext = createContext(false)

const isTelegram = !!window.Telegram?.WebApp

/** The raw Telegram WebApp object, or null if not in TG */
export const tg = isTelegram ? window.Telegram.WebApp : null

export function TelegramProvider({ children }) {
  return (
    <TelegramContext.Provider value={isTelegram}>
      {children}
    </TelegramContext.Provider>
  )
}

/** Returns true if running inside a Telegram Mini App */
export function useTelegram() {
  return useContext(TelegramContext)
}
