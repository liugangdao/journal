import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const THEME = {
  light: { border: '#e2e8f0', muted: '#94a3b8', green: '#16a34a', red: '#dc2626', accent: '#3b82f6', card: '#ffffff' },
  dark: { border: '#1e293b', muted: '#64748b', green: '#10b981', red: '#ef4444', accent: '#3b82f6', card: '#111827' },
}

export default function WeeklyTrend({ weeklyTrend, theme = 'dark' }) {
  const C = THEME[theme] || THEME.dark
  if (!weeklyTrend || weeklyTrend.length === 0) return null

  const tooltipStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }
  const shortWeek = (w) => w.replace(/^\d{4}-/, '')

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-card border border-border rounded-xl p-3 sm:p-5 shadow-sm">
        <h4 className="text-sm font-bold mb-3">周胜率趋势</h4>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={weeklyTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="week" stroke={C.muted} fontSize={10} tickFormatter={shortWeek} />
            <YAxis stroke={C.muted} fontSize={10} tickFormatter={v => v + '%'} domain={[0, 100]} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => [v + '%', '胜率']} labelFormatter={l => `第${shortWeek(l)}周`} />
            <Line type="monotone" dataKey="winRate" stroke={C.accent} strokeWidth={2.5} dot={{ r: 3, fill: C.accent }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-card border border-border rounded-xl p-3 sm:p-5 shadow-sm">
        <h4 className="text-sm font-bold mb-3">周净盈亏趋势</h4>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={weeklyTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="week" stroke={C.muted} fontSize={10} tickFormatter={shortWeek} />
            <YAxis stroke={C.muted} fontSize={10} tickFormatter={v => '$' + v} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => ['$' + v, '净盈亏']} labelFormatter={l => `第${shortWeek(l)}周`} />
            <Bar dataKey="netPnl" radius={[4, 4, 0, 0]}>
              {weeklyTrend.map((e, i) => <Cell key={i} fill={e.netPnl >= 0 ? C.green : C.red} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
