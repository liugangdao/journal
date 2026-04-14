import { useState, useEffect, useRef } from 'react'

export function useCountUp(target, duration = 600) {
  const [value, setValue] = useState(0)
  const prevTarget = useRef(0)

  useEffect(() => {
    const start = prevTarget.current
    const diff = target - start
    if (diff === 0) return

    const startTime = performance.now()
    let rafId

    const step = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(start + diff * eased)

      if (progress < 1) {
        rafId = requestAnimationFrame(step)
      } else {
        prevTarget.current = target
      }
    }

    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, [target, duration])

  return value
}
