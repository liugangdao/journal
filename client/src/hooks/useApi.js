import { tg } from './useTelegram'

const BASE = '/api'

let onUnauthorized = null

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (tg) {
    headers['X-Telegram-Init-Data'] = tg.initData
  }
  const res = await fetch(`${BASE}${path}`, {
    headers,
    credentials: 'include',
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    // Only trigger global 401 handler for non-auth routes
    if (res.status === 401 && onUnauthorized && !path.startsWith('/auth/')) {
      onUnauthorized()
    }
    throw new Error(err.error || 'Request failed')
  }
  return res.json()
}

export const api = {
  // Auth
  setUnauthorizedHandler: (handler) => { onUnauthorized = handler },
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getMe: () => request('/auth/me'),

  // Trades
  getTrades: (params) => {
    if (!params) return request('/trades')
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v)
    }
    const str = qs.toString()
    return request(`/trades${str ? '?' + str : ''}`)
  },
  createTrade: (data) => request('/trades', { method: 'POST', body: JSON.stringify(data) }),
  updateTrade: (id, data) => request(`/trades/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTrade: (id) => request(`/trades/${id}`, { method: 'DELETE' }),

  // Notes
  getNotes: () => request('/notes'),
  createNote: (data) => request('/notes', { method: 'POST', body: JSON.stringify(data) }),
  deleteNote: (id) => request(`/notes/${id}`, { method: 'DELETE' }),

  // Monthly Notes
  getMonthlyNotes: () => request('/monthly-notes'),
  createMonthlyNote: (data) => request('/monthly-notes', { method: 'POST', body: JSON.stringify(data) }),
  deleteMonthlyNote: (id) => request(`/monthly-notes/${id}`, { method: 'DELETE' }),

  // Pairs
  getPairs: () => request('/pairs'),
  createPair: (data) => request('/pairs', { method: 'POST', body: JSON.stringify(data) }),
  updatePair: (id, data) => request(`/pairs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePair: (id) => request(`/pairs/${id}`, { method: 'DELETE' }),

  // Policies
  getPolicies: (category) => {
    const qs = category ? `?category=${category}` : ''
    return request(`/policies${qs}`)
  },
  createPolicy: (data) => request('/policies', { method: 'POST', body: JSON.stringify(data) }),
  updatePolicy: (id, data) => request(`/policies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePolicy: (id) => request(`/policies/${id}`, { method: 'DELETE' }),
  togglePolicy: (id) => request(`/policies/${id}/toggle`, { method: 'PUT' }),

  // Violations
  getTradeViolations: (tradeId) => request(`/trades/${tradeId}/violations`),
  updateTradeViolations: (tradeId, policyIds) => request(`/trades/${tradeId}/violations`, {
    method: 'PUT',
    body: JSON.stringify({ policy_ids: policyIds }),
  }),
  getViolationStats: () => request('/violations/stats'),

  // Import
  importData: (data) => request('/import', { method: 'POST', body: JSON.stringify(data) }),

  // Billing
  createInvoice: () => request('/billing/create-invoice', { method: 'POST' }),

  // Telegram auth
  telegramAuth: () => request('/auth/telegram', { method: 'POST' }),

  // Quota info
  getQuota: () => request('/trades/quota'),

  // Export
  exportData: async (from, to) => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const qs = params.toString()
    const res = await fetch(`${BASE}/export${qs ? '?' + qs : ''}`, { credentials: 'include' })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trading-journal-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  },
}
