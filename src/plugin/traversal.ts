import { shiftColor, isGray } from './color'
import type { AdjustPayload, ApplyResult, ColorEntry, ReplaceColorPayload } from './messaging'

type PaintSurface = 'fills' | 'strokes'

type ApplyStats = {
  localChanges: number
  detachedLocals: number
  modifiedGlobalKeys: Set<string>
  skippedRemoteKeys: Set<string>
  skippedUnsupportedKeys: Set<string>
}

type VariableBinding = {
  alias: VariableAlias | null
  variable: Variable | null
}

function createApplyStats(): ApplyStats {
  return {
    localChanges: 0,
    detachedLocals: 0,
    modifiedGlobalKeys: new Set(),
    skippedRemoteKeys: new Set(),
    skippedUnsupportedKeys: new Set(),
  }
}

function finalizeApplyStats(stats: ApplyStats): ApplyResult {
  return {
    localChanges: stats.localChanges,
    detachedLocals: stats.detachedLocals,
    modifiedGlobals: stats.modifiedGlobalKeys.size,
    skippedRemote: stats.skippedRemoteKeys.size,
    skippedUnsupported: stats.skippedUnsupportedKeys.size,
  }
}

function flattenNodes(nodes: readonly SceneNode[]): SceneNode[] {
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

  for (const node of nodes) walk(node)
  return result
}

function dedupeNodes(nodes: readonly SceneNode[]): SceneNode[] {
  const seen = new Set<string>()
  const result: SceneNode[] = []

  for (const node of nodes) {
    if (seen.has(node.id)) continue
    seen.add(node.id)
    result.push(node)
  }

  return result
}

export function applyAdjustment(nodes: readonly SceneNode[], payload: AdjustPayload): ApplyResult {
  const toProcess = payload.nested ? flattenNodes(nodes) : dedupeNodes(nodes)
  const stats = createApplyStats()

  for (const node of toProcess) processNode(node, payload, stats)

  return finalizeApplyStats(stats)
}

function processNode(node: SceneNode, payload: AdjustPayload, stats: ApplyStats): void {
  if (shouldProcessPaintSurface('fills', payload) && 'fills' in node && Array.isArray(node.fills)) {
    processPaintSurface(node, 'fills', node.fills, payload, stats)
  }

  if (shouldProcessPaintSurface('strokes', payload) && 'strokes' in node && Array.isArray(node.strokes)) {
    processPaintSurface(node, 'strokes', node.strokes, payload, stats)
  }

  if (payload.applyTo.shadows && 'effects' in node && Array.isArray(node.effects)) {
    processEffectSurface(node, node.effects, payload, stats)
  }
}

function processPaintSurface(
  node: SceneNode,
  surface: PaintSurface,
  paints: readonly Paint[],
  payload: AdjustPayload,
  stats: ApplyStats,
): void {
  const styleId = getPaintStyleId(node, surface)

  if (styleId) {
    const style = figma.getStyleById(styleId)

    if (style && style.type === 'PAINT') {
      processPaintStyleSurface(node, surface, paints, style, payload, stats)
      return
    }

    if (payload.variableMode === 'modify') {
      recordSkippedUnsupported(stats, `missing-style:${styleId}`)
      return
    }

    if (payload.variableMode === 'skip') return

    if (!hasTargetablePaints(surface, paints, payload)) return

    const detached = detachPaintBindings(paints)
    const result = transformDetachedPaints(detached, surface, payload, stats)
    setNodePaints(node, surface, result.paints)
    clearPaintStyle(node, surface)
    stats.detachedLocals += 1
    return
  }

  const result = transformNodePaints(node, paints, surface, payload, stats)
  if (result.changed) setNodePaints(node, surface, result.paints)
}

function processPaintStyleSurface(
  node: SceneNode,
  surface: PaintSurface,
  paints: readonly Paint[],
  style: PaintStyle,
  payload: AdjustPayload,
  stats: ApplyStats,
): void {
  if (!hasTargetablePaints(surface, paints, payload)) return

  if (payload.variableMode === 'skip') return

  if (payload.variableMode === 'detach') {
    const detached = detachPaintBindings(paints)
    const result = transformDetachedPaints(detached, surface, payload, stats)
    setNodePaints(node, surface, result.paints)
    clearPaintStyle(node, surface)
    stats.detachedLocals += 1
    return
  }

  if (style.remote) {
    recordSkippedRemote(stats, `style:${style.id}`)
    return
  }

  if (paintStyleHasBoundVariables(style)) {
    recordSkippedUnsupported(stats, `style:${style.id}`)
    return
  }

  if (stats.modifiedGlobalKeys.has(`style:${style.id}`)) return

  const result = transformDetachedPaints(style.paints, surface, payload, null)
  if (!result.changed) return

  style.paints = result.paints
  stats.modifiedGlobalKeys.add(`style:${style.id}`)
}

function processEffectSurface(
  node: SceneNode,
  effects: readonly Effect[],
  payload: AdjustPayload,
  stats: ApplyStats,
): void {
  const styleId = getEffectStyleId(node)

  if (styleId) {
    const style = figma.getStyleById(styleId)

    if (style && style.type === 'EFFECT') {
      processEffectStyleSurface(node, effects, style, payload, stats)
      return
    }

    if (payload.variableMode === 'modify') {
      recordSkippedUnsupported(stats, `missing-effect-style:${styleId}`)
      return
    }

    if (payload.variableMode === 'skip') return

    if (!hasTargetableEffects(effects)) return

    const detached = detachEffectBindings(effects)
    const result = transformDetachedEffects(detached, payload, stats)
    setNodeEffects(node, result.effects)
    clearEffectStyle(node)
    stats.detachedLocals += 1
    return
  }

  const result = transformNodeEffects(node, effects, payload, stats)
  if (result.changed) setNodeEffects(node, result.effects)
}

function processEffectStyleSurface(
  node: SceneNode,
  effects: readonly Effect[],
  style: EffectStyle,
  payload: AdjustPayload,
  stats: ApplyStats,
): void {
  if (!hasTargetableEffects(effects)) return

  if (payload.variableMode === 'skip') return

  if (payload.variableMode === 'detach') {
    const detached = detachEffectBindings(effects)
    const result = transformDetachedEffects(detached, payload, stats)
    setNodeEffects(node, result.effects)
    clearEffectStyle(node)
    stats.detachedLocals += 1
    return
  }

  if (style.remote) {
    recordSkippedRemote(stats, `style:${style.id}`)
    return
  }

  if (effectStyleHasBoundVariables(style)) {
    recordSkippedUnsupported(stats, `style:${style.id}`)
    return
  }

  if (stats.modifiedGlobalKeys.has(`style:${style.id}`)) return

  const result = transformDetachedEffects(style.effects, payload, null)
  if (!result.changed) return

  style.effects = result.effects
  stats.modifiedGlobalKeys.add(`style:${style.id}`)
}

function transformNodePaints(
  node: SceneNode,
  paints: readonly Paint[],
  surface: PaintSurface,
  payload: AdjustPayload,
  stats: ApplyStats,
): { paints: Paint[]; changed: boolean } {
  let changed = false

  const next = paints.map((paint, index) => {
    const result = transformNodePaint(node, paint, surface, index, payload, stats)
    changed = changed || result.changed
    return result.paint
  })

  return { paints: next, changed }
}

function transformNodePaint(
  node: SceneNode,
  paint: Paint,
  surface: PaintSurface,
  index: number,
  payload: AdjustPayload,
  stats: ApplyStats,
): { paint: Paint; changed: boolean } {
  if (paint.type === 'SOLID') {
    if (!isTargetableSolid(surface, payload)) return { paint, changed: false }

    const binding = getPaintVariable(node, paint, surface, index)
    if (!binding.alias) return shiftSolidPaint(paint, payload, stats)

    if (payload.variableMode === 'skip') return { paint, changed: false }

    if (payload.variableMode === 'detach') {
      const detached = figma.variables.setBoundVariableForPaint(paint, 'color', null)
      stats.detachedLocals += 1
      return shiftSolidPaint(detached, payload, stats)
    }

    if (!binding.variable) {
      recordSkippedUnsupported(stats, `missing-variable:${binding.alias.id}`)
      return { paint, changed: false }
    }

    modifyVariable(binding.variable, payload, stats)
    return { paint, changed: false }
  }

  if (isGradientPaint(paint) && payload.applyTo.gradients) {
    return shiftGradientPaint(paint, payload, stats)
  }

  return { paint, changed: false }
}

function transformDetachedPaints(
  paints: readonly Paint[],
  surface: PaintSurface,
  payload: AdjustPayload,
  stats: ApplyStats | null,
): { paints: Paint[]; changed: boolean } {
  let changed = false

  const next = paints.map((paint) => {
    if (paint.type === 'SOLID') {
      const detached = paint.boundVariables?.color
        ? figma.variables.setBoundVariableForPaint(paint, 'color', null)
        : paint

      if (!isTargetableSolid(surface, payload)) return detached

      const result = shiftSolidPaint(detached, payload, stats)
      changed = changed || result.changed || detached !== paint
      return result.paint
    }

    if (isGradientPaint(paint) && payload.applyTo.gradients) {
      const result = shiftGradientPaint(paint, payload, stats)
      changed = changed || result.changed
      return result.paint
    }

    return paint
  })

  return { paints: next, changed }
}

function transformNodeEffects(
  node: SceneNode,
  effects: readonly Effect[],
  payload: AdjustPayload,
  stats: ApplyStats,
): { effects: Effect[]; changed: boolean } {
  let changed = false

  const next = effects.map((effect, index) => {
    const result = transformNodeEffect(node, effect, index, payload, stats)
    changed = changed || result.changed
    return result.effect
  })

  return { effects: next, changed }
}

function transformNodeEffect(
  node: SceneNode,
  effect: Effect,
  index: number,
  payload: AdjustPayload,
  stats: ApplyStats,
): { effect: Effect; changed: boolean } {
  if (!isTargetableShadow(effect)) return { effect, changed: false }

  const binding = getEffectVariable(node, effect, index)
  if (!binding.alias) return shiftShadowEffect(effect, payload, stats)

  if (payload.variableMode === 'skip') return { effect, changed: false }

  if (payload.variableMode === 'detach') {
    const detached = figma.variables.setBoundVariableForEffect(effect, 'color', null)
    stats.detachedLocals += 1
    return shiftShadowEffect(detached, payload, stats)
  }

  if (!binding.variable) {
    recordSkippedUnsupported(stats, `missing-variable:${binding.alias.id}`)
    return { effect, changed: false }
  }

  modifyVariable(binding.variable, payload, stats)
  return { effect, changed: false }
}

function transformDetachedEffects(
  effects: readonly Effect[],
  payload: AdjustPayload,
  stats: ApplyStats | null,
): { effects: Effect[]; changed: boolean } {
  let changed = false

  const next = effects.map((effect) => {
    if (!isTargetableShadow(effect)) return effect

    const detached = effect.boundVariables?.color
      ? figma.variables.setBoundVariableForEffect(effect, 'color', null)
      : effect

    const result = shiftShadowEffect(detached, payload, stats)
    changed = changed || result.changed || detached !== effect
    return result.effect
  })

  return { effects: next, changed }
}

function modifyVariable(variable: Variable, payload: AdjustPayload, stats: ApplyStats): void {
  const key = `variable:${variable.id}`
  if (stats.modifiedGlobalKeys.has(key)) return

  if (variable.remote) {
    recordSkippedRemote(stats, key)
    return
  }

  if (variable.resolvedType !== 'COLOR' || variableHasAliasValues(variable)) {
    recordSkippedUnsupported(stats, key)
    return
  }

  const modeIds = Object.keys(variable.valuesByMode)
  const nextValues: Record<string, RGB | RGBA> = {}
  let changed = false

  for (let i = 0; i < modeIds.length; i++) {
    const modeId = modeIds[i]
    const value = variable.valuesByMode[modeId]
    if (!isColorVariableValue(value)) {
      recordSkippedUnsupported(stats, key)
      return
    }

    const shifted = shiftVariableColor(value, payload)
    changed = changed || !sameColorValue(value, shifted)
    nextValues[modeId] = shifted
  }

  if (!changed) return

  for (let i = 0; i < modeIds.length; i++) {
    const modeId = modeIds[i]
    variable.setValueForMode(modeId, nextValues[modeId])
  }

  stats.modifiedGlobalKeys.add(key)
}

function shiftSolidPaint(
  paint: SolidPaint,
  payload: AdjustPayload,
  stats: ApplyStats | null,
): { paint: SolidPaint; changed: boolean } {
  if (payload.protectGray && isGray(paint.color)) return { paint, changed: false }

  const color = shiftColor(paint.color, payload.hDelta, payload.sDelta, payload.lDelta, payload.strictHSL)
  if (sameRGB(paint.color, color)) return { paint, changed: false }

  if (stats) stats.localChanges += 1
  return { paint: Object.assign({}, paint, { color }), changed: true }
}

function shiftGradientPaint(
  paint: GradientPaint,
  payload: AdjustPayload,
  stats: ApplyStats | null,
): { paint: GradientPaint; changed: boolean } {
  let changed = false

  const gradientStops = paint.gradientStops.map((stop) => {
    if (payload.protectGray && isGray(stop.color)) return cloneGradientStop(stop)

    const color = shiftRGBA(stop.color, payload)
    if (sameRGBA(stop.color, color)) return cloneGradientStop(stop)

    changed = true
    return Object.assign(cloneGradientStop(stop), { color })
  })

  if (!changed) return { paint, changed: false }

  if (stats) stats.localChanges += 1
  return { paint: cloneGradientPaint(paint, gradientStops), changed: true }
}

function cloneGradientStop(stop: ColorStop): ColorStop {
  return {
    position: stop.position,
    color: { r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a },
  }
}

function cloneGradientPaint(paint: GradientPaint, gradientStops: ColorStop[]): GradientPaint {
  const t = paint.gradientTransform
  const next: GradientPaint = {
    type: paint.type,
    gradientStops,
    gradientTransform: [
      [t[0][0], t[0][1], t[0][2]],
      [t[1][0], t[1][1], t[1][2]],
    ],
    opacity: paint.opacity,
    blendMode: paint.blendMode,
    visible: paint.visible,
  }
  return next
}

function shiftShadowEffect(
  effect: Effect,
  payload: AdjustPayload,
  stats: ApplyStats | null,
): { effect: Effect; changed: boolean } {
  if (!isTargetableShadow(effect)) return { effect, changed: false }
  if (payload.protectGray && isGray(effect.color)) return { effect, changed: false }

  const color = shiftRGBA(effect.color, payload)
  if (sameRGBA(effect.color, color)) return { effect, changed: false }

  if (stats) stats.localChanges += 1
  return { effect: Object.assign({}, effect, { color }), changed: true }
}

function shiftVariableColor(value: RGB | RGBA, payload: AdjustPayload): RGB | RGBA {
  const shifted = shiftColor(value, payload.hDelta, payload.sDelta, payload.lDelta, payload.strictHSL)
  return 'a' in value ? Object.assign({}, shifted, { a: value.a }) : shifted
}

function shiftRGBA(color: RGBA, payload: AdjustPayload): RGBA {
  const shifted = shiftColor(color, payload.hDelta, payload.sDelta, payload.lDelta, payload.strictHSL)
  return Object.assign({}, shifted, { a: color.a })
}

function detachPaintBindings(paints: readonly Paint[]): Paint[] {
  return paints.map((paint) => {
    if (paint.type === 'SOLID' && paint.boundVariables?.color) {
      return figma.variables.setBoundVariableForPaint(paint, 'color', null)
    }
    return paint
  })
}

function detachEffectBindings(effects: readonly Effect[]): Effect[] {
  return effects.map((effect) => {
    if (isTargetableShadow(effect) && effect.boundVariables?.color) {
      return figma.variables.setBoundVariableForEffect(effect, 'color', null)
    }
    return effect
  })
}

function getPaintVariable(
  node: SceneNode,
  paint: SolidPaint,
  surface: PaintSurface,
  index: number,
): VariableBinding {
  const alias = paint.boundVariables?.color ?? getNodePaintAlias(node, surface, index)
  if (!alias) return { alias: null, variable: null }
  return { alias, variable: figma.variables.getVariableById(alias.id) }
}

function getEffectVariable(node: SceneNode, effect: Effect, index: number): VariableBinding {
  if (!isTargetableShadow(effect)) return { alias: null, variable: null }
  const alias = effect.boundVariables?.color ?? getNodeEffectAlias(node, index)
  if (!alias) return { alias: null, variable: null }
  return { alias, variable: figma.variables.getVariableById(alias.id) }
}

function getNodePaintAlias(
  node: SceneNode,
  surface: PaintSurface,
  index: number,
): VariableAlias | null {
  if (!('boundVariables' in node) || !node.boundVariables) return null

  const bound = surface === 'fills' ? node.boundVariables.fills : node.boundVariables.strokes
  if (!Array.isArray(bound)) return null

  return bound[index] ?? null
}

function getNodeEffectAlias(node: SceneNode, index: number): VariableAlias | null {
  if (!('boundVariables' in node) || !node.boundVariables || !Array.isArray(node.boundVariables.effects)) {
    return null
  }

  return node.boundVariables.effects[index] ?? null
}

function shouldProcessPaintSurface(surface: PaintSurface, payload: AdjustPayload): boolean {
  return surface === 'fills'
    ? payload.applyTo.fills || payload.applyTo.gradients
    : payload.applyTo.strokes || payload.applyTo.gradients
}

function hasTargetablePaints(
  surface: PaintSurface,
  paints: readonly Paint[],
  payload: AdjustPayload,
): boolean {
  return paints.some((paint) => (
    (paint.type === 'SOLID' && isTargetableSolid(surface, payload)) ||
    (isGradientPaint(paint) && payload.applyTo.gradients)
  ))
}

function hasTargetableEffects(effects: readonly Effect[]): boolean {
  return effects.some(isTargetableShadow)
}

function isTargetableSolid(surface: PaintSurface, payload: AdjustPayload): boolean {
  return surface === 'fills' ? payload.applyTo.fills : payload.applyTo.strokes
}

function isTargetableShadow(effect: Effect): effect is DropShadowEffect | InnerShadowEffect {
  return effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW'
}

function isGradientPaint(paint: Paint): paint is GradientPaint {
  return (
    paint.type === 'GRADIENT_LINEAR' ||
    paint.type === 'GRADIENT_RADIAL' ||
    paint.type === 'GRADIENT_ANGULAR' ||
    paint.type === 'GRADIENT_DIAMOND'
  )
}

function getPaintStyleId(node: SceneNode, surface: PaintSurface): string | null {
  if (surface === 'fills' && 'fillStyleId' in node && typeof node.fillStyleId === 'string' && node.fillStyleId) {
    return node.fillStyleId
  }

  if (surface === 'strokes' && 'strokeStyleId' in node && node.strokeStyleId) {
    return node.strokeStyleId
  }

  return null
}

function clearPaintStyle(node: SceneNode, surface: PaintSurface): void {
  if (surface === 'fills' && 'fillStyleId' in node) node.fillStyleId = ''
  if (surface === 'strokes' && 'strokeStyleId' in node) node.strokeStyleId = ''
}

function setNodePaints(node: SceneNode, surface: PaintSurface, paints: Paint[]): void {
  if (surface === 'fills' && 'fills' in node) node.fills = paints
  if (surface === 'strokes' && 'strokes' in node) node.strokes = paints
}

function getEffectStyleId(node: SceneNode): string | null {
  if ('effectStyleId' in node && node.effectStyleId) return node.effectStyleId
  return null
}

function clearEffectStyle(node: SceneNode): void {
  if ('effectStyleId' in node) node.effectStyleId = ''
}

function setNodeEffects(node: SceneNode, effects: Effect[]): void {
  if ('effects' in node) node.effects = effects
}

function paintStyleHasBoundVariables(style: PaintStyle): boolean {
  if (style.boundVariables && hasAliasArray(Object.values(style.boundVariables))) return true
  return style.paints.some((paint) => paint.type === 'SOLID' && Boolean(paint.boundVariables?.color))
}

function effectStyleHasBoundVariables(style: EffectStyle): boolean {
  if (style.boundVariables && hasAliasArray(Object.values(style.boundVariables))) return true
  return style.effects.some((effect) => isTargetableShadow(effect) && Boolean(effect.boundVariables?.color))
}

function hasAliasArray(values: unknown[]): boolean {
  return values.some((value) => Array.isArray(value) && value.length > 0)
}

function variableHasAliasValues(variable: Variable): boolean {
  return Object.values(variable.valuesByMode).some((value) => (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'VARIABLE_ALIAS'
  ))
}

function isColorVariableValue(value: VariableValue): value is RGB | RGBA {
  return (
    typeof value === 'object' &&
    value !== null &&
    'r' in value &&
    'g' in value &&
    'b' in value
  )
}

function sameColorValue(a: RGB | RGBA, b: RGB | RGBA): boolean {
  if (!sameRGB(a, b)) return false
  return ('a' in a ? a.a : 1) === ('a' in b ? b.a : 1)
}

function sameRGB(a: RGB, b: RGB): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b
}

function sameRGBA(a: RGBA, b: RGBA): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a
}

function recordSkippedRemote(stats: ApplyStats, key: string): void {
  stats.skippedRemoteKeys.add(key)
}

function recordSkippedUnsupported(stats: ApplyStats, key: string): void {
  stats.skippedUnsupportedKeys.add(key)
}

export function countVariablesInSelection(nodes: readonly SceneNode[]): { variables: number; styles: number } {
  let variables = 0
  let styles = 0

  for (const node of flattenNodes(nodes)) {
    if ('boundVariables' in node && node.boundVariables) {
      const bound = node.boundVariables as Record<string, unknown>
      if (bound.fills) variables++
      if (bound.strokes) variables++
      if (bound.effects) variables++
    }
    if ('fillStyleId' in node && node.fillStyleId && typeof node.fillStyleId === 'string') styles++
    if ('strokeStyleId' in node && node.strokeStyleId && typeof node.strokeStyleId === 'string') styles++
    if ('effectStyleId' in node && node.effectStyleId && typeof node.effectStyleId === 'string') styles++
  }

  return { variables, styles }
}

export function collectColors(nodes: readonly SceneNode[]): ColorEntry[] {
  const map = new Map<string, ColorEntry>()

  function add(color: RGB | RGBA): void {
    const r = Math.round(color.r * 255)
    const g = Math.round(color.g * 255)
    const b = Math.round(color.b * 255)
    const key = r + ',' + g + ',' + b
    const existing = map.get(key)
    if (existing) {
      existing.count += 1
      return
    }
    map.set(key, { r: color.r, g: color.g, b: color.b, count: 1 })
  }

  for (const node of flattenNodes(nodes)) {
    if ('fills' in node && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID') add(fill.color)
        else if (isGradientPaint(fill)) for (const stop of fill.gradientStops) add(stop.color)
      }
    }
    if ('strokes' in node && Array.isArray(node.strokes)) {
      for (const stroke of node.strokes) {
        if (stroke.type === 'SOLID') add(stroke.color)
        else if (isGradientPaint(stroke)) for (const stop of stroke.gradientStops) add(stop.color)
      }
    }
    if ('effects' in node && Array.isArray(node.effects)) {
      for (const effect of node.effects) {
        if (isTargetableShadow(effect)) add(effect.color)
      }
    }
  }

  const result: ColorEntry[] = []
  map.forEach((entry) => result.push(entry))
  result.sort((a, b) => b.count - a.count)
  return result
}

export function applyReplaceColor(
  nodes: readonly SceneNode[],
  payload: ReplaceColorPayload,
): ApplyResult {
  const toProcess = payload.nested ? flattenNodes(nodes) : dedupeNodes(nodes)
  const stats = createApplyStats()

  for (const node of toProcess) processReplaceNode(node, payload, stats)

  return finalizeApplyStats(stats)
}

function processReplaceNode(
  node: SceneNode,
  payload: ReplaceColorPayload,
  stats: ApplyStats,
): void {
  if (payload.applyTo.fills || payload.applyTo.gradients) {
    if ('fills' in node && Array.isArray(node.fills)) {
      processReplacePaintSurface(node, 'fills', node.fills, payload, stats)
    }
  }
  if (payload.applyTo.strokes || payload.applyTo.gradients) {
    if ('strokes' in node && Array.isArray(node.strokes)) {
      processReplacePaintSurface(node, 'strokes', node.strokes, payload, stats)
    }
  }
  if (payload.applyTo.shadows && 'effects' in node && Array.isArray(node.effects)) {
    processReplaceEffectSurface(node, node.effects, payload, stats)
  }
}

function processReplacePaintSurface(
  node: SceneNode,
  surface: PaintSurface,
  paints: readonly Paint[],
  payload: ReplaceColorPayload,
  stats: ApplyStats,
): void {
  const styleId = getPaintStyleId(node, surface)

  if (styleId) {
    if (payload.variableMode === 'skip') return
    const style = figma.getStyleById(styleId)

    if (style && style.type === 'PAINT') {
      if (payload.variableMode === 'detach') {
        const detached = detachPaintBindings(paints)
        const result = replaceDetachedPaints(detached, surface, payload, stats)
        if (result.changed) {
          setNodePaints(node, surface, result.paints)
          clearPaintStyle(node, surface)
          stats.detachedLocals += 1
        }
        return
      }
      if (style.remote) { recordSkippedRemote(stats, `style:${style.id}`); return }
      if (paintStyleHasBoundVariables(style)) { recordSkippedUnsupported(stats, `style:${style.id}`); return }
      if (stats.modifiedGlobalKeys.has(`style:${style.id}`)) return
      const result = replaceDetachedPaints(style.paints, surface, payload, null)
      if (!result.changed) return
      style.paints = result.paints
      stats.modifiedGlobalKeys.add(`style:${style.id}`)
      return
    }

    if (payload.variableMode === 'detach') {
      const detached = detachPaintBindings(paints)
      const result = replaceDetachedPaints(detached, surface, payload, stats)
      if (result.changed) {
        setNodePaints(node, surface, result.paints)
        clearPaintStyle(node, surface)
        stats.detachedLocals += 1
      }
      return
    }
    return
  }

  const result = replaceNodePaints(node, paints, surface, payload, stats)
  if (result.changed) setNodePaints(node, surface, result.paints)
}

function processReplaceEffectSurface(
  node: SceneNode,
  effects: readonly Effect[],
  payload: ReplaceColorPayload,
  stats: ApplyStats,
): void {
  const styleId = getEffectStyleId(node)

  if (styleId) {
    if (payload.variableMode === 'skip') return
    const style = figma.getStyleById(styleId)

    if (style && style.type === 'EFFECT') {
      if (payload.variableMode === 'detach') {
        const detached = detachEffectBindings(effects)
        const result = replaceDetachedEffects(detached, payload, stats)
        if (result.changed) {
          setNodeEffects(node, result.effects)
          clearEffectStyle(node)
          stats.detachedLocals += 1
        }
        return
      }
      if (style.remote) { recordSkippedRemote(stats, `style:${style.id}`); return }
      if (effectStyleHasBoundVariables(style)) { recordSkippedUnsupported(stats, `style:${style.id}`); return }
      if (stats.modifiedGlobalKeys.has(`style:${style.id}`)) return
      const result = replaceDetachedEffects(style.effects, payload, null)
      if (!result.changed) return
      style.effects = result.effects
      stats.modifiedGlobalKeys.add(`style:${style.id}`)
      return
    }

    if (payload.variableMode === 'detach') {
      const detached = detachEffectBindings(effects)
      const result = replaceDetachedEffects(detached, payload, stats)
      if (result.changed) {
        setNodeEffects(node, result.effects)
        clearEffectStyle(node)
        stats.detachedLocals += 1
      }
      return
    }
    return
  }

  const result = replaceNodeEffects(node, effects, payload, stats)
  if (result.changed) setNodeEffects(node, result.effects)
}

function replaceNodePaints(
  node: SceneNode,
  paints: readonly Paint[],
  surface: PaintSurface,
  payload: ReplaceColorPayload,
  stats: ApplyStats,
): { paints: Paint[]; changed: boolean } {
  let changed = false
  const next = paints.map((paint, index) => {
    const result = replaceNodePaint(node, paint, surface, index, payload, stats)
    changed = changed || result.changed
    return result.paint
  })
  return { paints: next, changed }
}

function replaceNodePaint(
  node: SceneNode,
  paint: Paint,
  surface: PaintSurface,
  index: number,
  payload: ReplaceColorPayload,
  stats: ApplyStats,
): { paint: Paint; changed: boolean } {
  if (paint.type === 'SOLID') {
    const targeted = surface === 'fills' ? payload.applyTo.fills : payload.applyTo.strokes
    if (!targeted) return { paint, changed: false }
    if (!colorMatches(paint.color, payload.from)) return { paint, changed: false }
    if (payload.protectGray && isGray(paint.color)) return { paint, changed: false }

    const binding = getPaintVariable(node, paint, surface, index)
    if (!binding.alias) return replaceSolid(paint, payload.to, stats)

    if (payload.variableMode === 'skip') return { paint, changed: false }
    if (payload.variableMode === 'detach') {
      const detached = figma.variables.setBoundVariableForPaint(paint, 'color', null)
      stats.detachedLocals += 1
      return replaceSolid(detached, payload.to, stats)
    }
    if (!binding.variable) {
      recordSkippedUnsupported(stats, `missing-variable:${binding.alias.id}`)
      return { paint, changed: false }
    }
    replaceVariableColor(binding.variable, payload, stats)
    return { paint, changed: false }
  }

  if (isGradientPaint(paint) && payload.applyTo.gradients) {
    return replaceGradient(paint, payload, stats)
  }

  return { paint, changed: false }
}

function replaceDetachedPaints(
  paints: readonly Paint[],
  surface: PaintSurface,
  payload: ReplaceColorPayload,
  stats: ApplyStats | null,
): { paints: Paint[]; changed: boolean } {
  let changed = false
  const next = paints.map((paint) => {
    if (paint.type === 'SOLID') {
      const targeted = surface === 'fills' ? payload.applyTo.fills : payload.applyTo.strokes
      if (!targeted) return paint
      if (!colorMatches(paint.color, payload.from)) return paint
      if (payload.protectGray && isGray(paint.color)) return paint
      const detached = paint.boundVariables?.color
        ? figma.variables.setBoundVariableForPaint(paint, 'color', null)
        : paint
      const result = replaceSolid(detached, payload.to, stats)
      changed = changed || result.changed || detached !== paint
      return result.paint
    }
    if (isGradientPaint(paint) && payload.applyTo.gradients) {
      const result = replaceGradient(paint, payload, stats)
      changed = changed || result.changed
      return result.paint
    }
    return paint
  })
  return { paints: next, changed }
}

function replaceNodeEffects(
  node: SceneNode,
  effects: readonly Effect[],
  payload: ReplaceColorPayload,
  stats: ApplyStats,
): { effects: Effect[]; changed: boolean } {
  let changed = false
  const next = effects.map((effect, index) => {
    const result = replaceNodeEffect(node, effect, index, payload, stats)
    changed = changed || result.changed
    return result.effect
  })
  return { effects: next, changed }
}

function replaceNodeEffect(
  node: SceneNode,
  effect: Effect,
  index: number,
  payload: ReplaceColorPayload,
  stats: ApplyStats,
): { effect: Effect; changed: boolean } {
  if (!isTargetableShadow(effect)) return { effect, changed: false }
  if (!colorMatches(effect.color, payload.from)) return { effect, changed: false }
  if (payload.protectGray && isGray(effect.color)) return { effect, changed: false }

  const binding = getEffectVariable(node, effect, index)
  if (!binding.alias) return replaceShadow(effect, payload.to, stats)

  if (payload.variableMode === 'skip') return { effect, changed: false }
  if (payload.variableMode === 'detach') {
    const detached = figma.variables.setBoundVariableForEffect(effect, 'color', null)
    stats.detachedLocals += 1
    return replaceShadow(detached, payload.to, stats)
  }
  if (!binding.variable) {
    recordSkippedUnsupported(stats, `missing-variable:${binding.alias.id}`)
    return { effect, changed: false }
  }
  replaceVariableColor(binding.variable, payload, stats)
  return { effect, changed: false }
}

function replaceDetachedEffects(
  effects: readonly Effect[],
  payload: ReplaceColorPayload,
  stats: ApplyStats | null,
): { effects: Effect[]; changed: boolean } {
  let changed = false
  const next = effects.map((effect) => {
    if (!isTargetableShadow(effect)) return effect
    if (!colorMatches(effect.color, payload.from)) return effect
    if (payload.protectGray && isGray(effect.color)) return effect
    const detached = effect.boundVariables?.color
      ? figma.variables.setBoundVariableForEffect(effect, 'color', null)
      : effect
    const result = replaceShadow(detached, payload.to, stats)
    changed = changed || result.changed || detached !== effect
    return result.effect
  })
  return { effects: next, changed }
}

function replaceSolid(
  paint: SolidPaint,
  to: { r: number; g: number; b: number },
  stats: ApplyStats | null,
): { paint: SolidPaint; changed: boolean } {
  const color: RGB = { r: to.r, g: to.g, b: to.b }
  if (sameRGB(paint.color, color)) return { paint, changed: false }
  if (stats) stats.localChanges += 1
  return { paint: Object.assign({}, paint, { color }), changed: true }
}

function replaceShadow(
  effect: Effect,
  to: { r: number; g: number; b: number },
  stats: ApplyStats | null,
): { effect: Effect; changed: boolean } {
  if (!isTargetableShadow(effect)) return { effect, changed: false }
  const color: RGBA = { r: to.r, g: to.g, b: to.b, a: effect.color.a }
  if (sameRGBA(effect.color, color)) return { effect, changed: false }
  if (stats) stats.localChanges += 1
  return { effect: Object.assign({}, effect, { color }), changed: true }
}

function replaceGradient(
  paint: GradientPaint,
  payload: ReplaceColorPayload,
  stats: ApplyStats | null,
): { paint: GradientPaint; changed: boolean } {
  let changed = false
  const gradientStops = paint.gradientStops.map((stop) => {
    if (!colorMatches(stop.color, payload.from)) return cloneGradientStop(stop)
    if (payload.protectGray && isGray(stop.color)) return cloneGradientStop(stop)
    const color: RGBA = { r: payload.to.r, g: payload.to.g, b: payload.to.b, a: stop.color.a }
    if (sameRGBA(stop.color, color)) return cloneGradientStop(stop)
    changed = true
    return Object.assign(cloneGradientStop(stop), { color })
  })
  if (!changed) return { paint, changed: false }
  if (stats) stats.localChanges += 1
  return { paint: cloneGradientPaint(paint, gradientStops), changed: true }
}

function replaceVariableColor(
  variable: Variable,
  payload: ReplaceColorPayload,
  stats: ApplyStats,
): void {
  const key = `variable:${variable.id}`
  if (stats.modifiedGlobalKeys.has(key)) return
  if (variable.remote) { recordSkippedRemote(stats, key); return }
  if (variable.resolvedType !== 'COLOR' || variableHasAliasValues(variable)) {
    recordSkippedUnsupported(stats, key)
    return
  }

  const modeIds = Object.keys(variable.valuesByMode)
  const nextValues: Record<string, RGB | RGBA> = {}
  let changed = false

  for (let i = 0; i < modeIds.length; i++) {
    const modeId = modeIds[i]
    const value = variable.valuesByMode[modeId]
    if (!isColorVariableValue(value)) { recordSkippedUnsupported(stats, key); return }
    if (!colorMatches(value, payload.from)) {
      nextValues[modeId] = value
      continue
    }
    const replaced: RGB | RGBA = 'a' in value
      ? { r: payload.to.r, g: payload.to.g, b: payload.to.b, a: value.a }
      : { r: payload.to.r, g: payload.to.g, b: payload.to.b }
    nextValues[modeId] = replaced
    if (!sameColorValue(value, replaced)) changed = true
  }

  if (!changed) return

  for (let i = 0; i < modeIds.length; i++) {
    const modeId = modeIds[i]
    variable.setValueForMode(modeId, nextValues[modeId])
  }
  stats.modifiedGlobalKeys.add(key)
}

function colorMatches(a: RGB | RGBA, b: { r: number; g: number; b: number }): boolean {
  return (
    Math.round(a.r * 255) === Math.round(b.r * 255) &&
    Math.round(a.g * 255) === Math.round(b.g * 255) &&
    Math.round(a.b * 255) === Math.round(b.b * 255)
  )
}

export function countColors(nodes: readonly SceneNode[]): number {
  const colors = new Set<string>()

  for (const node of flattenNodes(nodes)) {
    if ('fills' in node && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID') {
          colors.add(rgbKey(fill.color))
        } else if (isGradientPaint(fill)) {
          for (const stop of fill.gradientStops) colors.add(rgbKey(stop.color))
        }
      }
    }

    if ('strokes' in node && Array.isArray(node.strokes)) {
      for (const stroke of node.strokes) {
        if (stroke.type === 'SOLID') {
          colors.add(rgbKey(stroke.color))
        } else if (isGradientPaint(stroke)) {
          for (const stop of stroke.gradientStops) colors.add(rgbKey(stop.color))
        }
      }
    }

    if ('effects' in node && Array.isArray(node.effects)) {
      for (const effect of node.effects) {
        if (isTargetableShadow(effect)) colors.add(rgbKey(effect.color))
      }
    }
  }

  return colors.size
}

function rgbKey(color: RGB | RGBA): string {
  const r = Math.round(color.r * 255)
  const g = Math.round(color.g * 255)
  const b = Math.round(color.b * 255)
  const alpha = 'a' in color ? color.a : 1
  return `${r},${g},${b},${alpha}`
}
