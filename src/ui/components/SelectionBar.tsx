import { useStore } from '../store'

export function SelectionBar() {
  const { selection, status, variableMode, setVariableMode } = useStore()

  if (!selection) {
    return (
      <div className="px-4 py-2 text-xs text-[var(--fig-color-text-secondary)]">
        未选中任何图层
      </div>
    )
  }

  const { layerCount, colorCount, variableCount, styleCount } = selection
  const hasBinding = variableCount > 0 || styleCount > 0

  return (
    <div className="px-4 py-2 border-b border-[var(--fig-color-border)]">
      <div className="text-xs text-[var(--fig-color-text-secondary)]">
        {layerCount} 个图层
        {colorCount > 0 && ` · ${colorCount} 种颜色`}
        {variableCount > 0 && ` · ${variableCount} 个变量`}
        {styleCount > 0 && ` · ${styleCount} 个样式`}
      </div>

      {hasBinding && (
        <div className="flex gap-1 mt-1.5">
          {(['skip', 'detach', 'modify'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setVariableMode(mode)}
              className={`text-[10px] px-2 py-0.5 rounded border cursor-pointer transition-colors ${
                variableMode === mode
                  ? 'bg-[var(--fig-color-text)] text-[var(--fig-color-bg)] border-transparent'
                  : 'text-[var(--fig-color-text-secondary)] border-[var(--fig-color-border)] hover:border-[var(--fig-color-text)]'
              }`}
            >
              {mode === 'skip' ? '跳过' : mode === 'detach' ? '解绑后改' : '改变量本身'}
            </button>
          ))}
        </div>
      )}

      {status && (
        <div
          className={`mt-2 text-[10px] leading-4 ${
            status.kind === 'warning'
              ? 'text-amber-600'
              : status.kind === 'success'
                ? 'text-emerald-600'
                : 'text-[var(--fig-color-text-secondary)]'
          }`}
        >
          {status.text}
        </div>
      )}
    </div>
  )
}
