import MarketingShell from './MarketingShell'
import { en } from '../i18n/en'

const EMAIL = 'liuz99004@gmail.com'

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="text-sm text-muted leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <article className="max-w-2xl mx-auto px-4 sm:px-6 py-16 space-y-6">
        <header>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{en.privacy.title}</h1>
          <p className="text-xs text-muted mt-2">{en.privacy.effective}</p>
        </header>

        <Section title={en.privacy.localTitle}>
          <p>{en.privacy.localBody}</p>
        </Section>

        <Section title={en.privacy.serverTitle}>
          <p>{en.privacy.serverBody}</p>
        </Section>

        <Section title={en.privacy.thirdTitle}>
          <ul className="list-disc pl-5 space-y-1">
            <li>{en.privacy.thirdResend}</li>
            <li>{en.privacy.thirdCloudflare}</li>
          </ul>
        </Section>

        <Section title={en.privacy.noTitle}>
          <p>{en.privacy.noBody}</p>
        </Section>

        <Section title={en.privacy.rightsTitle}>
          <ul className="list-disc pl-5 space-y-1">
            <li>{en.privacy.rightsExport}</li>
            <li>{en.privacy.rightsDelete}</li>
            <li>
              {en.privacy.rightsAccount} <a className="text-accent hover:underline" href={`mailto:${EMAIL}`}>{EMAIL}</a>
            </li>
          </ul>
        </Section>

        <Section title={en.privacy.changesTitle}>
          <p>{en.privacy.changesBody}</p>
        </Section>
      </article>
    </MarketingShell>
  )
}
