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
      symbol: 'BINANCE:BTCUSDT',
      theme: theme === 'dark' ? 'dark' : 'light',
      autosize: true,
      style: '1',
      locale: 'en',
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
          <div className="tradingview-widget-container__widget" style={{ height: 'calc(100% - 32px)', width: '100%' }} />
          <div className="tradingview-widget-copyright text-[11px] text-muted px-3 py-2 border-t border-border">
            <a
              href="https://www.tradingview.com/"
              rel="noopener nofollow"
              target="_blank"
              className="hover:text-text"
            >
              <span>Track all markets on TradingView</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(TradingViewChart)
