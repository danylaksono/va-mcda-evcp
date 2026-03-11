import * as d3 from 'd3'

export type ColorScaleName = 'viridis' | 'plasma' | 'inferno' | 'magma' | 'rdylgn' | 'spectral'

const SCALE_FACTORIES: Record<ColorScaleName, (t: number) => string> = {
  viridis: d3.interpolateViridis,
  plasma: d3.interpolatePlasma,
  inferno: d3.interpolateInferno,
  magma: d3.interpolateMagma,
  rdylgn: d3.interpolateRdYlGn,
  spectral: d3.interpolateSpectral,
}

/**
 * Returns a color for a normalized score (0-1) using the specified scale.
 */
export function scoreToColor(score: number, scale: ColorScaleName = 'viridis'): string {
  const clamped = Math.max(0, Math.min(1, score))
  return SCALE_FACTORIES[scale](clamped)
}

/**
 * Creates a MapLibre-compatible color expression for MCDA scores.
 */
export function createMapColorExpression(
  property: string = 'mcda_score',
  scale: ColorScaleName = 'viridis',
  steps: number = 10
): unknown[] {
  const colorStops: (number | string)[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    colorStops.push(t, scoreToColor(t, scale))
  }
  return ['interpolate', ['linear'], ['get', property], ...colorStops]
}

/**
 * Generates legend entries for the color scale.
 */
export function generateLegendEntries(
  scale: ColorScaleName = 'viridis',
  steps: number = 5
): Array<{ value: number; color: string; label: string }> {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    return {
      value: t,
      color: scoreToColor(t, scale),
      label: t.toFixed(1),
    }
  })
}
