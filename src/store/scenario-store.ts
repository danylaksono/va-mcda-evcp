import { create } from 'zustand'
import type {
  Scenario,
  EVCPPlacement,
  ChargerType,
  CriterionPolarity,
  ImpactEstimate,
  PlacementCellData,
  AHPComparison,
} from '@/analysis/types'
import {
  type ScenarioDisplayMode,
  getScenarioDisplayMode,
  getScenarioColor,
  getScenarioStyle,
  type ScenarioRenderInfo,
} from '@/scenarios/scenario-styles'

const STORAGE_KEY = 'va-mcda-evcp-scenarios'
const VISIBILITY_KEY = 'va-mcda-evcp-scenario-visibility'
const COMPARED_KEY = 'va-mcda-evcp-scenario-compared'
const MAX_COMPARED = 8

interface ScenarioState {
  scenarios: Scenario[]
  activeScenarioId: string | null
  visibleScenarioIds: Set<string>
  comparedScenarioIds: string[]
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
    polarities?: Record<string, CriterionPolarity>,
    activeCriteria?: string[],
    ahpComparisons?: AHPComparison[],
    description?: string
  ) => void
  deleteScenario: (id: string) => void
  loadScenario: (id: string) => Scenario | null
  setActiveScenario: (id: string | null) => void

  toggleScenarioVisibility: (id: string) => void
  toggleScenarioComparison: (id: string) => void
  setComparedScenarioIds: (ids: string[]) => void

  getScenarioDisplayMode: (id: string) => ScenarioDisplayMode
  getScenarioRenderInfo: (id: string) => ScenarioRenderInfo | null
  getVisibleScenarios: () => Scenario[]

  importScenarios: (json: string) => { imported: number; errors: string[] }
  exportScenarios: (ids?: string[]) => string

  loadFromStorage: () => void
  saveToStorage: () => void
}

function generateId(): string {
  return `sc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function loadSetFromStorage(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* ignore */ }
  return new Set()
}

function loadArrayFromStorage(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch { /* ignore */ }
  return []
}

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  scenarios: [],
  activeScenarioId: null,
  visibleScenarioIds: new Set<string>(),
  comparedScenarioIds: [],
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

  saveScenario: (name, weights, method, polarities, activeCriteria, ahpComparisons, description) => {
    const scenario: Scenario = {
      id: generateId(),
      name,
      description,
      timestamp: Date.now(),
      weights,
      polarities,
      method: method as Scenario['method'],
      activeCriteria,
      ahpComparisons: ahpComparisons?.length ? ahpComparisons : undefined,
      placements: [...get().currentPlacements],
      impactSummary: get().currentImpact ?? undefined,
    }
    const updated = [...get().scenarios, scenario]
    set({ scenarios: updated })
    get().saveToStorage()
  },

  deleteScenario: (id) => {
    const { visibleScenarioIds, comparedScenarioIds } = get()
    const nextVisible = new Set(visibleScenarioIds)
    nextVisible.delete(id)
    const nextCompared = comparedScenarioIds.filter((cid) => cid !== id)
    const updated = get().scenarios.filter((s) => s.id !== id)
    set({
      scenarios: updated,
      visibleScenarioIds: nextVisible,
      comparedScenarioIds: nextCompared,
      activeScenarioId: get().activeScenarioId === id ? null : get().activeScenarioId,
    })
    get().saveToStorage()
    try {
      localStorage.setItem(VISIBILITY_KEY, JSON.stringify([...nextVisible]))
      localStorage.setItem(COMPARED_KEY, JSON.stringify(nextCompared))
    } catch { /* ignore */ }
  },

  loadScenario: (id) => {
    return get().scenarios.find((s) => s.id === id) ?? null
  },

  setActiveScenario: (id) => set({ activeScenarioId: id }),

  toggleScenarioVisibility: (id) => {
    const next = new Set(get().visibleScenarioIds)
    if (next.has(id)) {
      next.delete(id)
      const nextCompared = get().comparedScenarioIds.filter((cid) => cid !== id)
      set({ visibleScenarioIds: next, comparedScenarioIds: nextCompared })
      try {
        localStorage.setItem(COMPARED_KEY, JSON.stringify(nextCompared))
      } catch { /* ignore */ }
    } else {
      next.add(id)
      set({ visibleScenarioIds: next })
    }
    try {
      localStorage.setItem(VISIBILITY_KEY, JSON.stringify([...next]))
    } catch { /* ignore */ }
  },

  toggleScenarioComparison: (id) => {
    const { comparedScenarioIds, visibleScenarioIds } = get()
    if (comparedScenarioIds.includes(id)) {
      const next = comparedScenarioIds.filter((cid) => cid !== id)
      set({ comparedScenarioIds: next })
      try { localStorage.setItem(COMPARED_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    } else {
      if (comparedScenarioIds.length >= MAX_COMPARED) return
      const nextVisible = new Set(visibleScenarioIds)
      nextVisible.add(id)
      const next = [...comparedScenarioIds, id]
      set({ comparedScenarioIds: next, visibleScenarioIds: nextVisible })
      try {
        localStorage.setItem(COMPARED_KEY, JSON.stringify(next))
        localStorage.setItem(VISIBILITY_KEY, JSON.stringify([...nextVisible]))
      } catch { /* ignore */ }
    }
  },

  setComparedScenarioIds: (ids) => {
    set({ comparedScenarioIds: ids.slice(0, MAX_COMPARED) })
    try { localStorage.setItem(COMPARED_KEY, JSON.stringify(ids.slice(0, MAX_COMPARED))) } catch { /* ignore */ }
  },

  getScenarioDisplayMode: (id) => {
    return getScenarioDisplayMode(id, get().comparedScenarioIds, get().visibleScenarioIds)
  },

  getScenarioRenderInfo: (id) => {
    const mode = getScenarioDisplayMode(id, get().comparedScenarioIds, get().visibleScenarioIds)
    if (mode === 'hidden') return null
    const color = getScenarioColor(id, get().comparedScenarioIds)
    const style = getScenarioStyle(mode, color)
    return { id, mode, color, style }
  },

  getVisibleScenarios: () => {
    const { scenarios, visibleScenarioIds, comparedScenarioIds } = get()
    return scenarios.filter(
      (s) => visibleScenarioIds.has(s.id) || comparedScenarioIds.includes(s.id)
    )
  },

  importScenarios: (json) => {
    const errors: string[] = []
    let imported = 0
    try {
      const parsed = JSON.parse(json)
      let incoming: unknown[]
      if (Array.isArray(parsed)) {
        incoming = parsed
      } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.scenarios)) {
        incoming = parsed.scenarios
      } else {
        return { imported: 0, errors: ['Invalid format: expected array or { scenarios: [...] }'] }
      }

      const existing = get().scenarios
      const existingIds = new Set(existing.map((s) => s.id))
      const newScenarios: Scenario[] = []

      for (const item of incoming) {
        if (!item || typeof item !== 'object') {
          errors.push('Skipped non-object entry')
          continue
        }
        const s = item as Record<string, unknown>
        if (!s.name || !s.weights || !s.method || !Array.isArray(s.placements)) {
          errors.push(`Skipped entry missing required fields (name/weights/method/placements)`)
          continue
        }
        let id = (s.id as string) || generateId()
        if (existingIds.has(id)) {
          id = generateId()
        }
        existingIds.add(id)
        newScenarios.push({
          ...(s as unknown as Scenario),
          id,
          timestamp: (s.timestamp as number) || Date.now(),
        })
        imported++
      }

      if (newScenarios.length > 0) {
        set({ scenarios: [...existing, ...newScenarios] })
        get().saveToStorage()
      }
    } catch (e) {
      errors.push(`Parse error: ${e instanceof Error ? e.message : String(e)}`)
    }
    return { imported, errors }
  },

  exportScenarios: (ids) => {
    const scenarios = ids
      ? get().scenarios.filter((s) => ids.includes(s.id))
      : get().scenarios
    return JSON.stringify({ version: 1, scenarios }, null, 2)
  },

  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const scenarios = JSON.parse(raw) as Scenario[]
        const visible = loadSetFromStorage(VISIBILITY_KEY)
        const compared = loadArrayFromStorage(COMPARED_KEY)
        const scenarioIds = new Set(scenarios.map((s) => s.id))
        const validVisible = new Set([...visible].filter((id) => scenarioIds.has(id)))
        const validCompared = compared.filter((id) => scenarioIds.has(id))
        set({ scenarios, visibleScenarioIds: validVisible, comparedScenarioIds: validCompared })
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
