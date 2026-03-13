import { create } from 'zustand'

interface MapState {
  center: [number, number]
  zoom: number
  bounds: { north: number; south: number; east: number; west: number } | null
  selectedH3Cell: string | null
  hoveredH3Cell: string | null
  displayResolution: number
  isMapReady: boolean
  visibleLayers: string[]
  selectedLSOA: string | null
  selectedLSOAName: string | null
  selectedBoroughName: string | null

  setCenter: (center: [number, number]) => void
  setZoom: (zoom: number) => void
  setBounds: (bounds: { north: number; south: number; east: number; west: number }) => void
  selectH3Cell: (cell: string | null) => void
  setHoveredH3Cell: (cell: string | null) => void
  setDisplayResolution: (resolution: number) => void
  setMapReady: (ready: boolean) => void
  toggleLayer: (layerId: string) => void
  setSelectedLSOA: (lsoa: string | null, name?: string | null, boroughName?: string | null) => void
}

const LONDON_CENTER: [number, number] = [-0.1276, 51.5074]

export const useMapStore = create<MapState>((set, get) => ({
  center: LONDON_CENTER,
  zoom: 10,
  bounds: null,
  selectedH3Cell: null,
  hoveredH3Cell: null,
  displayResolution: 7,
  isMapReady: false,
  visibleLayers: ['mcda-h3'],
  selectedLSOA: null,
  selectedLSOAName: null,
  selectedBoroughName: null,

  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  setBounds: (bounds) => set({ bounds }),
  selectH3Cell: (cell) => set({ selectedH3Cell: cell }),
  setHoveredH3Cell: (cell) => set({ hoveredH3Cell: cell }),
  setDisplayResolution: (resolution) => set({ displayResolution: resolution }),
  setMapReady: (ready) => set({ isMapReady: ready }),
  setSelectedLSOA: (lsoa, name = null, boroughName = null) => set({ selectedLSOA: lsoa, selectedLSOAName: name, selectedBoroughName: boroughName }),
  toggleLayer: (layerId) => {
    const { visibleLayers } = get()
    if (visibleLayers.includes(layerId)) {
      set({ visibleLayers: visibleLayers.filter((l) => l !== layerId) })
    } else {
      set({ visibleLayers: [...visibleLayers, layerId] })
    }
  },
}))
