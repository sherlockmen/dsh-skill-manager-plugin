import React from 'react'
import * as Select from '@radix-ui/react-select'

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'defaultValue' | 'multiple' | 'size'> & {
  value?: string | number
  defaultValue?: string | number
  onChange?: (event: { target: { value: string } }) => void
}

/** One styled, keyboard-accessible select for workbench forms and filters. */
export function WorkbenchSelect({ children, value, defaultValue, onChange, className = '', disabled, required, name, id, ...props }: SelectProps) {
  const options: { value: string; label: React.ReactNode; disabled?: boolean }[] = []
  const collect = (items: React.ReactNode) => React.Children.forEach(items, item => {
    if (!React.isValidElement<{ value?: string | number; children?: React.ReactNode; disabled?: boolean }>(item)) return
    if (item.type === 'option') options.push({ value: String(item.props.value ?? item.props.children ?? ''), label: item.props.children, disabled: item.props.disabled })
    else collect(item.props.children)
  })
  collect(children)
  // Radix reserves the empty string for clearing; business filters use it as a real option.
  const encode = (v: string | number) => `option:${v}`
  return <Select.Root value={value === undefined ? undefined : encode(value)} defaultValue={defaultValue === undefined ? undefined : encode(defaultValue)} disabled={disabled} required={required} name={name} onValueChange={v => onChange?.({ target: { value: v.slice(7) } })}>
    <Select.Trigger id={id} className={`sm-select-trigger ${className}`} aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby']} aria-describedby={props['aria-describedby']} title={props.title}>
      <Select.Value /><Select.Icon asChild><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Content className="sm-select-popup" position="popper" sideOffset={5} collisionPadding={12}>
      <Select.ScrollUpButton className="sm-select-scroll" aria-label="向上滚动">⌃</Select.ScrollUpButton>
      <Select.Viewport>{options.map(option => <Select.Item className="sm-select-option" key={option.value} value={encode(option.value)} disabled={option.disabled}>
        <Select.ItemText>{option.label}</Select.ItemText><Select.ItemIndicator className="sm-select-check"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></Select.ItemIndicator>
      </Select.Item>)}</Select.Viewport>
      <Select.ScrollDownButton className="sm-select-scroll" aria-label="向下滚动">⌄</Select.ScrollDownButton>
    </Select.Content></Select.Portal>
  </Select.Root>
}
