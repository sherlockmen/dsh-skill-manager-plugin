// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ActionButton } from '../src/client/action-button.js'

it('shows pending feedback immediately, ignores double clicks, and becomes usable after completion', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers()
  const host = document.createElement('div'); document.body.appendChild(host)
  const root = createRoot(host)
  let finish!: () => void
  const action = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  try {
    await act(async () => root.render(<ActionButton onClick={action}>保存来源</ActionButton>))
    const button = host.querySelector('button')!
    await act(async () => { button.click(); button.click() })
    expect(action).toHaveBeenCalledOnce()
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.disabled).toBe(true)
    expect(button.querySelector('.sm-busy-indicator')).toBeNull()
    await act(async () => vi.advanceTimersByTime(200))
    expect(button.querySelector('.sm-busy-indicator')).toBeTruthy()
    await act(async () => finish())
    expect(button.disabled).toBe(false)
    expect(button.hasAttribute('aria-busy')).toBe(false)
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers() }
})
