import React, { useEffect, useRef, useState } from 'react'

/** Keep asynchronous actions visibly pending and reject repeated clicks. */
export function ActionButton({ children, loading = false, disabled, onClick, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  const [pending, setPending] = useState(false)
  const locked = useRef(false)
  const busy = loading || pending
  const [showSpinner, setShowSpinner] = useState(false)
  useEffect(() => { if (!busy) { setShowSpinner(false); return }; const timer = setTimeout(() => setShowSpinner(true), 180); return () => clearTimeout(timer) }, [busy])
  return <button type="button" {...props} className={`gate-button sm-button ${className}`} disabled={disabled || busy} aria-busy={busy || undefined} onClick={async event => {
    if (locked.current || busy) return
    locked.current = true
    try {
      const result = onClick?.(event) as unknown
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        setPending(true)
        await result
      }
    } finally { locked.current = false; setPending(false) }
  }}>{busy && showSpinner ? <span className="sm-busy-indicator" aria-hidden="true" /> : null}{children}</button>
}
