import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useScenarioStore } from '@/store/scenario-store'

describe('Scenario Store', () => {
  beforeEach(() => {
    useScenarioStore.setState({
      scenarios: [],
      activeScenarioId: null,
      currentPlacements: [],
      currentImpact: null,
    })
    localStorage.clear()
  })

  describe('placements', () => {
    it('adds a placement', () => {
      useScenarioStore.getState().addPlacement('8a2a1072b59ffff', 'fast', 4)

      const placements = useScenarioStore.getState().currentPlacements
      expect(placements).toHaveLength(1)
      expect(placements[0].h3Cell).toBe('8a2a1072b59ffff')
      expect(placements[0].chargerType).toBe('fast')
      expect(placements[0].chargerCount).toBe(4)
    })

    it('updates existing placement for same cell', () => {
      const store = useScenarioStore.getState()
      store.addPlacement('8a2a1072b59ffff', 'fast', 4)
      store.addPlacement('8a2a1072b59ffff', 'rapid', 2)

      const placements = useScenarioStore.getState().currentPlacements
      expect(placements).toHaveLength(1)
      expect(placements[0].chargerType).toBe('rapid')
      expect(placements[0].chargerCount).toBe(2)
    })

    it('removes a placement', () => {
      const store = useScenarioStore.getState()
      store.addPlacement('cell_1', 'fast', 4)
      store.addPlacement('cell_2', 'rapid', 2)
      store.removePlacement('cell_1')

      expect(useScenarioStore.getState().currentPlacements).toHaveLength(1)
      expect(useScenarioStore.getState().currentPlacements[0].h3Cell).toBe('cell_2')
    })

    it('clears all placements', () => {
      const store = useScenarioStore.getState()
      store.addPlacement('cell_1', 'fast', 4)
      store.addPlacement('cell_2', 'rapid', 2)
      store.clearPlacements()

      expect(useScenarioStore.getState().currentPlacements).toHaveLength(0)
    })
  })

  describe('scenarios', () => {
    it('saves a scenario', () => {
      const store = useScenarioStore.getState()
      store.addPlacement('cell_1', 'fast', 4)
      store.saveScenario('Test Scenario', { pop_density: 0.5, car_ownership: 0.3 }, 'WSM')

      const scenarios = useScenarioStore.getState().scenarios
      expect(scenarios).toHaveLength(1)
      expect(scenarios[0].name).toBe('Test Scenario')
      expect(scenarios[0].method).toBe('WSM')
      expect(scenarios[0].placements).toHaveLength(1)
    })

    it('deletes a scenario', () => {
      const store = useScenarioStore.getState()
      store.saveScenario('S1', {}, 'WSM')
      const id = useScenarioStore.getState().scenarios[0].id
      store.deleteScenario(id)

      expect(useScenarioStore.getState().scenarios).toHaveLength(0)
    })

    it('loads a scenario by id', () => {
      const store = useScenarioStore.getState()
      store.saveScenario('S1', { pop_density: 0.8 }, 'TOPSIS')
      const id = useScenarioStore.getState().scenarios[0].id

      const loaded = store.loadScenario(id)
      expect(loaded).toBeDefined()
      expect(loaded!.name).toBe('S1')
      expect(loaded!.weights.pop_density).toBe(0.8)
    })

    it('persists to localStorage', () => {
      const store = useScenarioStore.getState()
      store.saveScenario('Persisted', {}, 'WSM')

      const stored = localStorage.getItem('va-mcda-evcp-scenarios')
      expect(stored).toBeTruthy()
      const parsed = JSON.parse(stored!)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].name).toBe('Persisted')
    })

    it('loads from localStorage', () => {
      localStorage.setItem(
        'va-mcda-evcp-scenarios',
        JSON.stringify([
          {
            id: 'test_1',
            name: 'From Storage',
            timestamp: Date.now(),
            weights: {},
            method: 'WSM',
            placements: [],
          },
        ])
      )

      useScenarioStore.getState().loadFromStorage()

      const scenarios = useScenarioStore.getState().scenarios
      expect(scenarios).toHaveLength(1)
      expect(scenarios[0].name).toBe('From Storage')
    })
  })
})
