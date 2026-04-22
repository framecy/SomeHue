import { useRef, useState, useCallback, useMemo } from 'react'
import { useStore } from '../store'
import { rgbToOKLCH, oklchToRGB, shiftColor } from '../../plugin/color'
import type { ColorEntry } from '../../plugin/messaging'

const SIZE = 160
const RADIUS = 72
const CENTER = SIZE / 2
const MAX_C = 0.3
const WHEEL_L = 0.65

type Props = {
  onBulkShift: (hDelta: number, sDelta: number, commit: boolean) => void
  onSingleReplace: (from: ColorEntry, to: { r: number; g: number; b: number }, commit: boolean) => void
}

type PolarPos = { x: number; y: number; H: number; C: number }

function hcToPos(H: number, C: number): PolarPos {
  const hRad = (H * Math.PI) / 180
  const r = Math.min(C / MAX_C, 1) * RADIUS
  return {
    x: CENTER + r * Math.cos(hRad),
    y: CENTER - r * Math.sin(hRad),
    H,
    C,
  }
}

function rgbToPos(c: { r: number; g: number; b: number }): PolarPos {
  const lch = rgbToOKLCH(c)
  return hcToPos(lch.H, lch.C)
}

function posToHC(x: number, y: number): { H: number; C: number } {
  const dx = x - CENTER
  const dy = CENTER - y
  const r = Math.min(Math.sqrt(dx * dx + dy * dy), RADIUS)
  const H = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
  const C = (r / RADIUS) * MAX_C
  return { H, C }
}

function rgbToCss(c: { r: number; g: number; b: number }): string {
  return `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`
}

function normalizeDeltaH(d: number): number {
  let out = d % 360
  if (out > 180) out -= 360
  if (out < -180) out += 360
  return out
}

type DragState = {
  kind: 'all' | 'single'
  entry: ColorEntry
  startH: number
  startC: number
  overrideRgb: { r: number; g: number; b: number } | null
}

export function ColorWheel({ onBulkShift, onSingleReplace }: Props) {
  const {
    selection,
    wheelMode,
    setWheelMode,
    lockChroma,
    toggleLockChroma,
    hDelta,
    sDelta,
    lDelta,
    strictHSL,
  } = useStore()
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  const colors = useMemo(() => selection?.colors ?? [], [selection])

  const displayed = useMemo(() => {
    return colors.map((entry) => {
      if (drag && drag.kind === 'single' && drag.entry === entry && drag.overrideRgb) {
        return { entry, pos: rgbToPos(drag.overrideRgb), color: drag.overrideRgb }
      }
      const shifted = shiftColor(entry, hDelta, sDelta, lDelta, strictHSL)
      return { entry, pos: rgbToPos(shifted), color: shifted }
    })
  }, [colors, hDelta, sDelta, lDelta, strictHSL, drag])

  const getEventPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * SIZE,
      y: ((clientY - rect.top) / rect.height) * SIZE,
    }
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, entry: ColorEntry) => {
      e.stopPropagation()
      const src = rgbToOKLCH(entry)
      setDrag({
        kind: wheelMode,
        entry,
        startH: src.H,
        startC: src.C,
        overrideRgb: null,
      })
      ;(e.target as Element).setPointerCapture(e.pointerId)
    },
    [wheelMode],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return
      const pt = getEventPoint(e.clientX, e.clientY)
      if (!pt) return
      const { H, C } = posToHC(pt.x, pt.y)
      const effectiveC = lockChroma ? drag.startC : C
      const dH = normalizeDeltaH(H - drag.startH)
      const dC = lockChroma ? 0 : effectiveC - drag.startC

      if (drag.kind === 'all') {
        const sDeltaOut = Math.round((dC / MAX_C) * 100)
        onBulkShift(Math.round(dH), sDeltaOut, false)
      } else {
        const src = rgbToOKLCH(drag.entry)
        const newRgb = oklchToRGB(src.L, Math.max(0, Math.min(MAX_C, effectiveC)), H)
        setDrag({ ...drag, overrideRgb: newRgb })
        onSingleReplace(drag.entry, newRgb, false)
      }
    },
    [drag, getEventPoint, onBulkShift, onSingleReplace, lockChroma],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return
      const pt = getEventPoint(e.clientX, e.clientY)
      if (pt) {
        const { H, C } = posToHC(pt.x, pt.y)
        const effectiveC = lockChroma ? drag.startC : C
        const dH = normalizeDeltaH(H - drag.startH)
        const dC = lockChroma ? 0 : effectiveC - drag.startC

        if (drag.kind === 'all') {
          const sDeltaOut = Math.round((dC / MAX_C) * 100)
          onBulkShift(Math.round(dH), sDeltaOut, true)
        } else {
          const src = rgbToOKLCH(drag.entry)
          const newRgb = oklchToRGB(src.L, Math.max(0, Math.min(MAX_C, effectiveC)), H)
          onSingleReplace(drag.entry, newRgb, true)
        }
      }
      setDrag(null)
    },
    [drag, getEventPoint, onBulkShift, onSingleReplace, lockChroma],
  )

  if (!selection || colors.length === 0) return null

  return (
    <div className="flex flex-col items-center gap-2 px-4 py-3 border-t border-[var(--fig-color-border)]">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from 90deg, oklch(${WHEEL_L} ${MAX_C} 0deg), oklch(${WHEEL_L} ${MAX_C} 60deg), oklch(${WHEEL_L} ${MAX_C} 120deg), oklch(${WHEEL_L} ${MAX_C} 180deg), oklch(${WHEEL_L} ${MAX_C} 240deg), oklch(${WHEEL_L} ${MAX_C} 300deg), oklch(${WHEEL_L} ${MAX_C} 360deg))`,
          }}
        />
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, oklch(${WHEEL_L} 0 0) 0%, oklch(${WHEEL_L} 0 0 / 0) 70%)`,
          }}
        />
        <svg
          ref={svgRef}
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="absolute inset-0"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {displayed.map(({ entry, pos, color }, i) => (
            <circle
              key={i}
              cx={pos.x}
              cy={pos.y}
              r={6}
              fill={rgbToCss(color)}
              stroke="white"
              strokeWidth={1.5}
              className="cursor-grab active:cursor-grabbing"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
              onPointerDown={(e) => handlePointerDown(e, entry)}
            />
          ))}
        </svg>
      </div>

      <div className="flex items-center gap-1 text-[10px]">
        <button
          onClick={() => setWheelMode('all')}
          className={`px-2 py-0.5 rounded border cursor-pointer transition-colors ${
            wheelMode === 'all'
              ? 'bg-[var(--fig-color-text)] text-[var(--fig-color-bg)] border-transparent'
              : 'text-[var(--fig-color-text-secondary)] border-[var(--fig-color-border)] hover:border-[var(--fig-color-text)]'
          }`}
        >
          全部
        </button>
        <button
          onClick={() => setWheelMode('single')}
          className={`px-2 py-0.5 rounded border cursor-pointer transition-colors ${
            wheelMode === 'single'
              ? 'bg-[var(--fig-color-text)] text-[var(--fig-color-bg)] border-transparent'
              : 'text-[var(--fig-color-text-secondary)] border-[var(--fig-color-border)] hover:border-[var(--fig-color-text)]'
          }`}
        >
          单色
        </button>
        <button
          onClick={toggleLockChroma}
          title={lockChroma ? '已锁定饱和度：拖拽仅改变色相' : '拖拽时同时改变色相与饱和度'}
          className={`ml-1 px-2 py-0.5 rounded border cursor-pointer transition-colors ${
            lockChroma
              ? 'bg-[var(--fig-color-text)] text-[var(--fig-color-bg)] border-transparent'
              : 'text-[var(--fig-color-text-secondary)] border-[var(--fig-color-border)] hover:border-[var(--fig-color-text)]'
          }`}
        >
          {lockChroma ? '锁定饱和 ●' : '锁定饱和 ○'}
        </button>
      </div>
    </div>
  )
}
