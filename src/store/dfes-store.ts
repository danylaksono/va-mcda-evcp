import { create } from 'zustand'

export interface DFESRecord {
  lsoa21cd: string
  lad22nm: string
  pathway: string
  year: string
  number_of_electric_cars_hybrid_and_full_electric: number
  number_of_electric_vans_hybrid_and_full_electric: number
  number_of_domestic_heat_pumps: number
  number_of_domestic_batteries_kw: number
  [key: string]: string | number
}

export interface DFESDataPoint {
  year: number
  value: number
}

export interface DFESSeries {
  pathway: string
  points: DFESDataPoint[]
}

export type DFESMetric = 'electric_cars' | 'electric_vans' | 'heat_pumps' | 'batteries'

interface DFESStore {
  selectedLSOA: string | null
  selectedPathway: string | null
  availablePathways: string[]
  selectedMetric: DFESMetric
  series: DFESSeries[]
  isLoading: boolean
  error: string | null

  setSelectedLSOA: (lsoa: string | null) => void
  setSelectedPathway: (pathway: string | null) => void
  setSelectedMetric: (metric: DFESMetric) => void
  setAvailablePathways: (pathways: string[]) => void
  setSeries: (series: DFESSeries[]) => void
  setIsLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  getSeries: () => DFESSeries[]
}

export const useDFESStore = create<DFESStore>((set, get) => ({
  selectedLSOA: null,
  selectedPathway: null,
  availablePathways: [],
  selectedMetric: 'electric_cars',
  series: [],
  isLoading: false,
  error: null,

  setSelectedLSOA: (lsoa) => set({ selectedLSOA: lsoa }),
  setSelectedPathway: (pathway) => set({ selectedPathway: pathway }),
  setSelectedMetric: (metric) => set({ selectedMetric: metric }),
  setAvailablePathways: (pathways) => set({ availablePathways: pathways }),
  setSeries: (series) => set({ series }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  getSeries: () => {
    const { series, selectedPathway } = get()
    if (!selectedPathway || selectedPathway === '') return series
    return series.filter((s) => s.pathway === selectedPathway)
  },
}))
