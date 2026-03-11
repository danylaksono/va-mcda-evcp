import { describe, it, expect } from 'vitest'
import {
  estimateDailyDemand,
  calculateUtilization,
  estimateAnnualEnergy,
  estimateCarbonSaved,
  calculatePeakDemand,
  calculateHeadroomImpact,
  estimatePopulationServed,
  estimateImpact,
  aggregateImpacts,
} from '@/analysis/impact-model'
import type { EVCPPlacement, ImpactEstimate } from '@/analysis/types'

const SAMPLE_CELL_DATA = {
  popDensity: 8000,
  carOwnership: 0.6,
  deprivation: 0.3,
  gridCapacity: 0.5,
  existingEVCPDistance: 10,
}

describe('Impact Model', () => {
  describe('estimateDailyDemand', () => {
    it('returns positive value for populated area', () => {
      const demand = estimateDailyDemand(SAMPLE_CELL_DATA)
      expect(demand).toBeGreaterThan(0)
    })

    it('returns higher demand for higher population density', () => {
      const lowDensity = estimateDailyDemand({ ...SAMPLE_CELL_DATA, popDensity: 2000 })
      const highDensity = estimateDailyDemand({ ...SAMPLE_CELL_DATA, popDensity: 15000 })
      expect(highDensity).toBeGreaterThan(lowDensity)
    })
  })

  describe('calculateUtilization', () => {
    it('returns value between 0 and 1', () => {
      const u = calculateUtilization(100, 4, 50)
      expect(u).toBeGreaterThanOrEqual(0)
      expect(u).toBeLessThanOrEqual(1)
    })

    it('caps at 1 for very high demand', () => {
      const u = calculateUtilization(1e6, 1, 7)
      expect(u).toBe(1)
    })

    it('returns 0 for zero capacity', () => {
      const u = calculateUtilization(100, 0, 50)
      expect(u).toBe(0)
    })
  })

  describe('estimateAnnualEnergy', () => {
    it('returns positive value for valid inputs', () => {
      const energy = estimateAnnualEnergy(4, 50, 0.6)
      expect(energy).toBeGreaterThan(0)
    })

    it('scales linearly with charger count', () => {
      const e1 = estimateAnnualEnergy(2, 50, 0.5)
      const e2 = estimateAnnualEnergy(4, 50, 0.5)
      expect(e2).toBeCloseTo(e1 * 2, 0)
    })
  })

  describe('estimateCarbonSaved', () => {
    it('returns positive value for energy delivered', () => {
      const saved = estimateCarbonSaved(100000)
      expect(saved).toBeGreaterThan(0)
    })

    it('scales with energy', () => {
      const s1 = estimateCarbonSaved(50000)
      const s2 = estimateCarbonSaved(100000)
      expect(s2).toBeGreaterThan(s1)
    })
  })

  describe('calculatePeakDemand', () => {
    it('applies diversity factor', () => {
      const peak = calculatePeakDemand(4, 50, 0.7)
      expect(peak).toBe(4 * 50 * 0.7)
    })
  })

  describe('calculateHeadroomImpact', () => {
    it('returns percentage', () => {
      const impact = calculateHeadroomImpact(100, 0.5)
      expect(impact).toBeGreaterThan(0)
      expect(impact).toBeLessThan(100)
    })

    it('returns 100% for zero capacity', () => {
      const impact = calculateHeadroomImpact(100, 0)
      expect(impact).toBe(100)
    })
  })

  describe('estimatePopulationServed', () => {
    it('returns positive value', () => {
      const pop = estimatePopulationServed(5000)
      expect(pop).toBeGreaterThan(0)
    })
  })

  describe('estimateImpact', () => {
    it('returns all impact fields', () => {
      const placement: EVCPPlacement = {
        h3Cell: '8a2a1072b59ffff',
        chargerType: 'fast',
        chargerCount: 4,
        timestamp: Date.now(),
      }

      const impact = estimateImpact(placement, SAMPLE_CELL_DATA)

      expect(impact.energyDeliveredKWh).toBeGreaterThan(0)
      expect(impact.carbonSavedTonnes).toBeGreaterThan(0)
      expect(impact.annualRevenue).toBeGreaterThan(0)
      expect(impact.peakDemandKW).toBeGreaterThan(0)
      expect(impact.installCostGBP).toBeGreaterThan(0)
      expect(impact.utilizationFactor).toBeGreaterThanOrEqual(0)
      expect(impact.utilizationFactor).toBeLessThanOrEqual(1)
    })
  })

  describe('aggregateImpacts', () => {
    it('sums energy and carbon across placements', () => {
      const impacts: ImpactEstimate[] = [
        {
          energyDeliveredKWh: 1000,
          carbonSavedTonnes: 10,
          annualRevenue: 500,
          peakDemandKW: 100,
          headroomImpactPct: 20,
          populationServed: 500,
          deprivationScore: 0.3,
          installCostGBP: 10000,
          utilizationFactor: 0.5,
        },
        {
          energyDeliveredKWh: 2000,
          carbonSavedTonnes: 20,
          annualRevenue: 1000,
          peakDemandKW: 200,
          headroomImpactPct: 40,
          populationServed: 1000,
          deprivationScore: 0.5,
          installCostGBP: 20000,
          utilizationFactor: 0.7,
        },
      ]

      const agg = aggregateImpacts(impacts)

      expect(agg.energyDeliveredKWh).toBe(3000)
      expect(agg.carbonSavedTonnes).toBe(30)
      expect(agg.installCostGBP).toBe(30000)
      expect(agg.headroomImpactPct).toBe(30) // average
      expect(agg.utilizationFactor).toBe(0.6) // average
    })

    it('returns zeros for empty array', () => {
      const agg = aggregateImpacts([])
      expect(agg.energyDeliveredKWh).toBe(0)
      expect(agg.carbonSavedTonnes).toBe(0)
    })
  })
})
