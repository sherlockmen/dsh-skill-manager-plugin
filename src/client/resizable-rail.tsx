import React, { useRef, useState } from 'react'

export function ResizableRail({ children, label = '调整导航宽度' }: { children: React.ReactNode; label?: string }) {
  const [width, setWidth] = useState(256)
  const origin = useRef<{ x: number; width: number } | null>(null)
  const bounded = (value: number) => Math.max(176, Math.min(480, value))
  return <div className="sm-resizable-rail" style={{ width }}>
    {children}
    <div className="sm-rail-handle" role="separator" aria-label={label} aria-orientation="vertical" aria-valuemin={176} aria-valuemax={480} aria-valuenow={width} tabIndex={0}
      onDoubleClick={() => setWidth(256)}
      onPointerDown={event => { if (event.button !== 0) return; origin.current = { x: event.clientX, width }; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault() }}
      onPointerMove={event => { if (origin.current) setWidth(bounded(origin.current.width + event.clientX - origin.current.x)) }}
      onPointerUp={() => { origin.current = null }} onPointerCancel={() => { origin.current = null }} onLostPointerCapture={() => { origin.current = null }}
      onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); setWidth(event.key === 'Home' ? 176 : event.key === 'End' ? 480 : bounded(width + (event.key === 'ArrowLeft' ? -16 : 16))) } }} />
  </div>
}
