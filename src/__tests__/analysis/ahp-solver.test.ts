import { describe, it, expect } from 'vitest'
import {
  buildComparisonMatrix,
  deriveWeights,
  calculateLambdaMax,
  calculateConsistency,
  solveAHP,
  ratioToAHPScale,
  ahpScaleToRatio,
} from '@/analysis/ahp-solver'
import { CRITERIA_CONFIG } from '@/analysis/types'
import type { Criterion, AHPComparison } from '@/analysis/types'

function makeSimpleCriteria(): Criterion[] {
  return CRITERIA_CONFIG.slice(0, 4)
}

describe('AHP Solver', () => {
  describe('buildComparisonMatrix', () => {
    it('creates identity matrix with no comparisons', () => {
      const criteria = makeSimpleCriteria()
      const matrix = buildComparisonMatrix(criteria, [])

      expect(matrix.length).toBe(4)
      matrix.forEach((row, i) => {
        row.forEach((val, j) => {
          expect(val).toBe(1)
        })
      })
    })

    it('sets reciprocal values for comparisons', () => {
      const criteria = makeSimpleCriteria()
      const comparisons: AHPComparison[] = [
        { criterion1: criteria[0].id, criterion2: criteria[1].id, ratio: 3 },
      ]

      const matrix = buildComparisonMatrix(criteria, comparisons)

      expect(matrix[0][1]).toBe(3)
      expect(matrix[1][0]).toBeCloseTo(1 / 3)
    })

    it('clamps extreme values', () => {
      const criteria = makeSimpleCriteria()
      const comparisons: AHPComparison[] = [
        { criterion1: criteria[0].id, criterion2: criteria[1].id, ratio: 20 },
      ]

      const matrix = buildComparisonMatrix(criteria, comparisons)

      expect(matrix[0][1]).toBe(9)
    })
  })

  describe('deriveWeights', () => {
    it('returns equal weights for identity matrix', () => {
      const matrix = [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ]

      const weights = deriveWeights(matrix)

      weights.forEach((w) => expect(w).toBeCloseTo(1 / 3, 4))
    })

    it('weights sum to 1', () => {
      const matrix = [
        [1, 3, 5],
        [1 / 3, 1, 3],
        [1 / 5, 1 / 3, 1],
      ]

      const weights = deriveWeights(matrix)
      const sum = weights.reduce((s, w) => s + w, 0)

      expect(sum).toBeCloseTo(1, 5)
    })

    it('assigns highest weight to dominant criterion', () => {
      const matrix = [
        [1, 5, 7],
        [1 / 5, 1, 3],
        [1 / 7, 1 / 3, 1],
      ]

      const weights = deriveWeights(matrix)

      expect(weights[0]).toBeGreaterThan(weights[1])
      expect(weights[1]).toBeGreaterThan(weights[2])
    })
  })

  describe('calculateConsistency', () => {
    it('reports consistent for perfectly consistent matrix', () => {
      const matrix = [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ]
      const weights = deriveWeights(matrix)
      const result = calculateConsistency(matrix, weights)

      expect(result.isConsistent).toBe(true)
      expect(result.cr).toBeCloseTo(0, 2)
    })

    it('detects inconsistency', () => {
      const matrix = [
        [1, 9, 1 / 9],
        [1 / 9, 1, 9],
        [9, 1 / 9, 1],
      ]
      const weights = deriveWeights(matrix)
      const result = calculateConsistency(matrix, weights)

      expect(result.cr).toBeGreaterThan(0.1)
    })
  })

  describe('solveAHP', () => {
    it('returns valid metrics with comparisons', () => {
      const criteria = makeSimpleCriteria()
      const comparisons: AHPComparison[] = [
        { criterion1: criteria[0].id, criterion2: criteria[1].id, ratio: 3 },
        { criterion1: criteria[0].id, criterion2: criteria[2].id, ratio: 5 },
        { criterion1: criteria[1].id, criterion2: criteria[2].id, ratio: 2 },
      ]

      const result = solveAHP(criteria, comparisons)

      expect(result.weights).toBeDefined()
      expect(result.consistencyRatio).toBeGreaterThanOrEqual(0)
      expect(result.lambdaMax).toBeGreaterThanOrEqual(criteria.length - 1)

      const totalWeight = Object.values(result.weights).reduce((s, w) => s + w, 0)
      expect(totalWeight).toBeCloseTo(1, 4)
    })
  })

  describe('ratio conversions', () => {
    it('ratioToAHPScale converts 0.5 to 1', () => {
      expect(ratioToAHPScale(0.5)).toBe(1)
    })

    it('round-trips through conversion', () => {
      const original = 0.7
      const scale = ratioToAHPScale(original)
      const back = ahpScaleToRatio(scale)

      expect(back).toBeCloseTo(original, 5)
    })
  })
})
