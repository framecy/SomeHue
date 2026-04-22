# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run build          # Full build: tsc + UI + plugin (required before loading in Figma)
npm run build:ui       # UI only → dist/index.html (inlined single file)
npm run build:plugin   # Plugin main thread only → dist/code.js
npm run dev            # Vite dev server for UI (browser preview only, not Figma)
npm run lint           # ESLint
```

## Architecture

This is a **Figma plugin** with a mandatory dual-thread split:

```
src/
  plugin/          ← Main thread (Figma sandbox, QuickJS)
    code.ts        ← Entry: handles Figma API, snapshot/restore for preview undo
    traversal.ts   ← Walks SceneNode trees, applies color adjustments
    color.ts       ← Pure-math OKLCH ↔ sRGB (no external deps — critical)
    messaging.ts   ← Shared types: AdjustPayload, SelectionInfo, UIMessage, PluginMessage
  ui/              ← iframe thread (React + Vite)
    App.tsx        ← Main UI, postMessage bridge, preview throttle (50ms)
    store/         ← Zustand: slider state, toggle state, buildPayload()
    components/    ← Slider, HueSwatches, SelectionBar, ApplyToToggles
```

Two separate Vite configs:
- `vite.config.ts` → UI build (React, Tailwind, `vite-plugin-singlefile` → single inline HTML)
- `vite.plugin.config.ts` → Plugin build (IIFE, `target: 'es2019'`)

## Critical: Figma QuickJS Sandbox Constraints

The plugin main thread (`src/plugin/`) runs in a QuickJS sandbox with strict ES2019 limits. Violations cause `"Syntax error on line 1: Unexpected token"` at runtime.

**NEVER use in `src/plugin/`:**
- `??` or `?.` (nullish coalescing / optional chaining — not supported)
- `{...obj}` object spread → use `Object.assign({}, obj, patch)` instead
- `[...arr]` array spread → use `arr.slice()` instead
- Any npm package that uses the above internally (e.g. culori)

The `src/ui/` React code has no such restrictions.

## Color Engine

`src/plugin/color.ts` is pure inline math (no imports), implementing:
- sRGB ↔ OKLab ↔ OKLCH
- `shiftColor()` — relative H/S/L shift via OKLCH (or HSL fallback when `strictHSL: true`)
- `clampChromaToGamut()` — 20-iteration binary search to bring out-of-gamut colors back to sRGB
- `isGray()` — OKLCH chroma < 0.02

## Message Protocol

UI → Plugin: `preview` (throttled), `adjust` (commit), `preview-reset`, `get-selection`  
Plugin → UI: `selection-change`, `apply-result`, `preview-blocked`, `error`

Preview uses snapshot/restore: first `preview` message snapshots node state; `preview-reset` or `adjust` clears it.

## CSS / Tailwind

Uses Tailwind v4 with `@import "tailwindcss"` syntax (not `@tailwind base` directives).  
**Do not add any unlayered CSS resets** (`* { padding: 0 }` etc.) — they override `@layer utilities` and break all spacing.  
Theme colors use CSS custom properties: `--fig-color-bg`, `--fig-color-text`, `--fig-color-border`, `--fig-color-text-secondary`, `--fig-color-bg-secondary`.
