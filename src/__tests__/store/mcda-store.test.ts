import { describe, it, expect, beforeEach } from 'vitest'
import { useMCDAStore } from '@/store/mcda-store'

describe('MCDA Store', () => {
  beforeEach(() => {
    useMCDAStore.getState().resetWeights()
  })

it('initializes with equal default weights', () => {
    const state = useMCDAStore.getState()
    const weights = state.criteria.filter((c) => c.active).map((c) => c.weight)
    const expectedWeight = 0.5

    weights.forEach((w) => expect(w).toBeCloseTo(expectedWeight, 5))
  })

  it('sets method', () => {
    useMCDAStore.getState().setMethod('TOPSIS')
    expect(useMCDAStore.getState().method).toBe('TOPSIS')
  })

  it('adjusts weight of a single criterion', () => {
    useMCDAStore.getState().setWeight('pop_density', 0.8)

    const state = useMCDAStore.getState()
    const criterion = state.criteria.find((c) => c.id === 'pop_density')
    expect(criterion!.weight).toBeCloseTo(0.8, 5)
  })

  it('toggles criterion active state', () => {
    useMCDAStore.getState().toggleCriterion('pop_density')

    const state = useMCDAStore.getState()
    const criterion = state.criteria.find((c) => c.id === 'pop_density')

    expect(criterion!.active).toBe(false)
  })

  it('sets criterion polarity', () => {
    useMCDAStore.getState().setPolarity('pop_density', 'cost')

    const state = useMCDAStore.getState()
    const criterion = state.criteria.find((c) => c.id === 'pop_density')

    expect(criterion!.polarity).toBe('cost')
  })

  it('manages comparisons', () => {
    const store = useMCDAStore.getState()

    store.addComparison({
      criterion1: 'pop_density',
      criterion2: 'car_ownership',
      ratio: 3,
    })

    expect(useMCDAStore.getState().comparisons).toHaveLength(1)

    store.removeComparison('pop_density', 'car_ownership')
    expect(useMCDAStore.getState().comparisons).toHaveLength(0)
  })

  it('prevents duplicate comparisons', () => {
    const store = useMCDAStore.getState()

    store.addComparison({ criterion1: 'pop_density', criterion2: 'car_ownership', ratio: 3 })
    store.addComparison({ criterion1: 'pop_density', criterion2: 'car_ownership', ratio: 5 })

    expect(useMCDAStore.getState().comparisons).toHaveLength(1)
  })

  it('resets weights to default', () => {
    useMCDAStore.getState().setWeight('pop_density', 0.8)
    useMCDAStore.getState().setPolarity('pop_density', 'cost')
    useMCDAStore.getState().resetWeights()

    const state = useMCDAStore.getState()
    const expectedWeight = 0.5

    state.criteria.forEach((c) => {
      expect(c.weight).toBeCloseTo(expectedWeight, 5)
      expect(c.active).toBe(true)
    })

    const popDensity = state.criteria.find((c) => c.id === 'pop_density')
    const transportEmission = state.criteria.find((c) => c.id === 'transport_emission')
    expect(popDensity!.polarity).toBe('benefit')
    expect(transportEmission!.polarity).toBe('cost')
  })
})
