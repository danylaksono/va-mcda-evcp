import type { AHPComparison, AHPMetrics, Criterion } from './types'

const RANDOM_INDEX: Record<number, number> = {
  1: 0,
  2: 0,
  3: 0.58,
  4: 0.9,
  5: 1.12,
  6: 1.24,
  7: 1.32,
  8: 1.41,
  9: 1.45,
  10: 1.49,
}

/**
 * Builds the AHP pairwise comparison matrix from a list of comparisons.
 * Matrix is n×n where n = number of criteria.
 */
export function buildComparisonMatrix(
  criteria: Criterion[],
  comparisons: AHPComparison[]
): number[][] {
  const n = criteria.length
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(1))

  comparisons.forEach((comp) => {
    const i = criteria.findIndex((c) => c.id === comp.criterion1)
    const j = criteria.findIndex((c) => c.id === comp.criterion2)
    if (i === -1 || j === -1) return

    const ratio = Math.max(1 / 9, Math.min(9, comp.ratio))
    matrix[i][j] = ratio
    matrix[j][i] = 1 / ratio
  })

  return matrix
}

/**
 * Derives priority weights from a pairwise comparison matrix
 * using the geometric mean method (Row Geometric Mean Method).
 */
export function deriveWeights(matrix: number[][]): number[] {
  const n = matrix.length
  const geometricMeans = matrix.map((row) => {
    const product = row.reduce((p, val) => p * val, 1)
    return Math.pow(product, 1 / n)
  })

  const sum = geometricMeans.reduce((s, v) => s + v, 0)
  return geometricMeans.map((gm) => (sum > 0 ? gm / sum : 1 / n))
}

/**
 * Calculates the principal eigenvalue (λ max) from the matrix and weights.
 */
export function calculateLambdaMax(matrix: number[][], weights: number[]): number {
  const n = matrix.length
  let lambdaMax = 0

  for (let i = 0; i < n; i++) {
    let weightedSum = 0
    for (let j = 0; j < n; j++) {
      weightedSum += matrix[i][j] * weights[j]
    }
    if (weights[i] > 0) {
      lambdaMax += weightedSum / weights[i]
    }
  }

  return lambdaMax / n
}

/**
 * Calculates AHP consistency metrics.
 */
export function calculateConsistency(
  matrix: number[][],
  weights: number[]
): { ci: number; cr: number; lambdaMax: number; isConsistent: boolean } {
  const n = matrix.length
  const lambdaMax = calculateLambdaMax(matrix, weights)
  const ci = (lambdaMax - n) / (n - 1)
  const ri = RANDOM_INDEX[n] ?? 1.49
  const cr = ri > 0 ? ci / ri : 0

  return {
    ci: Math.abs(ci),
    cr: Math.abs(cr),
    lambdaMax: isFinite(lambdaMax) ? lambdaMax : n,
    isConsistent: Math.abs(cr) < 0.1,
  }
}

/**
 * Full AHP solver: builds matrix, derives weights, checks consistency.
 */
export function solveAHP(
  criteria: Criterion[],
  comparisons: AHPComparison[]
): AHPMetrics {
  const activeCriteria = criteria.filter((c) => c.active)
  const matrix = buildComparisonMatrix(activeCriteria, comparisons)
  const weightValues = deriveWeights(matrix)
  const consistency = calculateConsistency(matrix, weightValues)

  const weights: Record<string, number> = {}
  activeCriteria.forEach((c, i) => {
    weights[c.id] = weightValues[i]
  })
  criteria.filter((c) => !c.active).forEach((c) => {
    weights[c.id] = 0
  })

  return {
    lambdaMax: consistency.lambdaMax,
    consistencyIndex: consistency.ci,
    consistencyRatio: consistency.cr,
    isConsistent: consistency.isConsistent,
    weights,
  }
}

/**
 * Converts a ratio (0-1 scale where 0.5 = equal) to AHP scale (1/9 to 9).
 */
export function ratioToAHPScale(ratio: number): number {
  if (ratio >= 0.5) {
    return 1 + (ratio - 0.5) * 16 // 0.5 → 1, 1.0 → 9
  }
  const inverse = 1 + (0.5 - ratio) * 16
  return 1 / inverse
}

/**
 * Converts AHP scale value back to 0-1 ratio.
 */
export function ahpScaleToRatio(scale: number): number {
  if (scale >= 1) {
    return 0.5 + (scale - 1) / 16
  }
  return 0.5 - (1 / scale - 1) / 16
}
