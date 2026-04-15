// Stub: Telegram integration removed from V1 per spec §3.
// Telegram columns are retained in the users table (see server/db.js
// and docs/superpowers/specs/...-design.md §6) for future V2.
// For V1 we always return false from useTelegram so existing
// Layout/MoreTab/PwaPrompt/MobileSheet components keep compiling.

import { createContext, useContext } from 'react'

const TelegramContext = createContext(false)

export function TelegramProvider({ children }) {
  return children
}

export function useTelegram() {
  return useContext(TelegramContext)
}

export const tg = null
