import { create } from 'zustand'
import type { Scenario, EVCPPlacement, ChargerType, CriterionPolarity, ImpactEstimate, PlacementCellData } from '@/analysis/types'

const STORAGE_KEY = 'va-mcda-evcp-scenarios'

interface ScenarioState {
  scenarios: Scenario[]
  activeScenarioId: string | null
  currentPlacements: EVCPPlacement[]
  currentImpact: ImpactEstimate | null
  isSimulationMode: boolean
  selectedPlacementCell: string | null

  addPlacement: (h3Cell: string, chargerType: ChargerType, chargerCount: number, lsoaCode?: string, cellData?: PlacementCellData) => void
  removePlacement: (h3Cell: string) => void
  updatePlacement: (h3Cell: string, chargerType: ChargerType, chargerCount: number, lsoaCode?: string, cellData?: PlacementCellData) => void
  setPlacements: (placements: EVCPPlacement[]) => void
  clearPlacements: () => void
  setCurrentImpact: (impact: ImpactEstimate | null) => void
  setSimulationMode: (active: boolean) => void
  setSelectedPlacementCell: (cell: string | null) => void
  resetWorkingScenario: () => void

  saveScenario: (
    name: string,
    weights: Record<string, number>,
    method: string,
    polarities?: Record<string, CriterionPolarity>
  ) => void
  deleteScenario: (id: string) => void
  loadScenario: (id: string) => Scenario | null
  setActiveScenario: (id: string | null) => void

  loadFromStorage: () => void
  saveToStorage: () => void
}

function generateId(): string {
  return `sc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  scenarios: [],
  activeScenarioId: null,
  currentPlacements: [],
  currentImpact: null,
  isSimulationMode: false,
  selectedPlacementCell: null,

  addPlacement: (h3Cell, chargerType, chargerCount, lsoaCode, cellData) => {
    const existing = get().currentPlacements.find((p) => p.h3Cell === h3Cell)
    if (existing) {
      get().updatePlacement(h3Cell, chargerType, chargerCount, lsoaCode, cellData)
      return
    }
    set({
      currentPlacements: [
        ...get().currentPlacements,
        { h3Cell, chargerType, chargerCount, timestamp: Date.now(), lsoaCode, cellData },
      ],
    })
  },

  removePlacement: (h3Cell) => {
    set({
      currentPlacements: get().currentPlacements.filter((p) => p.h3Cell !== h3Cell),
    })
  },

  updatePlacement: (h3Cell, chargerType, chargerCount, lsoaCode, cellData) => {
    set({
      currentPlacements: get().currentPlacements.map((p) =>
        p.h3Cell === h3Cell ? { ...p, chargerType, chargerCount, timestamp: Date.now(), lsoaCode, cellData } : p
      ),
    })
  },

  setPlacements: (placements) => {
    set({
      currentPlacements: placements.map((placement) => ({
        ...placement,
        timestamp: placement.timestamp ?? Date.now(),
      })),
      currentImpact: null,
    })
  },

  clearPlacements: () => set({ currentPlacements: [], currentImpact: null, selectedPlacementCell: null }),

  setCurrentImpact: (impact) => set({ currentImpact: impact }),

  setSimulationMode: (active) => set({ isSimulationMode: active }),

  setSelectedPlacementCell: (cell) => set({ selectedPlacementCell: cell }),

  resetWorkingScenario: () =>
    set({
      activeScenarioId: null,
      currentPlacements: [],
      currentImpact: null,
      isSimulationMode: false,
      selectedPlacementCell: null,
    }),

  saveScenario: (name, weights, method, polarities) => {
    const scenario: Scenario = {
      id: generateId(),
      name,
      timestamp: Date.now(),
      weights,
      polarities,
      method: method as Scenario['method'],
      placements: [...get().currentPlacements],
      impactSummary: get().currentImpact ?? undefined,
    }
    const updated = [...get().scenarios, scenario]
    set({ scenarios: updated })
    get().saveToStorage()
  },

  deleteScenario: (id) => {
    const updated = get().scenarios.filter((s) => s.id !== id)
    set({ scenarios: updated })
    get().saveToStorage()
  },

  loadScenario: (id) => {
    return get().scenarios.find((s) => s.id === id) ?? null
  },

  setActiveScenario: (id) => set({ activeScenarioId: id }),

  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const scenarios = JSON.parse(raw) as Scenario[]
        set({ scenarios })
      }
    } catch {
      console.warn('Failed to load scenarios from localStorage')
    }
  },

  saveToStorage: () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(get().scenarios))
    } catch {
      console.warn('Failed to save scenarios to localStorage')
    }
  },
}))
