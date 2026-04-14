import { verifyInitData } from '../lib/telegram.js'
import db from '../db.js'

export default function requireAuth(req, res, next) {
  const initData = req.headers['x-telegram-init-data']

  if (initData) {
    // Telegram path: verify signature, look up user by telegram_id
    const { valid, user: tgUser, error } = verifyInitData(initData)
    if (!valid) {
      return res.status(401).json({ error: error || '无效的 Telegram 认证' })
    }
    const dbUser = db.prepare('SELECT id FROM users WHERE telegram_id = ?').get(String(tgUser.id))
    if (!dbUser) {
      return res.status(401).json({ error: '用户不存在，请先通过 Mini App 登录' })
    }
    req.userId = dbUser.id
    return next()
  }

  // Web session path
  if (req.session && req.session.userId) {
    req.userId = req.session.userId
    return next()
  }

  return res.status(401).json({ error: '请先登录' })
}
