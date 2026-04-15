import MarketingShell from './MarketingShell'
import { en } from '../i18n/en'

const AUTHOR = 'lz'
const TWITTER = 'liuz99004'
const GITHUB = 'liugangdao'
const WALLET = '0x86f046Bd858c679fEc72652cC082568E2bA7fFD4'
const EMAIL = 'liuz99004@gmail.com'
const PARENT = 'https://basiscalc.xyz'

export default function AboutPage() {
  return (
    <MarketingShell>
      <article className="max-w-2xl mx-auto px-4 sm:px-6 py-16 space-y-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{en.about.title}</h1>
        <p className="text-lg leading-relaxed">{en.about.intro.replace('{author}', AUTHOR)}</p>
        <p className="text-sm text-muted leading-relaxed">{en.about.body}</p>
        <p className="text-sm leading-relaxed">{en.about.free}</p>

        <section className="pt-6 border-t border-border">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">{en.about.findMe}</h2>
          <ul className="space-y-2 text-sm">
            <li>
              {en.about.twitter}: <a className="text-accent hover:underline" href={`https://twitter.com/${TWITTER}`} rel="noopener noreferrer" target="_blank">@{TWITTER}</a>
            </li>
            <li>
              {en.about.github}: <a className="text-accent hover:underline" href={`https://github.com/${GITHUB}`} rel="noopener noreferrer" target="_blank">{GITHUB}</a>
            </li>
            <li className="break-all">
              {en.about.onchain}: <code className="text-xs bg-card border border-border px-1.5 py-0.5 rounded">{WALLET}</code>
              <span className="block text-xs text-muted mt-1">{en.about.onchainDesc}</span>
            </li>
            <li>
              {en.about.parent}: <a className="text-accent hover:underline" href={PARENT} rel="noopener noreferrer" target="_blank">basiscalc.xyz</a>
            </li>
            <li>
              {en.about.contact}: <a className="text-accent hover:underline" href={`mailto:${EMAIL}`}>{EMAIL}</a>
            </li>
          </ul>
        </section>
      </article>
    </MarketingShell>
  )
}
