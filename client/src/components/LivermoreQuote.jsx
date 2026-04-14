import { useState, useEffect, useCallback } from 'react'
import { LIVERMORE_QUOTES } from '../lib/constants'

function getRandomIndex(exclude = -1) {
  if (LIVERMORE_QUOTES.length <= 1) return 0
  let idx
  do {
    idx = Math.floor(Math.random() * LIVERMORE_QUOTES.length)
  } while (idx === exclude)
  return idx
}

export default function LivermoreQuote() {
  const [index, setIndex] = useState(() => getRandomIndex())
  const [visible, setVisible] = useState(true)

  const rotate = useCallback(() => {
    setVisible(false)
    setTimeout(() => {
      setIndex(prev => getRandomIndex(prev))
      setVisible(true)
    }, 400)
  }, [])

  useEffect(() => {
    const timer = setInterval(rotate, 8000)
    return () => clearInterval(timer)
  }, [rotate])

  const quote = LIVERMORE_QUOTES[index]

  return (
    <div className="mb-4 px-4 py-3 bg-bg rounded-xl border border-border/50">
      <div
        className={`transition-opacity duration-400 ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        <p className="text-sm italic text-text/80 leading-relaxed">"{quote.zh}"</p>
        <p className="text-xs italic text-muted mt-1 leading-relaxed">"{quote.en}"</p>
        <p className="text-[10px] text-muted/60 mt-1.5 text-right">— Jesse Livermore</p>
      </div>
    </div>
  )
}
