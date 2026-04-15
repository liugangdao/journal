export default function Select({ value, onChange, options, className = "" }) {
  const isObjectOptions = options.length > 0 && typeof options[0] === 'object' && options[0] !== null
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`w-full bg-input text-text border border-border rounded-lg px-3 py-2 text-sm outline-none
        focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all duration-200
        cursor-pointer ${className}`}
    >
      {isObjectOptions
        ? options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
        : options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
