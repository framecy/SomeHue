import { useState, useRef } from 'react'

type Props = {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  onCommit?: () => void
  unit?: string
  trackGradient?: string
}

export function Slider({ label, value, min, max, onChange, onCommit, unit = '', trackGradient }: Props) {
  const pct = ((value - min) / (max - min)) * 100
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)))

  const step = (delta: number) => {
    const next = clamp(value + delta)
    onChange(next)
    onCommit?.()
  }

  const startEdit = () => {
    setDraft(String(value))
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commitEdit = () => {
    const parsed = parseFloat(draft)
    if (!isNaN(parsed)) onChange(clamp(parsed))
    setEditing(false)
    onCommit?.()
  }

  const handleEditKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
    if (e.key === 'Escape') { setEditing(false) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setDraft(d => String(clamp(parseFloat(d || '0') + (e.shiftKey ? 10 : 1)))) }
    if (e.key === 'ArrowDown') { e.preventDefault(); setDraft(d => String(clamp(parseFloat(d || '0') - (e.shiftKey ? 10 : 1)))) }
  }

  const handleSliderKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const s = e.shiftKey ? 10 : 1
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(clamp(value + s)) }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(clamp(value - s)) }
  }

  const sign = value > 0 ? '+' : ''

  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-xs text-[var(--fig-color-text-secondary)] w-10 shrink-0">{label}</span>

      {/* Track */}
      <div className="relative flex-1 h-5 flex items-center min-w-0">
        <div
          className="absolute inset-x-0 h-1.5 rounded-full"
          style={{ background: trackGradient ?? 'var(--fig-color-bg-secondary)' }}
        />
        {!trackGradient && (
          <div
            className="absolute h-1.5 rounded-full bg-[var(--fig-color-text)] opacity-60"
            style={{ width: `${pct}%` }}
          />
        )}
        {min < 0 && !trackGradient && (
          <div
            className="absolute w-px h-2 bg-[var(--fig-color-text-secondary)] opacity-30 pointer-events-none"
            style={{ left: '50%' }}
          />
        )}
        <div
          className="absolute w-3 h-3 rounded-full bg-white border border-black/20 shadow-sm pointer-events-none"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          onMouseUp={onCommit}
          onTouchEnd={onCommit}
          onKeyDown={handleSliderKey}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>

      {/* Stepper: − [value] + — fixed width to align all rows */}
      <div className="flex items-center gap-0.5 shrink-0 w-[5.5rem] justify-end">
        <button
          onClick={() => step(-1)}
          onContextMenu={e => { e.preventDefault(); step(-10) }}
          className="w-4 h-4 flex items-center justify-center rounded text-[var(--fig-color-text-secondary)] hover:bg-[var(--fig-color-bg-secondary)] hover:text-[var(--fig-color-text)] cursor-pointer text-[10px] leading-none select-none"
          title="减 1（右键 -10）"
          tabIndex={-1}
        >−</button>

        <div className="relative flex items-center">
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleEditKey}
              className="w-9 text-center text-xs font-mono bg-[var(--fig-color-bg-secondary)] border border-[var(--fig-color-text)] rounded text-[var(--fig-color-text)] outline-none px-0.5"
              style={{ caretColor: 'var(--fig-color-text)' }}
            />
          ) : (
            <span
              onClick={startEdit}
              className="w-9 text-center text-xs font-mono tabular-nums text-[var(--fig-color-text)] cursor-text hover:bg-[var(--fig-color-bg-secondary)] rounded px-0.5 select-none"
              title="点击编辑"
            >
              {sign}{value}
            </span>
          )}
          <span className="text-[10px] text-[var(--fig-color-text-secondary)] ml-0.5 select-none">{unit}</span>
        </div>

        <button
          onClick={() => step(1)}
          onContextMenu={e => { e.preventDefault(); step(10) }}
          className="w-4 h-4 flex items-center justify-center rounded text-[var(--fig-color-text-secondary)] hover:bg-[var(--fig-color-bg-secondary)] hover:text-[var(--fig-color-text)] cursor-pointer text-[10px] leading-none select-none"
          title="加 1（右键 +10）"
          tabIndex={-1}
        >+</button>
      </div>
    </div>
  )
}
