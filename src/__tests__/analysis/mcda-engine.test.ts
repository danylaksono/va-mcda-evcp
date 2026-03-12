import { describe, it, expect } from 'vitest'
import {
  buildWSMQuery,
  buildWPMQuery,
  buildTOPSISQuery,
  buildMCDAQuery,
  normalizeWeights,
  adjustWeight,
} from '@/analysis/mcda-engine'
import { CRITERIA_CONFIG } from '@/analysis/types'
import type { Criterion } from '@/analysis/types'

function makeCriteria(overrides?: Partial<Criterion>[]): Criterion[] {
  return CRITERIA_CONFIG.map((c, i) => ({
    ...c,
    ...(overrides?.[i] ?? {}),
  }))
}

describe('MCDA Engine', () => {
  describe('buildWSMQuery', () => {
    it('generates valid SQL for active criteria', () => {
      const criteria = makeCriteria()
      const sql = buildWSMQuery(criteria)

      expect(sql).toContain('SELECT')
      expect(sql).toContain('h3_cell')
      expect(sql).toContain('mcda_score')
      expect(sql).toContain('pop_density_normalized')
      expect(sql).toContain('FROM mcda_base')
    })

    it('returns empty query when no criteria active', () => {
      const criteria = makeCriteria().map((c) => ({ ...c, active: false }))
      const sql = buildWSMQuery(criteria)

      expect(sql).toContain('LIMIT 0')
    })

    it('excludes inactive criteria from query', () => {
      const criteria = makeCriteria().map((c, i) => ({
        ...c,
        active: i < 3,
      }))
      const sql = buildWSMQuery(criteria)

      expect(sql).toContain('pop_density_normalized')
      expect(sql).toContain('one_or_more_normalized')
      expect(sql).toContain('two_or_more_normalized')
      expect(sql).not.toContain('employment_30_normalized')
    })

    it('includes weight values in SQL', () => {
      const criteria = makeCriteria()
      criteria[0].weight = 0.5
      const sql = buildWSMQuery(criteria)

      expect(sql).toContain('0.5')
    })
  })

  describe('buildWPMQuery', () => {
    it('generates POWER expressions', () => {
      const sql = buildWPMQuery(makeCriteria())

      expect(sql).toContain('POWER')
      expect(sql).toContain('GREATEST')
    })
  })

  describe('buildTOPSISQuery', () => {
    it('includes CTE for weighted values and ideal solutions', () => {
      const sql = buildTOPSISQuery(makeCriteria())

      expect(sql).toContain('WITH weighted AS')
      expect(sql).toContain('ideal AS')
      expect(sql).toContain('SQRT')
      expect(sql).toContain('MAX')
      expect(sql).toContain('MIN')
    })
  })

  describe('buildMCDAQuery', () => {
    it('dispatches to correct method', () => {
      const criteria = makeCriteria()

      expect(buildMCDAQuery('WSM', criteria)).not.toContain('POWER')
      expect(buildMCDAQuery('WPM', criteria)).toContain('POWER')
      expect(buildMCDAQuery('TOPSIS', criteria)).toContain('SQRT')
    })
  })

  describe('normalizeWeights', () => {
    it('ensures active weights sum to 1', () => {
      const criteria = makeCriteria()
      criteria[0].weight = 0.5
      criteria[1].weight = 0.3
      const normalized = normalizeWeights(criteria)

      const activeSum = normalized
        .filter((c) => c.active)
        .reduce((s, c) => s + c.weight, 0)

      expect(activeSum).toBeCloseTo(1, 5)
    })

    it('sets inactive weights to 0', () => {
      const criteria = makeCriteria()
      criteria[0].active = false
      criteria[0].weight = 0.5
      const normalized = normalizeWeights(criteria)

      expect(normalized[0].weight).toBe(0)
    })

    it('handles all-zero weights', () => {
      const criteria = makeCriteria().map((c) => ({ ...c, active: false }))
      const normalized = normalizeWeights(criteria)

      normalized.forEach((c) => expect(c.weight).toBe(0))
    })
  })

  describe('adjustWeight', () => {
    it('adjusts target without redistributing among others', () => {
      const criteria = makeCriteria()
      const originalOtherWeight = criteria.find((c) => c.id !== 'pop_density')!.weight
      const adjusted = adjustWeight(criteria, 'pop_density', 0.8)

      const target = adjusted.find((c) => c.id === 'pop_density')
      expect(target!.weight).toBeCloseTo(0.8, 1)

      const other = adjusted.find((c) => c.id !== 'pop_density')
      expect(other!.weight).toBeCloseTo(originalOtherWeight, 5)
    })

    it('clamps weight to [0, 1]', () => {
      const criteria = makeCriteria()
      const adjusted = adjustWeight(criteria, 'pop_density', 1.5)
      const target = adjusted.find((c) => c.id === 'pop_density')

      expect(target!.weight).toBeLessThanOrEqual(1)
    })

    it('modifies inactive criteria if targeted', () => {
      const criteria = makeCriteria()
      criteria[0].active = false
      const adjusted = adjustWeight(criteria, criteria[0].id, 0.75)

      expect(adjusted[0].weight).toBe(0.75)
      expect(adjusted[0].active).toBe(false)
    })
  })
})
