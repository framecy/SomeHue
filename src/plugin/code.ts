import { applyAdjustment, applyReplaceColor, countVariablesInSelection, countColors, collectColors } from './traversal'
import type { UIMessage, SelectionInfo, HistoryEntry } from './messaging'

figma.showUI(__html__, { width: 400, height: 560, title: 'SomeHUE' })

const HISTORY_KEY = 'hsl-history'
const HISTORY_MAX = 10

type NodeSnapshot = {
  fills?: readonly Paint[]
  strokes?: readonly Paint[]
  effects?: readonly Effect[]
  fillStyleId?: string | typeof figma.mixed
  strokeStyleId?: string
  effectStyleId?: string
}
const previewSnapshot: Map<string, NodeSnapshot> = new Map()

function collectSelectionNodes(): SceneNode[] {
  const result: SceneNode[] = []
  const seen = new Set<string>()

  function walk(node: SceneNode) {
    if (seen.has(node.id)) return
    seen.add(node.id)
    result.push(node)
    if ('children' in node) {
      for (const child of node.children) walk(child)
    }
  }

  for (const node of figma.currentPage.selection) walk(node)
  return result
}

function getSelectionInfo(): SelectionInfo {
  const sel = figma.currentPage.selection
  const { variables, styles } = countVariablesInSelection(sel)
  return {
    layerCount: sel.length,
    colorCount: countColors(sel),
    variableCount: variables,
    styleCount: styles,
    hasMixed: false,
    colors: collectColors(sel),
  }
}

function sendSelectionInfo() {
  figma.ui.postMessage({ type: 'selection-change', info: getSelectionInfo() })
}

function snapshotSelection() {
  previewSnapshot.clear()
  for (const node of collectSelectionNodes()) {
    const entry: NodeSnapshot = {}
    if ('fills' in node && Array.isArray(node.fills)) entry.fills = node.fills.slice()
    if ('strokes' in node && Array.isArray(node.strokes)) entry.strokes = node.strokes.slice()
    if ('effects' in node && Array.isArray(node.effects)) entry.effects = node.effects.slice()
    if ('fillStyleId' in node) entry.fillStyleId = node.fillStyleId
    if ('strokeStyleId' in node) entry.strokeStyleId = node.strokeStyleId
    if ('effectStyleId' in node) entry.effectStyleId = node.effectStyleId
    previewSnapshot.set(node.id, entry)
  }
}

function restoreSnapshot() {
  for (const entry of previewSnapshot.entries()) {
    const nodeId = entry[0]
    const snap = entry[1]
    const node = figma.getNodeById(nodeId)
    if (!node) continue
    if ('fills' in node && snap.fills) node.fills = snap.fills as Paint[]
    if ('strokes' in node && snap.strokes) node.strokes = snap.strokes as Paint[]
    if ('effects' in node && snap.effects) node.effects = snap.effects as Effect[]
    if ('fillStyleId' in node && snap.fillStyleId !== undefined) node.fillStyleId = snap.fillStyleId
    if ('strokeStyleId' in node && snap.strokeStyleId !== undefined) node.strokeStyleId = snap.strokeStyleId
    if ('effectStyleId' in node && snap.effectStyleId !== undefined) node.effectStyleId = snap.effectStyleId
  }
}

function handleSelectionChange() {
  if (previewSnapshot.size > 0) {
    restoreSnapshot()
    previewSnapshot.clear()
  }
  sendSelectionInfo()
}

figma.on('selectionchange', handleSelectionChange)
handleSelectionChange()

async function saveHistoryEntry(entry: HistoryEntry): Promise<void> {
  try {
    const raw = await figma.clientStorage.getAsync(HISTORY_KEY)
    const items: HistoryEntry[] = Array.isArray(raw) ? raw : []
    items.unshift(entry)
    if (items.length > HISTORY_MAX) items.length = HISTORY_MAX
    await figma.clientStorage.setAsync(HISTORY_KEY, items)
  } catch {
    return
  }
}

async function sendHistory(): Promise<void> {
  try {
    const raw = await figma.clientStorage.getAsync(HISTORY_KEY)
    const items: HistoryEntry[] = Array.isArray(raw) ? raw : []
    figma.ui.postMessage({ type: 'history', items })
  } catch {
    figma.ui.postMessage({ type: 'history', items: [] })
  }
}

figma.ui.onmessage = (msg: UIMessage) => {
  try {
    const sel = figma.currentPage.selection

    if (msg.type === 'get-selection') {
      sendSelectionInfo()
      return
    }

    if (msg.type === 'get-history') {
      sendHistory()
      return
    }

    if (msg.type === 'save-history') {
      saveHistoryEntry(msg.entry)
      return
    }

    if (msg.type === 'preview') {
      if (msg.payload.variableMode === 'modify') {
        restoreSnapshot()
        previewSnapshot.clear()
        figma.ui.postMessage({ type: 'preview-blocked', reason: 'modify-mode' })
        return
      }

      if (previewSnapshot.size === 0) snapshotSelection()
      restoreSnapshot()
      applyAdjustment(sel, msg.payload)
      return
    }

    if (msg.type === 'preview-reset') {
      restoreSnapshot()
      previewSnapshot.clear()
      return
    }

    if (msg.type === 'adjust') {
      if (previewSnapshot.size > 0) restoreSnapshot()
      previewSnapshot.clear()
      const result = applyAdjustment(sel, msg.payload)
      figma.commitUndo()
      figma.ui.postMessage({ type: 'apply-result', result })
      sendSelectionInfo()
      return
    }

    if (msg.type === 'replace-color-preview') {
      if (msg.payload.variableMode === 'modify') {
        restoreSnapshot()
        previewSnapshot.clear()
        figma.ui.postMessage({ type: 'preview-blocked', reason: 'modify-mode' })
        return
      }
      if (previewSnapshot.size === 0) snapshotSelection()
      restoreSnapshot()
      applyReplaceColor(sel, msg.payload)
      return
    }

    if (msg.type === 'replace-color-apply') {
      if (previewSnapshot.size > 0) restoreSnapshot()
      previewSnapshot.clear()
      const result = applyReplaceColor(sel, msg.payload)
      figma.commitUndo()
      figma.ui.postMessage({ type: 'apply-result', result })
      sendSelectionInfo()
      return
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown plugin error'
    figma.ui.postMessage({ type: 'error', message })
  }
}
