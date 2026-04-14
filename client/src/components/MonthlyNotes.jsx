import { useState } from 'react'
import Input from './ui/Input'
import EmptyState from './EmptyState'

export default function MonthlyNotes({ notes, onAdd, onDelete }) {
  const [form, setForm] = useState({ month: "", lesson: "", plan: "" })

  const add = () => {
    if (!form.month) return
    onAdd(form)
    setForm({ month: "", lesson: "", plan: "" })
  }

  return (
    <div>
      {/* Add form */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6">
        <h3 className="text-base font-bold mb-5">新建月度复盘</h3>
        <div className="space-y-3">
          <div>
            <div className="text-[11px] text-muted mb-1">月份</div>
            <Input value={form.month} onChange={v => setForm(f => ({ ...f, month: v }))} placeholder="例: 2026-02" type="month" />
          </div>
          <div>
            <div className="text-[11px] text-muted mb-1">本月总结</div>
            <textarea
              value={form.lesson}
              onChange={e => setForm(f => ({ ...f, lesson: e.target.value }))}
              placeholder="这个月最大的收获和教训是什么？"
              className="w-full bg-input text-text border border-border rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y outline-none
                focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all duration-200 font-sans"
            />
          </div>
          <div>
            <div className="text-[11px] text-muted mb-1">下月计划</div>
            <textarea
              value={form.plan}
              onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
              placeholder="下个月需要改进什么？"
              className="w-full bg-input text-text border border-border rounded-lg px-3 py-2 text-sm min-h-[60px] resize-y outline-none
                focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all duration-200 font-sans"
            />
          </div>
        </div>
        <button onClick={add}
          className="mt-4 bg-accent text-white px-6 py-2.5 rounded-lg text-sm font-semibold cursor-pointer
            hover:brightness-110 transition-all duration-200">
          保存复盘
        </button>
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <EmptyState type="notes" />
      ) : (
        notes.map(n => (
          <div key={n.id} className="bg-card border border-border rounded-xl p-4 mb-3 hover:border-border/80 transition-all duration-200">
            <div className="flex justify-between items-center mb-3">
              <span className="font-bold text-sm">{n.month}</span>
              <button onClick={() => onDelete(n.id)}
                className="text-red text-xs cursor-pointer hover:text-red/80 transition-colors">
                删除
              </button>
            </div>
            {n.lesson && (
              <div className="mb-2">
                <div className="text-[11px] text-gold font-semibold mb-1">本月总结</div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{n.lesson}</div>
              </div>
            )}
            {n.plan && (
              <div>
                <div className="text-[11px] text-accent font-semibold mb-1">下月计划</div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{n.plan}</div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
