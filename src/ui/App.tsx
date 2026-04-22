import { useEffect, useCallback, useRef } from 'react'
import { useStore } from './store'
import { Slider } from './components/Slider'
import { ColorWheel } from './components/ColorWheel'
import { SelectionBar } from './components/SelectionBar'
import { ApplyToToggles } from './components/ApplyToToggles'
import { HistoryStrip } from './components/HistoryStrip'
import { Logo } from './components/Logo'
import type { ApplyResult, ColorEntry, HistoryEntry, PluginMessage, ReplaceColorPayload, UIMessage } from '../plugin/messaging'

const PREVIEW_THROTTLE_MS = 50

function post(msg: UIMessage) {
  parent.postMessage({ pluginMessage: msg }, '*')
}

function formatApplyResult(result: ApplyResult): { kind: 'info' | 'warning' | 'success'; text: string } {
  const parts: string[] = []

  if (result.localChanges > 0) parts.push(`本地改动 ${result.localChanges}`)
  if (result.detachedLocals > 0) parts.push(`解绑 ${result.detachedLocals}`)
  if (result.modifiedGlobals > 0) parts.push(`全局修改 ${result.modifiedGlobals}`)
  if (result.skippedRemote > 0) parts.push(`跳过远程资产 ${result.skippedRemote}`)
  if (result.skippedUnsupported > 0) parts.push(`跳过不支持项 ${result.skippedUnsupported}`)

  if (parts.length === 0) {
    return { kind: 'info', text: '没有可应用的颜色改动。' }
  }

  const kind = result.skippedRemote > 0 || result.skippedUnsupported > 0
    ? 'warning'
    : 'success'

  return { kind, text: parts.join(' · ') }
}

export function App() {
  const {
    hDelta, sDelta, lDelta,
    setH, setS, setL,
    resetSliders,
    strictHSL, toggleStrictHSL,
    setSelection,
    setStatus,
    clearStatus,
    buildPayload,
    variableMode,
    applyFills, applyStrokes, applyShadows, applyGradients,
    nested, protectGray,
    setHistory,
  } = useStore()

  const previewTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isPreviewActive = useRef(false)

  // Listen for plugin messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as PluginMessage | undefined
      if (!msg) return
      if (msg.type === 'selection-change') setSelection(msg.info)
      if (msg.type === 'apply-result') setStatus(formatApplyResult(msg.result))
      if (msg.type === 'history') setHistory(msg.items)
      if (msg.type === 'preview-blocked') {
        setStatus({
          kind: 'warning',
          text: 'modify 模式不提供预览，点击"应用"后才会写入本地和全局资产。',
        })
      }
      if (msg.type === 'error') setStatus({ kind: 'warning', text: msg.message })
    }
    window.addEventListener('message', handler)
    post({ type: 'get-selection' })
    post({ type: 'get-history' })
    return () => window.removeEventListener('message', handler)
  }, [setSelection, setStatus, setHistory])

  const sendPreview = useCallback(() => {
    if (variableMode !== 'modify') clearStatus()
    isPreviewActive.current = true
    if (previewTimeout.current) clearTimeout(previewTimeout.current)
    previewTimeout.current = setTimeout(() => {
      post({ type: 'preview', payload: buildPayload() })
    }, PREVIEW_THROTTLE_MS)
  }, [buildPayload, clearStatus, variableMode])

  const onSliderCommit = useCallback(() => {
    if (previewTimeout.current) clearTimeout(previewTimeout.current)
    post({ type: 'preview', payload: buildPayload() })
  }, [buildPayload])

  const handleApply = useCallback(() => {
    if (previewTimeout.current) clearTimeout(previewTimeout.current)
    isPreviewActive.current = false
    const payload = buildPayload()
    post({ type: 'adjust', payload })
    if (payload.hDelta !== 0 || payload.sDelta !== 0 || payload.lDelta !== 0) {
      const entry: HistoryEntry = {
        hDelta: payload.hDelta,
        sDelta: payload.sDelta,
        lDelta: payload.lDelta,
        savedAt: Date.now(),
      }
      post({ type: 'save-history', entry })
      setTimeout(() => post({ type: 'get-history' }), 200)
    }
    resetSliders()
  }, [buildPayload, resetSliders])

  const handleReset = useCallback(() => {
    if (previewTimeout.current) clearTimeout(previewTimeout.current)
    if (isPreviewActive.current) {
      post({ type: 'preview-reset' })
      isPreviewActive.current = false
    }
    clearStatus()
    resetSliders()
  }, [clearStatus, resetSliders])

  const handleBulkShift = useCallback((h: number, s: number, commit: boolean) => {
    setH(h)
    setS(s)
    const payload = { ...buildPayload(), hDelta: h, sDelta: s, lDelta }
    if (commit) {
      if (previewTimeout.current) clearTimeout(previewTimeout.current)
      isPreviewActive.current = false
      post({ type: 'adjust', payload })
      if (h !== 0 || s !== 0 || lDelta !== 0) {
        const entry: HistoryEntry = { hDelta: h, sDelta: s, lDelta, savedAt: Date.now() }
        post({ type: 'save-history', entry })
        setTimeout(() => post({ type: 'get-history' }), 200)
      }
      resetSliders()
    } else {
      isPreviewActive.current = true
      if (previewTimeout.current) clearTimeout(previewTimeout.current)
      previewTimeout.current = setTimeout(() => post({ type: 'preview', payload }), PREVIEW_THROTTLE_MS)
    }
  }, [buildPayload, setH, setS, lDelta, resetSliders])

  const handleSingleReplace = useCallback((from: ColorEntry, to: { r: number; g: number; b: number }, commit: boolean) => {
    const payload: ReplaceColorPayload = {
      from: { r: from.r, g: from.g, b: from.b },
      to,
      applyTo: { fills: applyFills, strokes: applyStrokes, shadows: applyShadows, gradients: applyGradients },
      nested,
      protectGray,
      variableMode,
    }
    if (commit) {
      if (previewTimeout.current) clearTimeout(previewTimeout.current)
      isPreviewActive.current = false
      post({ type: 'replace-color-apply', payload })
    } else {
      isPreviewActive.current = true
      if (previewTimeout.current) clearTimeout(previewTimeout.current)
      previewTimeout.current = setTimeout(() => post({ type: 'replace-color-preview', payload }), PREVIEW_THROTTLE_MS)
    }
  }, [applyFills, applyStrokes, applyShadows, applyGradients, nested, protectGray, variableMode])

  const handleApplyHistory = useCallback((entry: HistoryEntry) => {
    if (previewTimeout.current) clearTimeout(previewTimeout.current)
    isPreviewActive.current = false
    setH(entry.hDelta)
    setS(entry.sDelta)
    setL(entry.lDelta)
    post({
      type: 'adjust',
      payload: { ...buildPayload(), hDelta: entry.hDelta, sDelta: entry.sDelta, lDelta: entry.lDelta },
    })
    resetSliders()
  }, [setH, setS, setL, buildPayload, resetSliders])

  // Global keyboard shortcuts — only when no text input is focused
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Enter') { e.preventDefault(); handleApply() }
      if (e.key === 'Escape') { e.preventDefault(); handleReset() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleApply, handleReset])

  const handleHChange = (v: number) => { setH(v); sendPreview() }
  const handleSChange = (v: number) => { setS(v); sendPreview() }
  const handleLChange = (v: number) => { setL(v); sendPreview() }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--fig-color-bg)] text-[var(--fig-color-text)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--fig-color-border)]">
        <Logo height={20} />
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={toggleStrictHSL}
            className={`text-[10px] px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
              strictHSL
                ? 'border-[var(--fig-color-text)] text-[var(--fig-color-text)]'
                : 'border-[var(--fig-color-border)] text-[var(--fig-color-text-secondary)]'
            }`}
            title={strictHSL ? '当前：严格 HSL 模式' : '当前：OKLCH 感知均匀模式（推荐）'}
          >
            {strictHSL ? 'HSL' : 'OKLCH'}
          </button>
          <button className="text-[var(--fig-color-text-secondary)] hover:text-[var(--fig-color-text)] text-xs cursor-pointer px-1">
            ⚙
          </button>
        </div>
      </div>

      {/* Selection info */}
      <SelectionBar />

      {/* Color wheel */}
      <ColorWheel onBulkShift={handleBulkShift} onSingleReplace={handleSingleReplace} />

      {/* History */}
      <HistoryStrip onApply={handleApplyHistory} />

      {/* Sliders */}
      <div className="px-4 py-2 space-y-0.5 border-t border-[var(--fig-color-border)]">
        <Slider label="色相 H" value={hDelta} min={-180} max={180} onChange={handleHChange} onCommit={onSliderCommit} unit="°"
          trackGradient="linear-gradient(to right, oklch(0.65 0.22 0deg), oklch(0.65 0.22 60deg), oklch(0.65 0.22 120deg), oklch(0.65 0.22 180deg), oklch(0.65 0.22 240deg), oklch(0.65 0.22 300deg), oklch(0.65 0.22 360deg))" />
        <Slider label="饱和 S" value={sDelta} min={-100} max={100} onChange={handleSChange} onCommit={onSliderCommit} unit="%"
          trackGradient="linear-gradient(to right, oklch(0.6 0 0), oklch(0.6 0.08 30deg), oklch(0.6 0.2 30deg), oklch(0.6 0.3 30deg))" />
        <Slider label="明度 L" value={lDelta} min={-100} max={100} onChange={handleLChange} onCommit={onSliderCommit} unit="%"
          trackGradient="linear-gradient(to right, oklch(0.1 0 0), oklch(0.5 0 0), oklch(0.95 0 0))" />
      </div>

      {/* Apply-to toggles */}
      <ApplyToToggles />

      {/* Footer */}
      <div className="mt-auto px-4 py-3 flex items-center justify-between border-t border-[var(--fig-color-border)]">
        <button
          onClick={handleReset}
          className="text-xs text-[var(--fig-color-text-secondary)] hover:text-[var(--fig-color-text)] cursor-pointer px-2 py-1"
        >
          重置滑块
        </button>
        <button
          onClick={handleApply}
          className="text-xs bg-[var(--fig-color-text)] text-[var(--fig-color-bg)] px-4 py-1.5 rounded hover:opacity-80 cursor-pointer transition-opacity font-medium"
        >
          应用
        </button>
      </div>
    </div>
  )
}
