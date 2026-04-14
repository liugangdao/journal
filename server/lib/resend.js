import { Resend } from 'resend'

let client = null

function getClient() {
  if (client) return client
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY is not set')
  client = new Resend(apiKey)
  return client
}

/** Test seam — allows tests to inject a stub. Not used in production. */
export function _setResendClientForTest(stub) {
  client = stub
}

export async function sendMagicLinkEmail(email, token) {
  const baseUrl = process.env.BASE_URL ?? 'https://journal.basiscalc.xyz'
  const url = `${baseUrl}/auth/verify?token=${token}`

  const result = await getClient().emails.send({
    from: 'noreply@basiscalc.xyz',
    to: [email],
    subject: 'Sign in to basiscalc journal',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 16px;">
        <h1 style="font-size:20px;margin:0 0 16px">Sign in to basiscalc journal</h1>
        <p style="color:#555">Click the button below to sign in. This link expires in 15 minutes.</p>
        <p style="margin:24px 0">
          <a href="${url}" style="display:inline-block;background:#10b981;color:#0a0a0a;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
            Sign in &rarr;
          </a>
        </p>
        <p style="color:#888;font-size:12px">If you didn't request this, you can safely ignore it.</p>
        <p style="color:#888;font-size:12px">Direct link: <a href="${url}">${url}</a></p>
      </div>
    `.trim(),
    text: `Sign in to basiscalc journal\n\nClick the link to sign in (expires in 15 minutes):\n${url}\n\nIf you didn't request this, ignore this email.`,
  })

  if (result.error) {
    throw new Error(result.error.message ?? 'Resend returned an error')
  }
}
