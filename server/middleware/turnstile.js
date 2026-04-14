export async function verifyTurnstile(req, res, next) {
  const token = req.body?.turnstileToken
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Turnstile token missing' })
  }

  const secret = process.env.TURNSTILE_SECRET
  if (!secret) {
    return res.status(500).json({ error: 'Turnstile not configured' })
  }

  try {
    const formData = new URLSearchParams()
    formData.append('secret', secret)
    formData.append('response', token)
    formData.append('remoteip', req.ip ?? '')

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    })
    const data = await response.json()

    if (!data.success) {
      return res.status(403).json({ error: 'Turnstile verification failed' })
    }
    next()
  } catch (err) {
    res.status(502).json({ error: 'Turnstile service unreachable' })
  }
}
