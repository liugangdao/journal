import { useCountUp } from '../../hooks/useCountUp'

export default function KpiCard({ label, value, color, sub, comparison }) {
  const numericValue = parseFloat(String(value).replace(/[^0-9.\-]/g, ''))
  const isNumeric = !isNaN(numericValue) && isFinite(numericValue)
  const prefix = typeof value === 'string' ? value.match(/^[^0-9.\-]*/)?.[0] || '' : ''
  const suffix = typeof value === 'string' ? value.match(/[^0-9.\-]*$/)?.[0] || '' : ''

  const animated = useCountUp(isNumeric ? numericValue : 0)

  const decimalMatch = String(value).match(/\.(\d+)/)
  const decimals = decimalMatch ? decimalMatch[1].length : 0

  const displayValue = isNumeric
    ? `${prefix}${animated.toFixed(decimals)}${suffix}`
    : value

  return (
    <div className="bg-card border border-border rounded-xl px-5 py-4 flex-1 min-w-[140px] shadow-sm
      hover:border-accent/30 transition-all duration-300 card-hover">
      <div className="text-[11px] text-muted tracking-wide uppercase mb-1">{label}</div>
      <div className="text-2xl font-bold font-mono" style={{ color: color || undefined }}>
        {displayValue}
      </div>
      {comparison && (
        <div className={`text-[10px] mt-1 font-medium ${
          comparison.direction === 'up' ? 'text-green' :
          comparison.direction === 'down' ? 'text-red' : 'text-muted'
        }`}>
          {comparison.direction === 'up' ? '↑' : comparison.direction === 'down' ? '↓' : '→'} vs上周 {comparison.value}
        </div>
      )}
      {!comparison && sub && <div className="text-[10px] text-muted mt-1">{sub}</div>}
    </div>
  )
}
