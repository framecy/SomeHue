import { useStore } from '../store'

type Toggle = {
  label: string
  key: 'applyFills' | 'applyStrokes' | 'applyShadows' | 'applyGradients' | 'nested' | 'protectGray'
  toggle: () => void
}

export function ApplyToToggles() {
  const s = useStore()

  const primary: Toggle[] = [
    { label: '填充', key: 'applyFills', toggle: s.toggleFills },
    { label: '描边', key: 'applyStrokes', toggle: s.toggleStrokes },
    { label: '阴影', key: 'applyShadows', toggle: s.toggleShadows },
    { label: '渐变', key: 'applyGradients', toggle: s.toggleGradients },
  ]

  const secondary: Toggle[] = [
    { label: '嵌套穿透', key: 'nested', toggle: s.toggleNested },
    { label: '保护灰阶', key: 'protectGray', toggle: s.toggleProtectGray },
  ]

  return (
    <div className="px-4 py-2 border-t border-[var(--fig-color-border)] space-y-2">
      <div className="flex gap-1.5 flex-wrap">
        {primary.map(({ label, key, toggle }) => (
          <button
            key={key}
            onClick={toggle}
            className={`text-xs px-2.5 py-1 rounded border cursor-pointer transition-colors ${
              s[key]
                ? 'bg-[var(--fig-color-text)] text-[var(--fig-color-bg)] border-transparent'
                : 'text-[var(--fig-color-text-secondary)] border-[var(--fig-color-border)] hover:border-[var(--fig-color-text)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        {secondary.map(({ label, key, toggle }) => (
          <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none" onClick={toggle}>
            <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${
              s[key] ? 'bg-[var(--fig-color-text)] border-transparent' : 'border-[var(--fig-color-border)]'
            }`}>
              {s[key] && <span className="text-[var(--fig-color-bg)] text-[8px] leading-none">✓</span>}
            </div>
            <span className="text-xs text-[var(--fig-color-text-secondary)]">{label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
