import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cellToParent, getResolution } from 'h3-js'
import { useMapStore } from '@/store/map-store'
import { useMCDAStore } from '@/store/mcda-store'
import { useScenarioStore } from '@/store/scenario-store'
import { h3ScoresToGeoJSON, getH3Center } from '@/utils/h3-utils'
import { scoreToColor } from '@/utils/color-scales'
import { ChargerConfig } from '../impact/ChargerConfig'

interface MapViewProps {
  mcdaResults: Array<{
    h3_cell: string
    mcda_score: number
    criterion_values?: Record<string, number>
    raw_values?: Record<string, number>
  }>
}

interface GlyphDatum {
  h3Cell: string
  score: number
  criterionValues: Record<string, number>
  rawValues: Record<string, number>
  lat: number
  lng: number
}

const LONDON_CENTER: [number, number] = [-0.1276, 51.5074]
const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

export function MapView({ mcdaResults }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const tooltipRef = useRef<maplibregl.Popup | null>(null)
  const glyphTooltipActiveRef = useRef(false)
  const glyphMarkersRef = useRef<maplibregl.Marker[]>([])
  const [showChargerConfig, setShowChargerConfig] = useState(false)
  const [showPolygonLayer, setShowPolygonLayer] = useState(true)
  const [showGlyphLayer, setShowGlyphLayer] = useState(false)
  const [showTooltips, setShowTooltips] = useState(true)
  const [glyphType, setGlyphType] = useState<'bars' | 'rose'>('bars')
  const [glyphAggregation, setGlyphAggregation] = useState<'auto' | 6 | 7 | 8 | 9 | 10>(7)
  const [glyphSizeScale, setGlyphSizeScale] = useState(1)
  const [comparisonGlyph, setComparisonGlyph] = useState<GlyphDatum | null>(null)

  const setMapReady = useMapStore((s) => s.setMapReady)
  const isMapReady = useMapStore((s) => s.isMapReady)
  const selectH3Cell = useMapStore((s) => s.selectH3Cell)
  const selectedH3Cell = useMapStore((s) => s.selectedH3Cell)
  const setZoom = useMapStore((s) => s.setZoom)
  const criteria = useMCDAStore((s) => s.criteria)

  const currentPlacements = useScenarioStore((s) => s.currentPlacements)

  const glyphLegendCriteria = useMemo(() => {
    const maxItems = glyphType === 'rose' ? 8 : 6
    return criteria
      .filter((c) => c.active)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, maxItems)
  }, [criteria, glyphType])

  const getTooltipPopup = useCallback(() => {
    if (!tooltipRef.current) {
      tooltipRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 10,
        maxWidth: '560px',
        className: 'mcda-map-tooltip',
      })
    }
    return tooltipRef.current
  }, [])

  const formatTooltipNumber = useCallback((value: number) => {
    if (!Number.isFinite(value)) return 'n/a'
    if (Math.abs(value) >= 1000) {
      return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(value)
    }
    if (Math.abs(value) >= 1) {
      return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(value)
    }
    return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 4 }).format(value)
  }, [])

  const buildTooltipHtml = useCallback(
    (
      h3Cell: string,
      score: number,
      rawValues?: Record<string, number>,
      comparison?: { h3Cell: string; score: number; rawValues?: Record<string, number> }
    ) => {
      const activeCriteria = criteria
        .filter((c) => c.active)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 8)

      const buildPanel = (title: string, panelCell: string, panelScore: number, panelRaw?: Record<string, number>) => {
        const rows = activeCriteria
          .map((criterion) => {
            const raw = panelRaw?.[criterion.id]
            if (typeof raw !== 'number' || !Number.isFinite(raw)) return ''
            const valueColor = criterion.polarity === 'cost' ? '#b91c1c' : '#166534'
            const polarityLabel = criterion.polarity === 'cost' ? 'cost' : 'benefit'
            const polarityBg = criterion.polarity === 'cost' ? 'rgba(185,28,28,0.12)' : 'rgba(22,101,52,0.12)'
            return `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11px;line-height:1.2;">
                <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                  <span style="width:8px;height:8px;border-radius:999px;background:${criterion.color};display:inline-block;flex:0 0 auto;"></span>
                  <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#334155;">${criterion.name}</span>
                </div>
                <div style="display:flex;align-items:center;gap:5px;flex:0 0 auto;">
                  <span style="font-variant-numeric:tabular-nums;color:${valueColor};font-weight:700;">${formatTooltipNumber(raw)}</span>
                </div>
              </div>`
          })
          .filter(Boolean)
          .join('')

        return `
          <div style="min-width:220px;max-width:280px;padding:6px 8px;">
            <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-bottom:4px;">${title}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;font-weight:700;">H3 Cell</div>
              <div style="font-size:10px;color:#334155;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${panelCell}</div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(148,163,184,0.25);">
              <span style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;font-weight:700;">MCDA Score</span>
              <span style="font-size:12px;font-weight:700;color:#0f172a;font-variant-numeric:tabular-nums;">${Number.isFinite(panelScore) ? panelScore.toFixed(4) : 'n/a'}</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px;">
              ${rows || '<div style="font-size:11px;color:#64748b;">No raw attributes available.</div>'}
            </div>
          </div>`
      }

      if (comparison && comparison.h3Cell !== h3Cell) {
        return `
          <div style="display:flex;align-items:flex-start;gap:0;max-width:520px;">
            ${buildPanel('Selected', comparison.h3Cell, comparison.score, comparison.rawValues)}
            <div style="width:1px;align-self:stretch;background:rgba(148,163,184,0.3);"></div>
            ${buildPanel('Hovered', h3Cell, score, rawValues)}
          </div>`
      }

      return buildPanel('Area', h3Cell, score, rawValues)
    },
    [criteria, formatTooltipNumber]
  )

  const clearGlyphMarkers = useCallback(() => {
    glyphTooltipActiveRef.current = false
    tooltipRef.current?.remove()
    for (const marker of glyphMarkersRef.current) {
      marker.remove()
    }
    glyphMarkersRef.current = []
  }, [])

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
    if (!showTooltips) {
      glyphTooltipActiveRef.current = false
      tooltipRef.current?.remove()
    }
  }, [showTooltips])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isMapReady) return

    const canvas = map.getCanvas()
    const onWheel = (event: WheelEvent) => {
      if (!showGlyphLayer || !event.shiftKey) return

      event.preventDefault()
      event.stopPropagation()

      setGlyphSizeScale((prev) => {
        const delta = event.deltaY < 0 ? 0.08 : -0.08
        const next = prev + delta
        return Math.max(0.5, Math.min(2.8, Number(next.toFixed(2))))
      })
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [isMapReady, showGlyphLayer])

  useEffect(() => {
    if (!showGlyphLayer) {
      setComparisonGlyph(null)
    }
  }, [showGlyphLayer])

  useEffect(() => {
    initMap()
    return () => {
      tooltipRef.current?.remove()
      tooltipRef.current = null
      clearGlyphMarkers()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [initMap, clearGlyphMarkers])

  // Hover tooltip on polygon layer showing raw criterion values.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded() || !showPolygonLayer || !showTooltips) return

    const popup = getTooltipPopup()

    const onMouseMove = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      if (glyphTooltipActiveRef.current) return
      if (!e.features || e.features.length === 0) return
      const feature = e.features[0]
      const props = feature.properties ?? {}

      const score = Number(props.mcda_score)
      const h3Cell = String(props.h3_cell ?? '')

      const rawValues: Record<string, number> = {}
      for (const criterion of criteria) {
        const raw = Number(props[`raw_${criterion.id}`])
        if (Number.isFinite(raw)) {
          rawValues[criterion.id] = raw
        }
      }

      popup
        .setLngLat(e.lngLat)
        .setHTML(
          buildTooltipHtml(
            h3Cell,
            score,
            rawValues,
            comparisonGlyph
              ? {
                  h3Cell: comparisonGlyph.h3Cell,
                  score: comparisonGlyph.score,
                  rawValues: comparisonGlyph.rawValues,
                }
              : undefined
          )
        )
        .addTo(map)
    }

    const onMouseLeave = () => {
      if (glyphTooltipActiveRef.current) return
      popup.remove()
    }

    map.on('mousemove', 'h3-fill', onMouseMove)
    map.on('mouseleave', 'h3-fill', onMouseLeave)

    return () => {
      map.off('mousemove', 'h3-fill', onMouseMove)
      map.off('mouseleave', 'h3-fill', onMouseLeave)
      popup.remove()
    }
  }, [criteria, showPolygonLayer, showTooltips, comparisonGlyph, buildTooltipHtml, getTooltipPopup])

  // Clicking map background exits glyph comparison mode.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const onMapClick = (e: maplibregl.MapMouseEvent) => {
      if (!comparisonGlyph) return
      const hoveredPolygons = map.queryRenderedFeatures(e.point, { layers: ['h3-fill'] })
      if (hoveredPolygons.length === 0) {
        setComparisonGlyph(null)
        glyphTooltipActiveRef.current = false
        tooltipRef.current?.remove()
      }
    }

    map.on('click', onMapClick)
    return () => {
      map.off('click', onMapClick)
    }
  }, [comparisonGlyph])

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
    const resultByCell = new Map(mcdaResults.map((row) => [row.h3_cell, row]))
    for (const f of geojson.features) {
      const normalized = ((f.properties!.mcda_score as number) - minScore) / range
      f.properties!.fill_color = scoreToColor(normalized, 'viridis')

      const cellId = String(f.properties!.h3_cell)
      const rawValues = resultByCell.get(cellId)?.raw_values
      if (rawValues) {
        for (const [criterionId, raw] of Object.entries(rawValues)) {
          f.properties![`raw_${criterionId}`] = raw
        }
      }
    }

    source.setData(geojson)
  }, [mcdaResults])

  // Toggle polygon visibility.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const visibility = showPolygonLayer ? 'visible' : 'none'
    if (map.getLayer('h3-fill')) {
      map.setLayoutProperty('h3-fill', 'visibility', visibility)
    }
    if (map.getLayer('h3-outline')) {
      map.setLayoutProperty('h3-outline', 'visibility', visibility)
    }
  }, [showPolygonLayer])

  // Draw a glyph layer with criterion-level bars or rose petals as canvas markers.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    clearGlyphMarkers()
    if (!showGlyphLayer || mcdaResults.length === 0) return

    const maxCriteria = glyphType === 'rose' ? 8 : 6
    const activeCriteria = criteria
      .filter((c) => c.active)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, maxCriteria)
    if (activeCriteria.length === 0) return

    const grouped = new Map<string, {
      scoreSum: number
      count: number
      criterionSums: Record<string, number>
      rawSums: Record<string, number>
    }>()
    for (const row of mcdaResults) {
      let targetCell = row.h3_cell
      if (glyphAggregation !== 'auto') {
        try {
          const sourceRes = getResolution(row.h3_cell)
          if (glyphAggregation < sourceRes) {
            targetCell = cellToParent(row.h3_cell, glyphAggregation)
          }
        } catch {
          continue
        }
      }

      const existing = grouped.get(targetCell)
      if (existing) {
        existing.scoreSum += row.mcda_score
        existing.count += 1
        for (const criterion of activeCriteria) {
          const value = row.criterion_values?.[criterion.id]
          if (typeof value === 'number' && Number.isFinite(value)) {
            existing.criterionSums[criterion.id] = (existing.criterionSums[criterion.id] ?? 0) + value
          }
          const rawValue = row.raw_values?.[criterion.id]
          if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
            existing.rawSums[criterion.id] = (existing.rawSums[criterion.id] ?? 0) + rawValue
          }
        }
      } else {
        const criterionSums: Record<string, number> = {}
        const rawSums: Record<string, number> = {}
        for (const criterion of activeCriteria) {
          const value = row.criterion_values?.[criterion.id]
          if (typeof value === 'number' && Number.isFinite(value)) {
            criterionSums[criterion.id] = value
          }
          const rawValue = row.raw_values?.[criterion.id]
          if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
            rawSums[criterion.id] = rawValue
          }
        }
        grouped.set(targetCell, {
          scoreSum: row.mcda_score,
          count: 1,
          criterionSums,
          rawSums,
        })
      }
    }

    const aggregated = Array.from(grouped.entries()).map(([h3Cell, data]) => {
      const criterionValues: Record<string, number> = {}
      const rawValues: Record<string, number> = {}
      for (const criterion of activeCriteria) {
        const v = data.criterionSums[criterion.id]
        if (typeof v === 'number') {
          criterionValues[criterion.id] = v / data.count
        }
        const raw = data.rawSums[criterion.id]
        if (typeof raw === 'number') {
          rawValues[criterion.id] = raw / data.count
        }
      }

      return {
        h3Cell,
        score: data.scoreSum / data.count,
        criterionValues,
        rawValues,
      }
    })

    const selectedGlyph = comparisonGlyph
      ? aggregated.find((row) => row.h3Cell === comparisonGlyph.h3Cell) ?? null
      : null

    if (comparisonGlyph && !selectedGlyph) {
      setComparisonGlyph(null)
    }

    for (const row of aggregated) {
      let lat = 0
      let lng = 0
      try {
        ;[lat, lng] = getH3Center(row.h3Cell)
      } catch {
        continue
      }

      const baseHeight = glyphType === 'rose' ? 42 : 34
      const markerHeight = Math.round(baseHeight * glyphSizeScale)
      const markerWidth = glyphType === 'rose' ? markerHeight : Math.round(markerHeight * 1.25)

      const canvas = document.createElement('canvas')
      canvas.width = markerWidth
      canvas.height = markerHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) continue

      const patternCanvas = document.createElement('canvas')
      patternCanvas.width = 5
      patternCanvas.height = 5
      const patternCtx = patternCanvas.getContext('2d')
      if (patternCtx) {
        patternCtx.beginPath()
        patternCtx.strokeStyle = 'black'
        patternCtx.lineWidth = 1
        patternCtx.moveTo(0, 5)
        patternCtx.lineTo(5, 0)
        patternCtx.stroke()
      }
      const costPattern = ctx.createPattern(patternCanvas, 'repeat')

      const radius = 4
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.strokeStyle = 'rgba(15,23,42,0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(radius, 0)
      ctx.lineTo(markerWidth - radius, 0)
      ctx.quadraticCurveTo(markerWidth, 0, markerWidth, radius)
      ctx.lineTo(markerWidth, markerHeight - radius)
      ctx.quadraticCurveTo(markerWidth, markerHeight, markerWidth - radius, markerHeight)
      ctx.lineTo(radius, markerHeight)
      ctx.quadraticCurveTo(0, markerHeight, 0, markerHeight - radius)
      ctx.lineTo(0, radius)
      ctx.quadraticCurveTo(0, 0, radius, 0)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      if (glyphType === 'rose') {
        const centerX = markerWidth / 2
        const centerY = markerHeight / 2
        const innerRadius = 0
        const outerRadiusMax = markerWidth * 0.46
        const petals = activeCriteria.length
        const angleStep = (Math.PI * 2) / petals
        const gapAngle = Math.min(angleStep * 0.12, (2 * Math.PI) / 180)
        const maxWeight = Math.max(
          ...activeCriteria.map((criterion) => Math.abs(criterion.weight)),
          0.001
        )

        ctx.beginPath()
        ctx.arc(centerX, centerY, outerRadiusMax, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(15,23,42,0.08)'
        ctx.lineWidth = 1
        ctx.stroke()

        for (let i = 0; i < petals; i += 1) {
          const criterion = activeCriteria[i]
          const raw = row.criterionValues[criterion.id] ?? 0
          const value = Math.max(0, Math.min(1, raw))
          const segmentStart = -Math.PI / 2 + i * angleStep
          const segmentEnd = segmentStart + angleStep
          const midAngle = (segmentStart + segmentEnd) / 2
          const availableSweep = Math.max(0, angleStep - gapAngle * 2)
          const weightNorm = Math.max(0.1, Math.min(1, Math.abs(criterion.weight) / maxWeight))
          const sweep = Math.max(availableSweep * 0.18, availableSweep * weightNorm)
          const startAngle = midAngle - sweep / 2
          const endAngle = midAngle + sweep / 2
          const radius = innerRadius + value * (outerRadiusMax - innerRadius)

          ctx.beginPath()
          ctx.moveTo(centerX, centerY)
          ctx.arc(centerX, centerY, radius, startAngle, endAngle)
          ctx.closePath()
          ctx.fillStyle = criterion.color
          ctx.globalAlpha = 0.8
          ctx.fill()
          ctx.globalAlpha = 1

          ctx.strokeStyle = 'rgba(255,255,255,0.85)'
          ctx.lineWidth = 1
          ctx.stroke()

          if (criterion.polarity === 'cost' && costPattern) {
            ctx.beginPath()
            ctx.moveTo(centerX, centerY)
            ctx.arc(centerX, centerY, radius, startAngle, endAngle)
            ctx.closePath()
            ctx.fillStyle = costPattern
            ctx.globalAlpha = 0.22
            ctx.fill()
            ctx.globalAlpha = 1
          }
        }

        if (selectedGlyph) {
          ctx.save()
          ctx.strokeStyle = row.h3Cell === selectedGlyph.h3Cell ? 'rgba(15,23,42,0.9)' : 'rgba(15,23,42,0.6)'
          ctx.lineWidth = row.h3Cell === selectedGlyph.h3Cell ? 1.8 : 1.2
          ctx.setLineDash([2, 2])

          for (let i = 0; i < petals; i += 1) {
            const criterion = activeCriteria[i]
            const selectedValue = Math.max(
              0,
              Math.min(1, selectedGlyph.criterionValues[criterion.id] ?? 0)
            )
            const segmentStart = -Math.PI / 2 + i * angleStep
            const segmentEnd = segmentStart + angleStep
            const midAngle = (segmentStart + segmentEnd) / 2
            const availableSweep = Math.max(0, angleStep - gapAngle * 2)
            const weightNorm = Math.max(0.1, Math.min(1, Math.abs(criterion.weight) / maxWeight))
            const sweep = Math.max(availableSweep * 0.18, availableSweep * weightNorm)
            const startAngle = midAngle - sweep / 2
            const endAngle = midAngle + sweep / 2
            const selectedRadius = innerRadius + selectedValue * (outerRadiusMax - innerRadius)

            ctx.beginPath()
            ctx.moveTo(centerX, centerY)
            ctx.arc(centerX, centerY, selectedRadius, startAngle, endAngle)
            ctx.closePath()
            ctx.stroke()
          }

          ctx.restore()
        }

        ctx.beginPath()
        ctx.arc(centerX, centerY, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.95)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(15,23,42,0.25)'
        ctx.lineWidth = 1
        ctx.stroke()
      } else {
        const paddingX = 5
        const paddingY = 4
        const chartWidth = markerWidth - paddingX * 2
        const chartHeight = markerHeight - paddingY * 2
        const baseline = markerHeight - paddingY - 1

        const bars = activeCriteria.length
        const gap = bars > 4 ? 1 : 2
        const barWidth = Math.max(1, Math.floor((chartWidth - (bars - 1) * gap) / bars))

        activeCriteria.forEach((criterion, index) => {
          const raw = row.criterionValues[criterion.id] ?? 0
          const clamped = Math.max(0, Math.min(1, raw))
          const barHeight = Math.max(1, Math.round(clamped * (chartHeight - 2)))
          const x = paddingX + index * (barWidth + gap)
          const y = baseline - barHeight

          ctx.fillStyle = criterion.color
          ctx.fillRect(x, y, barWidth, barHeight)

          if (criterion.polarity === 'cost' && costPattern) {
            ctx.fillStyle = costPattern
            ctx.globalAlpha = 0.22
            ctx.fillRect(x, y, barWidth, barHeight)
            ctx.globalAlpha = 1
          }
        })

        if (selectedGlyph) {
          ctx.save()
          ctx.strokeStyle = row.h3Cell === selectedGlyph.h3Cell ? 'rgba(15,23,42,0.95)' : 'rgba(15,23,42,0.62)'
          ctx.lineWidth = row.h3Cell === selectedGlyph.h3Cell ? 1.8 : 1.2
          ctx.setLineDash([2, 2])

          activeCriteria.forEach((criterion, index) => {
            const selectedValue = Math.max(
              0,
              Math.min(1, selectedGlyph.criterionValues[criterion.id] ?? 0)
            )
            const selectedHeight = Math.max(1, Math.round(selectedValue * (chartHeight - 2)))
            const x = paddingX + index * (barWidth + gap)
            const y = baseline - selectedHeight
            ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, barWidth - 1), Math.max(1, selectedHeight - 1))
          })

          ctx.restore()
        }
      }

      const markerElement = document.createElement('div')
      markerElement.style.pointerEvents = 'auto'
      markerElement.style.cursor = 'pointer'
      markerElement.appendChild(canvas)

      const popup = getTooltipPopup()
      markerElement.addEventListener('click', (event) => {
        event.stopPropagation()

        const nextGlyph: GlyphDatum = {
          h3Cell: row.h3Cell,
          score: row.score,
          criterionValues: row.criterionValues,
          rawValues: row.rawValues,
          lat,
          lng,
        }

        if (comparisonGlyph?.h3Cell === row.h3Cell) {
          setComparisonGlyph(null)
          glyphTooltipActiveRef.current = false
          popup.remove()
          return
        }

        setComparisonGlyph(nextGlyph)
        if (!showTooltips) return

        glyphTooltipActiveRef.current = true
        popup
          .setLngLat([lng, lat])
          .setHTML(buildTooltipHtml(row.h3Cell, row.score, row.rawValues))
          .addTo(map)
      })

      markerElement.addEventListener('mouseenter', () => {
        if (!showTooltips) return
        glyphTooltipActiveRef.current = true
        popup
          .setLngLat([lng, lat])
          .setHTML(
            buildTooltipHtml(
              row.h3Cell,
              row.score,
              row.rawValues,
              comparisonGlyph
                ? {
                    h3Cell: comparisonGlyph.h3Cell,
                    score: comparisonGlyph.score,
                    rawValues: comparisonGlyph.rawValues,
                  }
                : undefined
            )
          )
          .addTo(map)
      })

      markerElement.addEventListener('mouseleave', () => {
        glyphTooltipActiveRef.current = false
        popup.remove()
      })

      const marker = new maplibregl.Marker({ element: markerElement, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map)
      glyphMarkersRef.current.push(marker)
    }
  }, [mcdaResults, criteria, showGlyphLayer, showTooltips, glyphAggregation, glyphType, glyphSizeScale, comparisonGlyph, clearGlyphMarkers, buildTooltipHtml, getTooltipPopup])

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

      {/* Layer Controls */}
      <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 border border-slate-200 min-w-[220px] z-10">
        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">
          Layers
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-700 mb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showPolygonLayer}
            onChange={(e) => setShowPolygonLayer(e.target.checked)}
            className="rounded border-slate-300"
          />
          MCDA H3 polygons
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-700 mb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showGlyphLayer}
            onChange={(e) => setShowGlyphLayer(e.target.checked)}
            className="rounded border-slate-300"
          />
          Glyph bar charts
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-700 mb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showTooltips}
            onChange={(e) => setShowTooltips(e.target.checked)}
            className="rounded border-slate-300"
          />
          Show tooltips
        </label>

        <div className="mt-2">
          <div className="text-[10px] text-slate-500 mb-1">Glyph type</div>
          <select
            value={glyphType}
            onChange={(e) => setGlyphType(e.target.value as 'bars' | 'rose')}
            className="w-full text-xs rounded-md border border-slate-300 bg-white px-2 py-1"
            disabled={!showGlyphLayer}
          >
            <option value="bars">Bar chart</option>
            <option value="rose">Rose chart (petal length)</option>
          </select>
        </div>

        <div className="mt-2">
          <div className="text-[10px] text-slate-500 mb-1">Glyph aggregation</div>
          <select
            value={glyphAggregation}
            onChange={(e) => {
              const value = e.target.value
              if (value === 'auto') {
                setGlyphAggregation('auto')
              } else {
                setGlyphAggregation(Number(value) as 6 | 7 | 8 | 9 | 10)
              }
            }}
            className="w-full text-xs rounded-md border border-slate-300 bg-white px-2 py-1"
            disabled={!showGlyphLayer}
          >
            <option value="auto">Auto (current result resolution)</option>
            <option value="10">H3 r10 (finest)</option>
            <option value="9">H3 r9</option>
            <option value="8">H3 r8</option>
            <option value="7">H3 r7</option>
            <option value="6">H3 r6 (coarse)</option>
          </select>
        </div>

        <div className="mt-2">
          {/* <div className="text-[10px] text-slate-500 mb-1">Glyph size</div>
          <div className="text-xs text-slate-700">
            {(glyphSizeScale * 100).toFixed(0)}%
          </div> */}
          {/* <div className="text-[10px] text-slate-500 mt-0.5">
            Hold Shift + scroll to resize
          </div> */}
        </div>

        <div className="mt-2 text-[10px] text-slate-500">
          Pattern fill = cost criterion
        </div>
        {/* {showGlyphLayer && (
          <div className="mt-1 text-[10px] text-slate-500">
            Click a glyph to compare. Click again or empty map to clear.
          </div>
        )} */}
      </div>

      {/* Glyph Legend */}
      {showGlyphLayer && glyphLegendCriteria.length > 0 && (
        <div className="absolute bottom-8 left-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-3 border border-slate-200 max-w-[270px] z-10">
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">
            Glyph Legend
          </div>
          <div className="text-[10px] text-slate-600 mb-2">
            {glyphType === 'rose'
              ? 'Petal length shows criterion score; petal width follows criterion weight.'
              : 'Bar height shows criterion score.'}
          </div>
          <div className="flex flex-col gap-1.5">
            {glyphLegendCriteria.map((criterion) => (
              <div key={criterion.id} className="flex items-center justify-between gap-2 text-[10px]">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3 h-3 rounded-[2px] border border-slate-300"
                    style={{ backgroundColor: criterion.color }}
                  />
                  <span className="truncate text-slate-700">{criterion.name}</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-500">
                  {criterion.polarity === 'cost' && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-slate-300 text-[9px]">
                      hatched
                    </span>
                  )}
                  <span className="font-mono">w:{criterion.weight.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
