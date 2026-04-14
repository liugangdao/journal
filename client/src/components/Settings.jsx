import { useState } from 'react'
import { api } from '../hooks/useApi'

export default function Settings({ pairs, onPairsChange }) {
  const [name, setName] = useState('')
  const [spreadCost, setSpreadCost] = useState('5')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editSpread, setEditSpread] = useState('')
  const [error, setError] = useState('')

  const handleAdd = async () => {
    if (!name.trim()) return
    try {
      const created = await api.createPair({ name: name.trim(), spread_cost: parseFloat(spreadCost) || 5 })
      onPairsChange([...pairs, created])
      setName('')
      setSpreadCost('5')
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEdit = (pair) => {
    setEditingId(pair.id)
    setEditName(pair.name)
    setEditSpread(String(pair.spread_cost))
  }

  const handleSave = async () => {
    try {
      const updated = await api.updatePair(editingId, {
        name: editName.trim(),
        spread_cost: parseFloat(editSpread) || 5,
      })
      onPairsChange(pairs.map(p => p.id === editingId ? updated : p))
      setEditingId(null)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.deletePair(id)
      onPairsChange(pairs.filter(p => p.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-bold mb-5">品种管理</h2>

      {error && <div className="mb-4 text-red text-sm">{error}</div>}

      {/* Add form */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5 sm:items-end">
        <div>
          <div className="text-[11px] text-muted mb-1">品种名称</div>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="如 EUR/USD"
            className="bg-input text-text border border-border rounded-lg px-3 py-2 text-sm outline-none
              focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all duration-200 w-full sm:w-40"
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
        </div>
        <div>
          <div className="text-[11px] text-muted mb-1">点差成本</div>
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
          添加
        </button>
      </div>

      {/* Pairs table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="px-4 py-3 text-left text-muted text-[11px] font-semibold">品种名称</th>
              <th className="px-4 py-3 text-left text-muted text-[11px] font-semibold">点差成本 (USD/手)</th>
              <th className="px-4 py-3 text-left text-muted text-[11px] font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map(p => (
              <tr key={p.id} className="border-b border-border/50 hover:bg-hover transition-colors duration-150">
                {editingId === p.id ? (
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
                      <button onClick={handleSave} className="text-green hover:text-green/80 cursor-pointer mr-2 transition-colors text-xs">保存</button>
                      <button onClick={() => setEditingId(null)} className="text-muted hover:text-text cursor-pointer transition-colors text-xs">取消</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2.5 font-semibold">{p.name}</td>
                    <td className="px-4 py-2.5 font-mono">{p.spread_cost}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <button onClick={() => handleEdit(p)} className="text-accent hover:text-accent/80 cursor-pointer mr-2 transition-colors text-xs">编辑</button>
                      <button onClick={() => handleDelete(p.id)} className="text-red hover:text-red/80 cursor-pointer transition-colors text-xs">删除</button>
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
