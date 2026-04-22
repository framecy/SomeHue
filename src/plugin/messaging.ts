export type ColorEntry = {
  r: number
  g: number
  b: number
  count: number
}

export type SelectionInfo = {
  layerCount: number
  colorCount: number
  variableCount: number
  styleCount: number
  hasMixed: boolean
  colors: ColorEntry[]
}

export type ReplaceColorPayload = {
  from: { r: number; g: number; b: number }
  to: { r: number; g: number; b: number }
  applyTo: {
    fills: boolean
    strokes: boolean
    shadows: boolean
    gradients: boolean
  }
  nested: boolean
  protectGray: boolean
  variableMode: 'skip' | 'detach' | 'modify'
}

export type AdjustPayload = {
  hDelta: number
  sDelta: number
  lDelta: number
  applyTo: {
    fills: boolean
    strokes: boolean
    shadows: boolean
    gradients: boolean
  }
  nested: boolean
  protectGray: boolean
  strictHSL: boolean
  variableMode: 'skip' | 'detach' | 'modify'
}

export type ApplyResult = {
  localChanges: number
  detachedLocals: number
  modifiedGlobals: number
  skippedRemote: number
  skippedUnsupported: number
}

export type HistoryEntry = {
  hDelta: number
  sDelta: number
  lDelta: number
  savedAt: number
}

export type PluginMessage =
  | { type: 'selection-change'; info: SelectionInfo }
  | { type: 'apply-result'; result: ApplyResult }
  | { type: 'preview-blocked'; reason: 'modify-mode' }
  | { type: 'history'; items: HistoryEntry[] }
  | { type: 'error'; message: string }

export type UIMessage =
  | { type: 'adjust'; payload: AdjustPayload }
  | { type: 'preview'; payload: AdjustPayload }
  | { type: 'preview-reset' }
  | { type: 'get-selection' }
  | { type: 'get-history' }
  | { type: 'save-history'; entry: HistoryEntry }
  | { type: 'replace-color-preview'; payload: ReplaceColorPayload }
  | { type: 'replace-color-apply'; payload: ReplaceColorPayload }
