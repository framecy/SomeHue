import { useStore } from '../store'
import type { HistoryEntry } from '../../plugin/messaging'

type Props = {
  onApply: (entry: HistoryEntry) => void
}

function formatDelta(n: number, unit: string): string {
  if (n === 0) return ''
  return (n > 0 ? '+' : '') + n + unit
}

function entryLabel(e: HistoryEntry): string {
  const parts: string[] = []
  const h = formatDelta(e.hDelta, '°')
  const s = formatDelta(e.sDelta, '%')
  const l = formatDelta(e.lDelta, '%')
  if (h) parts.push('H' + h)
  if (s) parts.push('S' + s)
  if (l) parts.push('L' + l)
  return parts.length > 0 ? parts.join(' ') : '±0'
}

export function HistoryStrip({ onApply }: Props) {
  const { history } = useStore()
  if (history.length === 0) return null

  return (
    <div className="flex items-center gap-1 px-4 py-1.5 overflow-x-auto border-t border-[var(--fig-color-border)] scrollbar-none">
      <span className="text-[9px] text-[var(--fig-color-text-secondary)] shrink-0 mr-0.5 select-none">
        历史
      </span>
      {history.map((entry) => (
        <button
          key={entry.savedAt}
          onClick={() => onApply(entry)}
          title={entryLabel(entry)}
          className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded border border-[var(--fig-color-border)] text-[var(--fig-color-text-secondary)] hover:border-[var(--fig-color-text)] hover:text-[var(--fig-color-text)] cursor-pointer whitespace-nowrap transition-colors"
        >
          {entryLabel(entry)}
        </button>
      ))}
    </div>
  )
}
