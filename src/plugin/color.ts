export type FigmaRGB = { r: number; g: number; b: number }

// Minimal OKLCH <-> sRGB math, no external deps.
// Reference: https://bottosson.github.io/posts/oklab/

function linearToSrgb(x: number): number {
  if (x >= 0.0031308) return 1.055 * Math.pow(x, 1 / 2.4) - 0.055
  return 12.92 * x
}

function srgbToLinear(x: number): number {
  if (x >= 0.04045) return Math.pow((x + 0.055) / 1.055, 2.4)
  return x / 12.92
}

type OKLab = { L: number; a: number; b: number }

function rgbToOklab(r: number, g: number, b: number): OKLab {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  }
}

function oklabToRgb(L: number, a: number, b: number): FigmaRGB {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3)
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3)
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3)

  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

  return {
    r: clamp01(linearToSrgb(lr)),
    g: clamp01(linearToSrgb(lg)),
    b: clamp01(linearToSrgb(lb)),
  }
}

type OKLCH = { L: number; C: number; H: number }

function labToLch(lab: OKLab): OKLCH {
  return {
    L: lab.L,
    C: Math.sqrt(lab.a * lab.a + lab.b * lab.b),
    H: (Math.atan2(lab.b, lab.a) * 180) / Math.PI,
  }
}

function lchToLab(lch: OKLCH): OKLab {
  const hRad = (lch.H * Math.PI) / 180
  return { L: lch.L, a: lch.C * Math.cos(hRad), b: lch.C * Math.sin(hRad) }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

export function shiftColor(
  color: FigmaRGB,
  hDelta: number,
  sDelta: number,
  lDelta: number,
  strictHSL: boolean,
): FigmaRGB {
  if (strictHSL) return shiftHSL(color, hDelta, sDelta, lDelta)
  return shiftOKLCH(color, hDelta, sDelta, lDelta)
}

function shiftOKLCH(color: FigmaRGB, hDelta: number, sDelta: number, lDelta: number): FigmaRGB {
  const lab = rgbToOklab(color.r, color.g, color.b)
  const lch = labToLch(lab)

  lch.H = ((lch.H + hDelta) % 360 + 360) % 360
  lch.C = Math.max(0, Math.min(0.4, lch.C + (sDelta / 100) * 0.4))
  lch.L = clamp01(lch.L + lDelta / 100)

  const lab2 = lchToLab(lch)
  const rgb = oklabToRgb(lab2.L, lab2.a, lab2.b)

  // Gamut clamp: if out of sRGB, reduce chroma iteratively
  if (rgb.r > 1 || rgb.g > 1 || rgb.b > 1 || rgb.r < 0 || rgb.g < 0 || rgb.b < 0) {
    return clampChromaToGamut(lch)
  }
  return rgb
}

function clampChromaToGamut(lch: OKLCH): FigmaRGB {
  let lo = 0
  let hi = lch.C
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const lab = lchToLab({ L: lch.L, C: mid, H: lch.H })
    const rgb = oklabToRgb(lab.L, lab.a, lab.b)
    if (rgb.r > 1 || rgb.g > 1 || rgb.b > 1 || rgb.r < 0 || rgb.g < 0 || rgb.b < 0) {
      hi = mid
    } else {
      lo = mid
    }
  }
  const lab = lchToLab({ L: lch.L, C: lo, H: lch.H })
  return oklabToRgb(lab.L, lab.a, lab.b)
}

export function setAbsoluteHue(color: FigmaRGB, targetHueDeg: number): FigmaRGB {
  const lab = rgbToOklab(color.r, color.g, color.b)
  const lch = labToLch(lab)
  lch.H = targetHueDeg
  const lab2 = lchToLab(lch)
  return oklabToRgb(lab2.L, lab2.a, lab2.b)
}

// OKLCH chroma < 0.02 = grayscale
export function isGray(color: FigmaRGB): boolean {
  const lab = rgbToOklab(color.r, color.g, color.b)
  const lch = labToLch(lab)
  return lch.C < 0.02
}

export function getHueDeg(color: FigmaRGB): number {
  const lab = rgbToOklab(color.r, color.g, color.b)
  return labToLch(lab).H
}

export function rgbToOKLCH(color: FigmaRGB): { L: number; C: number; H: number } {
  const lab = rgbToOklab(color.r, color.g, color.b)
  return labToLch(lab)
}

export function oklchToRGB(L: number, C: number, H: number): FigmaRGB {
  const lab = lchToLab({ L, C, H })
  const rgb = oklabToRgb(lab.L, lab.a, lab.b)
  if (rgb.r > 1 || rgb.g > 1 || rgb.b > 1 || rgb.r < 0 || rgb.g < 0 || rgb.b < 0) {
    return clampChromaToGamut({ L, C, H })
  }
  return rgb
}

// HSL fallback
function rgbToHSL(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s, l]
}

function hslToRGB(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }
  return [r + m, g + m, b + m]
}

function shiftHSL(color: FigmaRGB, hDelta: number, sDelta: number, lDelta: number): FigmaRGB {
  const [h, s, l] = rgbToHSL(color.r, color.g, color.b)
  const nh = ((h + hDelta) + 360) % 360
  const ns = clamp01(s + sDelta / 100)
  const nl = clamp01(l + lDelta / 100)
  const [r, g, b] = hslToRGB(nh, ns, nl)
  return { r, g, b }
}
