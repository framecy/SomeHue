import { create } from 'zustand'
import type { SelectionInfo, AdjustPayload, HistoryEntry } from '../../plugin/messaging'

type VariableMode = 'skip' | 'detach' | 'modify'
type WheelMode = 'all' | 'single'
export type StatusKind = 'info' | 'warning' | 'success'

export type StatusMessage = {
  kind: StatusKind
  text: string
}

type Store = {
  // Selection
  selection: SelectionInfo | null
  setSelection: (info: SelectionInfo) => void

  // Status
  status: StatusMessage | null
  setStatus: (status: StatusMessage | null) => void
  clearStatus: () => void

  // Sliders
  hDelta: number
  sDelta: number
  lDelta: number
  setH: (v: number) => void
  setS: (v: number) => void
  setL: (v: number) => void
  resetSliders: () => void

  // Apply-to toggles
  applyFills: boolean
  applyStrokes: boolean
  applyShadows: boolean
  applyGradients: boolean
  toggleFills: () => void
  toggleStrokes: () => void
  toggleShadows: () => void
  toggleGradients: () => void

  // Options
  nested: boolean
  protectGray: boolean
  strictHSL: boolean
  toggleNested: () => void
  toggleProtectGray: () => void
  toggleStrictHSL: () => void

  // Variable handling
  variableMode: VariableMode
  setVariableMode: (m: VariableMode) => void

  // Wheel mode
  wheelMode: WheelMode
  setWheelMode: (m: WheelMode) => void
  lockChroma: boolean
  toggleLockChroma: () => void

  // History
  history: HistoryEntry[]
  setHistory: (items: HistoryEntry[]) => void

  // Derived
  buildPayload: () => AdjustPayload
}

export const useStore = create<Store>((set, get) => ({
  selection: null,
  setSelection: (info) => set({ selection: info }),

  status: null,
  setStatus: (status) => set({ status }),
  clearStatus: () => set({ status: null }),

  hDelta: 0,
  sDelta: 0,
  lDelta: 0,
  setH: (v) => set({ hDelta: v }),
  setS: (v) => set({ sDelta: v }),
  setL: (v) => set({ lDelta: v }),
  resetSliders: () => set({ hDelta: 0, sDelta: 0, lDelta: 0 }),

  applyFills: true,
  applyStrokes: true,
  applyShadows: true,
  applyGradients: true,
  toggleFills: () => set(s => ({ applyFills: !s.applyFills })),
  toggleStrokes: () => set(s => ({ applyStrokes: !s.applyStrokes })),
  toggleShadows: () => set(s => ({ applyShadows: !s.applyShadows })),
  toggleGradients: () => set(s => ({ applyGradients: !s.applyGradients })),

  nested: true,
  protectGray: true,
  strictHSL: false,
  toggleNested: () => set(s => ({ nested: !s.nested })),
  toggleProtectGray: () => set(s => ({ protectGray: !s.protectGray })),
  toggleStrictHSL: () => set(s => ({ strictHSL: !s.strictHSL })),

  variableMode: 'skip',
  setVariableMode: (m) => set({ variableMode: m }),

  wheelMode: 'all',
  setWheelMode: (m) => set({ wheelMode: m }),
  lockChroma: false,
  toggleLockChroma: () => set(s => ({ lockChroma: !s.lockChroma })),

  history: [],
  setHistory: (items) => set({ history: items }),

  buildPayload: (): AdjustPayload => {
    const s = get()
    return {
      hDelta: s.hDelta,
      sDelta: s.sDelta,
      lDelta: s.lDelta,
      applyTo: {
        fills: s.applyFills,
        strokes: s.applyStrokes,
        shadows: s.applyShadows,
        gradients: s.applyGradients,
      },
      nested: s.nested,
      protectGray: s.protectGray,
      strictHSL: s.strictHSL,
      variableMode: s.variableMode,
    }
  },
}))
