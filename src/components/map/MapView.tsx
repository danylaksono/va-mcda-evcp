import React, { useEffect, useRef, useCallback, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMapStore } from '@/store/map-store'
import { useScenarioStore } from '@/store/scenario-store'
import { h3ScoresToGeoJSON, getH3CellAtPoint, getH3Center } from '@/utils/h3-utils'
import { scoreToColor } from '@/utils/color-scales'
import { ChargerConfig } from '../impact/ChargerConfig'

interface MapViewProps {
  mcdaResults: Array<{ h3_cell: string; mcda_score: number }>
}

const LONDON_CENTER: [number, number] = [-0.1276, 51.5074]
const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

export function MapView({ mcdaResults }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [showChargerConfig, setShowChargerConfig] = useState(false)

  const setMapReady = useMapStore((s) => s.setMapReady)
  const selectH3Cell = useMapStore((s) => s.selectH3Cell)
  const selectedH3Cell = useMapStore((s) => s.selectedH3Cell)
  const setZoom = useMapStore((s) => s.setZoom)

  const currentPlacements = useScenarioStore((s) => s.currentPlacements)

  const initMap = useCallback(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: BASEMAP_STYLE,
      center: LONDON_CENTER,
      zoom: 10,
      minZoom: 6,
      maxZoom: 16,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 150 }),
      'bottom-left'
    )

    map.on('load', () => {
      map.addSource('h3-grid', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      map.addLayer({
        id: 'h3-fill',
        type: 'fill',
        source: 'h3-grid',
        paint: {
          'fill-color': ['coalesce', ['get', 'fill_color'], '#cccccc'],
          'fill-opacity': 0.65,
        },
      })

      map.addLayer({
        id: 'h3-outline',
        type: 'line',
        source: 'h3-grid',
        paint: {
          'line-color': '#ffffff',
          'line-width': 0.5,
          'line-opacity': 0.4,
        },
      })

      map.addSource('evcp-markers', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      map.addLayer({
        id: 'evcp-markers',
        type: 'circle',
        source: 'evcp-markers',
        paint: {
          'circle-radius': 8,
          'circle-color': '#ef4444',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      setMapReady(true)
    })

    map.on('click', 'h3-fill', (e) => {
      if (e.features && e.features.length > 0) {
        const cell = e.features[0].properties?.h3_cell as string
        selectH3Cell(cell)
        setShowChargerConfig(true)
      }
    })

    map.on('mouseenter', 'h3-fill', () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', 'h3-fill', () => {
      map.getCanvas().style.cursor = ''
    })

    map.on('zoomend', () => {
      setZoom(Math.round(map.getZoom()))
    })

    mapRef.current = map
  }, [setMapReady, selectH3Cell, setZoom])

  useEffect(() => {
    initMap()
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [initMap])

  // Update H3 grid when MCDA results change
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const source = map.getSource('h3-grid') as maplibregl.GeoJSONSource
    if (!source) return

    if (mcdaResults.length === 0) {
      source.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    let minScore = Infinity
    let maxScore = -Infinity
    for (const r of mcdaResults) {
      if (r.mcda_score < minScore) minScore = r.mcda_score
      if (r.mcda_score > maxScore) maxScore = r.mcda_score
    }
    const range = maxScore - minScore || 1

    const geojson = h3ScoresToGeoJSON(mcdaResults)
    for (const f of geojson.features) {
      const normalized = ((f.properties!.mcda_score as number) - minScore) / range
      f.properties!.fill_color = scoreToColor(normalized, 'viridis')
    }

    source.setData(geojson)
  }, [mcdaResults])

  // Update EVCP markers
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const source = map.getSource('evcp-markers') as maplibregl.GeoJSONSource
    if (!source) return

    const features = currentPlacements.map((p) => {
      const [lat, lng] = getH3Center(p.h3Cell)
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lng, lat] },
        properties: {
          h3_cell: p.h3Cell,
          charger_type: p.chargerType,
          charger_count: p.chargerCount,
        },
      }
    })

    source.setData({ type: 'FeatureCollection', features })
  }, [currentPlacements])

  return (
    <div className="relative flex-1">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Color Legend */}
      <div className="absolute bottom-8 right-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-3 border border-slate-200">
        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">
          Suitability Score
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-slate-400">Low</span>
          <div className="flex h-3">
            {Array.from({ length: 20 }, (_, i) => (
              <div
                key={i}
                className="w-2 h-full"
                style={{ backgroundColor: scoreToColor(i / 19, 'viridis') }}
              />
            ))}
          </div>
          <span className="text-[9px] text-slate-400">High</span>
        </div>
      </div>

      {/* Charger Config Popup */}
      {showChargerConfig && selectedH3Cell && (
        <div className="absolute top-4 left-4 z-10">
          <ChargerConfig
            h3Cell={selectedH3Cell}
            onClose={() => {
              setShowChargerConfig(false)
              selectH3Cell(null)
            }}
          />
        </div>
      )}
    </div>
  )
}
