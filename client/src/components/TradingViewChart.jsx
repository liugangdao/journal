import { useEffect, useRef, memo } from 'react'

function TradingViewChart({ theme = 'dark' }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    // Skip if widget already initialized (StrictMode double-mount)
    if (container.querySelector('iframe')) return

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.type = 'text/javascript'
    script.async = true
    script.innerHTML = JSON.stringify({
      symbol: 'FX:EURUSD',
      theme: theme === 'dark' ? 'dark' : 'light',
      autosize: true,
      style: '1',
      locale: 'zh_CN',
      allow_symbol_change: true,
      hide_side_toolbar: false,
      calendar: false,
      support_host: 'https://www.tradingview.com'
    })
    container.appendChild(script)
  }, [])

  return (
    <div className="hidden md:block mb-4">
      <div className="bg-card border border-border rounded-xl overflow-hidden" style={{ height: 400 }}>
        <div ref={containerRef} className="tradingview-widget-container" style={{ height: '100%', width: '100%' }}>
          <div className="tradingview-widget-container__widget" style={{ height: '100%', width: '100%' }} />
        </div>
      </div>
    </div>
  )
}

export default memo(TradingViewChart)
