import { act } from 'react'
import { expect } from 'vitest'

// jsdom has no scrolling/layout or Pointer Capture; these are browser APIs used by Radix.
HTMLElement.prototype.scrollIntoView ??= () => {}
HTMLElement.prototype.hasPointerCapture ??= () => false
HTMLElement.prototype.setPointerCapture ??= () => {}
HTMLElement.prototype.releasePointerCapture ??= () => {}
export async function chooseOption(trigger: HTMLElement, label: string | RegExp) {
  expect(trigger).toBeTruthy()
  await act(async () => { trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })) })
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item => typeof label === 'string' ? item.textContent?.trim() === label : label.test(item.textContent || ''))
  expect(option, String(label)).toBeTruthy()
  await act(async () => { option!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
}
