import { useState } from 'react'
import { PHASE_LABELS } from '../lib/constants'
import { en } from '../i18n/en'

const CATEGORIES = [
  { key: 'rules', label: en.policy.categories.rules },
  { key: 'strategy', label: en.policy.categories.strategy },
  { key: 'risk', label: en.policy.categories.risk },
]

export default function Policies({ policies = [], setPolicies, storeAdapter }) {
  const [activeCategory, setActiveCategory] = useState('rules')
  const [showForm, setShowForm] = useState(false)
  const [editingExternalId, setEditingExternalId] = useState(null)
  const [form, setForm] = useState({ title: '', content: '', phase: 'both' })
  const [error, setError] = useState('')

  const filtered = policies.filter(p => p.category === activeCategory)

  const resetForm = () => {
    setForm({ title: '', content: '', phase: 'both' })
    setEditingExternalId(null)
    setShowForm(false)
    setError('')
  }

  const handleAdd = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setError(en.trade.requiredFieldsError)
      return
    }
    try {
      const created = await storeAdapter.createPolicy({
        category: activeCategory,
        title: form.title,
        content: form.content,
        phase: form.phase,
        is_active: 1,
        sort_order: policies.length,
      })
      setPolicies(prev => [...prev, created])
      resetForm()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEdit = (policy) => {
    setEditingExternalId(policy.external_id)
    setForm({ title: policy.title, content: policy.content, phase: policy.phase || 'both' })
    setShowForm(true)
    setError('')
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setError(en.trade.requiredFieldsError)
      return
    }
    try {
      const updated = await storeAdapter.updatePolicy(editingExternalId, {
        title: form.title,
        content: form.content,
        phase: form.phase,
      })
      setPolicies(prev => prev.map(p => p.external_id === editingExternalId ? updated : p))
      resetForm()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (externalId) => {
    try {
      await storeAdapter.deletePolicy(externalId)
      setPolicies(prev => prev.filter(p => p.external_id !== externalId))
    } catch (err) {
      setError(err.message)
    }
  }

  const handleToggle = async (policy) => {
    try {
      const updated = await storeAdapter.togglePolicy(policy.external_id, policy.is_active ? 0 : 1)
      setPolicies(prev => prev.map(p => p.external_id === policy.external_id ? updated : p))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-bold mb-5">{en.policy.title}</h2>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-card/80 rounded-xl p-1 mb-5 w-fit">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => { setActiveCategory(cat.key); resetForm() }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer
              ${activeCategory === cat.key
                ? 'bg-accent text-white'
                : 'text-muted hover:text-text hover:bg-hover'
              }`}
          >
            {cat.label}
            <span className="ml-1.5 text-xs opacity-70">
              ({policies.filter(p => p.category === cat.key).length})
            </span>
          </button>
        ))}
      </div>

      {error && <div className="mb-4 text-red text-sm">{error}</div>}

      {/* Policy cards */}
      <div className="space-y-3">
        {filtered.map(policy => (
          <div key={policy.external_id} className={`bg-card border border-border rounded-xl p-4 transition-all duration-200
            ${!policy.is_active ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-sm">{policy.title}</h3>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    policy.phase === 'entry' ? 'bg-accent/15 text-accent'
                      : policy.phase === 'exit' ? 'bg-amber-500/15 text-amber-500'
                      : 'bg-muted/15 text-muted'
                  }`}>
                    {PHASE_LABELS[policy.phase] || en.policy.phases.both}
                  </span>
                </div>
                <p className="text-xs text-muted leading-relaxed">{policy.content}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!policy.is_active}
                  onClick={() => handleToggle(policy)}
                  className={`relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer
                    ${policy.is_active ? 'bg-accent' : 'bg-border'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200
                    ${policy.is_active ? 'translate-x-4' : ''}`} />
                </button>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => handleEdit(policy)}
                className="text-accent hover:text-accent/80 cursor-pointer transition-colors text-xs">{en.common.edit}</button>
              <button onClick={() => handleDelete(policy.external_id)}
                className="text-red hover:text-red/80 cursor-pointer transition-colors text-xs">{en.common.delete}</button>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit form */}
      {showForm ? (
        <div className="mt-4 bg-card border border-border rounded-xl p-4">
          <h4 className="text-sm font-semibold mb-3">{editingExternalId ? en.common.edit : en.policy.addNew}</h4>
          <div className="space-y-3">
            <div>
              <div className="text-[11px] text-muted mb-1">{en.policy.titleField}</div>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder={en.policy.titleField}
                className="w-full bg-input text-text border border-border rounded-lg px-3 py-2 text-sm outline-none
                  focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all duration-200"
              />
            </div>
            <div>
              <div className="text-[11px] text-muted mb-1">{en.policy.contentField}</div>
              <textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder={en.policy.contentField}
                className="w-full bg-input text-text border border-border rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y outline-none
                  focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all duration-200 font-sans"
              />
            </div>
            <div>
              <div className="text-[11px] text-muted mb-1">{en.policy.phase}</div>
              <div className="flex gap-2">
                {Object.entries(PHASE_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, phase: key }))}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer
                      ${form.phase === key
                        ? 'bg-accent text-white'
                        : 'bg-input text-muted border border-border hover:text-text'
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={editingExternalId ? handleSave : handleAdd}
                className="bg-accent text-white px-5 py-2 rounded-lg text-sm font-semibold cursor-pointer
                  hover:brightness-110 transition-all duration-200">
                {editingExternalId ? en.common.save : en.common.add}
              </button>
              <button onClick={resetForm}
                className="text-muted border border-border px-4 py-2 rounded-lg text-sm cursor-pointer
                  hover:text-text hover:border-muted transition-all duration-200">
                {en.common.cancel}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setShowForm(true); setEditingExternalId(null); setForm({ title: '', content: '', phase: 'both' }) }}
          className="mt-4 bg-accent text-white px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer
            hover:brightness-110 transition-all duration-200">
          + {en.policy.addNew}
        </button>
      )}
    </div>
  )
}
