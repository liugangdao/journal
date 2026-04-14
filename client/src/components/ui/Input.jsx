export default function Input({ value, onChange, placeholder, type = "text", className = "" }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-input text-text border border-border rounded-lg px-3 py-2 text-sm outline-none font-mono
        focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all duration-200
        placeholder:text-muted/50 ${className}`}
    />
  )
}
