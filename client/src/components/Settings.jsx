import { useState } from 'react'
import { en } from '../i18n/en'

export default function Settings({ pairs, onPairsChange, storeAdapter }) {
  const [name, setName] = useState('')
  const [spreadCost, setSpreadCost] = useState('5')
  const [editingExternalId, setEditingExternalId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editSpread, setEditSpread] = useState('')
  const [error, setError] = useState('')

  const handleAdd = async () => {
    if (!name.trim()) return
    try {
      const created = await storeAdapter.createPair({
        name: name.trim(),
        spread_cost: parseFloat(spreadCost) || 5,
        asset_class: 'forex',
        contract_size: 100000,
        price_precision: 5,
        sort_order: pairs.length,
        is_active: 1,
      })
      onPairsChange([...pairs, created])
      setName('')
      setSpreadCost('5')
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEdit = (pair) => {
    setEditingExternalId(pair.external_id)
    setEditName(pair.name)
    setEditSpread(String(pair.spread_cost))
  }

  const handleSave = async () => {
    try {
      const updated = await storeAdapter.updatePair(editingExternalId, {
        name: editName.trim(),
        spread_cost: parseFloat(editSpread) || 5,
      })
      onPairsChange(pairs.map(p => p.external_id === editingExternalId ? updated : p))
      setEditingExternalId(null)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (externalId) => {
    try {
      await storeAdapter.deletePair(externalId)
      onPairsChange(pairs.filter(p => p.external_id !== externalId))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-bold mb-5">{en.settings.pairs}</h2>

      {error && <div className="mb-4 text-red text-sm">{error}</div>}

      {/* Add form */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5 sm:items-end">
        <div>
          <div className="text-[11px] text-muted mb-1">{en.settings.name}</div>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. EUR/USD"
            className="bg-input text-text border border-border rounded-lg px-3 py-2 text-sm outline-none
              focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all duration-200 w-full sm:w-40"
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
        </div>
        <div>
          <div className="text-[11px] text-muted mb-1">{en.settings.spreadCost}</div>
          <input
            value={spreadCost}
            onChange={e => setSpreadCost(e.target.value)}
            placeholder="5"
            className="bg-input text-text border border-border rounded-lg px-3 py-2 text-sm outline-none
              focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all duration-200 w-full sm:w-24"
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
        </div>
        <button
          onClick={handleAdd}
          className="bg-accent text-white px-5 py-2 rounded-lg text-sm font-semibold cursor-pointer
            hover:brightness-110 transition-all duration-200"
        >
          {en.common.add}
        </button>
      </div>

      {/* Pairs table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="px-4 py-3 text-left text-muted text-[11px] font-semibold">{en.settings.name}</th>
              <th className="px-4 py-3 text-left text-muted text-[11px] font-semibold">{en.settings.spreadCost} (USD/lot)</th>
              <th className="px-4 py-3 text-left text-muted text-[11px] font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {pairs.map(p => (
              <tr key={p.external_id} className="border-b border-border/50 hover:bg-hover transition-colors duration-150">
                {editingExternalId === p.external_id ? (
                  <>
                    <td className="px-4 py-2">
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="bg-input text-text border border-border rounded-lg px-2 py-1 text-sm outline-none
                          focus:border-accent focus:ring-1 focus:ring-accent/30 w-36"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editSpread}
                        onChange={e => setEditSpread(e.target.value)}
                        className="bg-input text-text border border-border rounded-lg px-2 py-1 text-sm outline-none
                          focus:border-accent focus:ring-1 focus:ring-accent/30 w-20"
                      />
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <button onClick={handleSave} className="text-green hover:text-green/80 cursor-pointer mr-2 transition-colors text-xs">{en.common.save}</button>
                      <button onClick={() => setEditingExternalId(null)} className="text-muted hover:text-text cursor-pointer transition-colors text-xs">{en.common.cancel}</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2.5 font-semibold">{p.name}</td>
                    <td className="px-4 py-2.5 font-mono">{p.spread_cost}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <button onClick={() => handleEdit(p)} className="text-accent hover:text-accent/80 cursor-pointer mr-2 transition-colors text-xs">{en.common.edit}</button>
                      <button onClick={() => handleDelete(p.external_id)} className="text-red hover:text-red/80 cursor-pointer transition-colors text-xs">{en.common.delete}</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
