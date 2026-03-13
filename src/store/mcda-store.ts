import { create } from 'zustand'
import type { Criterion, CriterionPolarity, MCDAMethod, AHPComparison, AHPMetrics } from '@/analysis/types'
import { CRITERIA_CONFIG } from '@/analysis/types'
import { adjustWeight, normalizeWeights } from '@/analysis/mcda-engine'
import { solveAHP } from '@/analysis/ahp-solver'

interface MCDAState {
  criteria: Criterion[]
  method: MCDAMethod
  comparisons: AHPComparison[]
  ahpMetrics: AHPMetrics | null
  isComputing: boolean
  lastComputeTime: number

  setMethod: (method: MCDAMethod) => void
  setWeight: (criterionId: string, weight: number) => void
  setWeights: (weights: Record<string, number>) => void
  setPolarity: (criterionId: string, polarity: CriterionPolarity) => void
  setPolarities: (polarities: Record<string, CriterionPolarity>) => void
  toggleCriterion: (criterionId: string) => void
  addComparison: (comparison: AHPComparison) => void
  removeComparison: (criterion1: string, criterion2: string) => void
  updateComparison: (criterion1: string, criterion2: string, ratio: number) => void
  setComparisons: (comparisons: AHPComparison[]) => void
  clearComparisons: () => void
  setActiveCriteria: (activeIds: string[]) => void
  applyAHPWeights: () => void
  resetWeights: () => void
  setComputing: (computing: boolean) => void
  setLastComputeTime: (time: number) => void
}

export const useMCDAStore = create<MCDAState>((set, get) => ({
  criteria: [...CRITERIA_CONFIG],
  method: 'WSM',
  comparisons: [],
  ahpMetrics: null,
  isComputing: false,
  lastComputeTime: 0,

  setMethod: (method) => set({ method }),

  setWeight: (criterionId, weight) => {
    const updated = adjustWeight(get().criteria, criterionId, weight)
    set({ criteria: updated, ahpMetrics: null })
  },

  setWeights: (weights) => {
    const updated = get().criteria.map((c) => ({
      ...c,
      weight: weights[c.id] ?? c.weight,
    }))
    set({ criteria: updated, ahpMetrics: null })
  },

  setPolarity: (criterionId, polarity) => {
    const updated = get().criteria.map((c) =>
      c.id === criterionId ? { ...c, polarity } : c
    )
    set({ criteria: updated, ahpMetrics: null })
  },

  setPolarities: (polarities) => {
    const updated = get().criteria.map((c) => ({
      ...c,
      polarity: polarities[c.id] ?? c.polarity,
    }))
    set({ criteria: updated, ahpMetrics: null })
  },

  toggleCriterion: (criterionId) => {
    const updated = get().criteria.map((c) =>
      c.id === criterionId ? { ...c, active: !c.active } : c
    )
    set({ criteria: updated, ahpMetrics: null })
  },

  addComparison: (comparison) => {
    const existing = get().comparisons.find(
      (c) =>
        (c.criterion1 === comparison.criterion1 && c.criterion2 === comparison.criterion2) ||
        (c.criterion1 === comparison.criterion2 && c.criterion2 === comparison.criterion1)
    )
    if (!existing) {
      set({ comparisons: [...get().comparisons, comparison] })
    }
  },

  removeComparison: (criterion1, criterion2) => {
    set({
      comparisons: get().comparisons.filter(
        (c) =>
          !(
            (c.criterion1 === criterion1 && c.criterion2 === criterion2) ||
            (c.criterion1 === criterion2 && c.criterion2 === criterion1)
          )
      ),
    })
  },

  updateComparison: (criterion1, criterion2, ratio) => {
    set({
      comparisons: get().comparisons.map((c) => {
        if (c.criterion1 === criterion1 && c.criterion2 === criterion2) {
          return { ...c, ratio }
        }
        if (c.criterion1 === criterion2 && c.criterion2 === criterion1) {
          return { ...c, ratio: 1 / ratio }
        }
        return c
      }),
    })
  },

  setComparisons: (comparisons) => set({ comparisons, ahpMetrics: null }),

  clearComparisons: () => set({ comparisons: [], ahpMetrics: null }),

  setActiveCriteria: (activeIds) => {
    const activeSet = new Set(activeIds)
    const updated = get().criteria.map((c) => ({
      ...c,
      active: activeSet.has(c.id),
    }))
    set({ criteria: updated })
  },

  applyAHPWeights: () => {
    const { criteria, comparisons } = get()
    if (comparisons.length === 0) return

    const metrics = solveAHP(criteria, comparisons)
    const updated = criteria.map((c) => ({
      ...c,
      weight: metrics.weights[c.id] ?? 0,
    }))

    set({ criteria: updated, ahpMetrics: metrics })
  },

  resetWeights: () => {
    const defaultWeight = 0.5
    set({
      criteria: CRITERIA_CONFIG.map((c) => ({ ...c, weight: defaultWeight, active: true })),
      comparisons: [],
      ahpMetrics: null,
    })
  },

  setComputing: (computing) => set({ isComputing: computing }),
  setLastComputeTime: (time) => set({ lastComputeTime: time }),
}))
