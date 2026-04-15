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

export default function TermsPage() {
  return (
    <MarketingShell>
      <article className="max-w-2xl mx-auto px-4 sm:px-6 py-16 space-y-6">
        <header>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{en.terms.title}</h1>
          <p className="text-xs text-muted mt-2">{en.terms.effective}</p>
        </header>

        <Section title={en.terms.freeTitle}><p>{en.terms.freeBody}</p></Section>
        <Section title={en.terms.adviceTitle}><p>{en.terms.adviceBody}</p></Section>
        <Section title={en.terms.liabilityTitle}><p>{en.terms.liabilityBody}</p></Section>
        <Section title={en.terms.useTitle}><p>{en.terms.useBody}</p></Section>
        <Section title={en.terms.changesTitle}><p>{en.terms.changesBody}</p></Section>

        <Section title={en.terms.contact}>
          <p><a className="text-accent hover:underline" href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
        </Section>
      </article>
    </MarketingShell>
  )
}
