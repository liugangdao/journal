import { useState } from 'react'
import WeeklyNotes from './WeeklyNotes'
import MonthlyNotes from './MonthlyNotes'

export default function NotesTab({ notes, monthlyNotes, onAddNote, onDeleteNote, onAddMonthlyNote, onDeleteMonthlyNote }) {
  const [view, setView] = useState('weekly')

  return (
    <div>
      {/* Segment toggle */}
      <div className="flex bg-card rounded-lg p-1 mb-4 border border-border">
        <button
          onClick={() => setView('weekly')}
          className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all duration-150
            active:scale-[0.97] active:opacity-80
            ${view === 'weekly' ? 'bg-accent text-white shadow-sm' : 'text-muted'}`}
        >
          周度复盘
        </button>
        <button
          onClick={() => setView('monthly')}
          className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all duration-150
            active:scale-[0.97] active:opacity-80
            ${view === 'monthly' ? 'bg-accent text-white shadow-sm' : 'text-muted'}`}
        >
          月度复盘
        </button>
      </div>

      {/* Content */}
      <div key={view} className="mobile-tab-enter">
        {view === 'weekly'
          ? <WeeklyNotes notes={notes} onAdd={onAddNote} onDelete={onDeleteNote} />
          : <MonthlyNotes notes={monthlyNotes} onAdd={onAddMonthlyNote} onDelete={onDeleteMonthlyNote} />
        }
      </div>
    </div>
  )
}
