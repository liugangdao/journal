export default function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not signed in' })
  }
  req.userId = req.session.userId
  next()
}
