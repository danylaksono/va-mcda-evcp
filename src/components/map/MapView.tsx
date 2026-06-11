import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import maplibregl from 'maplibre-gl'
import { ScreenGridLayerGL } from 'screengrid'
import type {
  LineLayerSpecification,
  CircleLayerSpecification,
  FillLayerSpecification,
  SymbolLayerSpecification,
} from '@maplibre/maplibre-gl-style-spec'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cellToParent, getResolution } from 'h3-js'
import { Protocol } from 'pmtiles'
import { useMapStore } from '@/store/map-store'
import { useMCDAStore } from '@/store/mcda-store'
import { useScenarioStore } from '@/store/scenario-store'
import { h3ScoresToGeoJSON, getH3Center, zoomToH3Resolution } from '@/utils/h3-utils'
import { scoreToColor } from '@/utils/color-scales'
import { ChargerConfig } from '../impact/ChargerConfig'
import { Maximize2, Minimize2, SlidersHorizontal, Zap } from 'lucide-react'
import type { Criterion, EVCPPlacement, PlacementCellData } from '@/analysis/types'
import { buildScenarioRenderList, MUTED_COLOR } from '@/scenarios/scenario-styles'

interface MapViewProps {
  mcdaResults: Array<{
    h3_cell: string
    mcda_score: number
    criterion_values?: Record<string, number>
    raw_values?: Record<string, number>
    lsoa21cd?: string
    lsoa21nm?: string
    borough_name?: string
  }>
}

interface GlyphDatum {
  h3Cell: string
  label?: string
  score: number
  criterionValues: Record<string, number>
  rawValues: Record<string, number>
  lat: number
  lng: number
}

interface GlyphRenderRow extends GlyphDatum {
  displayValues: Record<string, number>
}

interface ScreenGridCellDatum {
  data?: GlyphRenderRow
  weight?: number
}

interface ScreenGridCellInfo {
  cellData?: ScreenGridCellDatum[]
  cellSize?: number
  glyphRadius?: number
  index?: number
}

interface ClickLocation {
  lat: number
  lng: number
}

type GlyphContrastMode = 'true' | 'rank'
type GlyphRenderer = 'h3-markers' | 'screengrid'
type GlyphType = 'bars' | 'rose'

const LONDON_CENTER: [number, number] = [-0.1276, 51.5074]
const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const EVCP_CURSOR_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 34 34'><path fill='%23dc2626' d='M17 33s10-11.2 10-18A10 10 0 1 0 7 15c0 6.8 10 18 10 18Z'/><circle cx='17' cy='14.5' r='6.3' fill='%23fff'/><path fill='%230f172a' d='M18 10h-2.2l-.8 4h2.1l-.8 4 3.7-5h-2.1z'/></svg>`
const EVCP_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(EVCP_CURSOR_SVG)}") 17 31, crosshair`
const CHARGEPOINT_ICON_ID = 'chargepoint-marker'
const SCREEN_GRID_GLYPH_LAYER_ID = 'mcda-screengrid-glyphs'
const GLYPH_SIZE_MIN = 0.5
const GLYPH_SIZE_MAX = 3.8
const GLYPH_CONTRAST_MIN = 0
const GLYPH_CONTRAST_MAX = 1
// const CHARGEPOINT_ICON_URL = '/icons/chargepoint-marker.svg'

const GLYPH_CRITERIA_LIMIT = 6

const getGlyphMaxCriteria = (_glyphType: GlyphType) => GLYPH_CRITERIA_LIMIT

const arraysEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

const resolveGlyphCriterionIds = (
  criteria: Criterion[],
  selectedIds: string[],
  glyphType: GlyphType
) => {
  const maxCriteria = getGlyphMaxCriteria(glyphType)
  const activeCriteria = criteria.filter((criterion) => criterion.active)
  const activeIds = new Set(activeCriteria.map((criterion) => criterion.id))
  const resolved = selectedIds.filter((id, index) => activeIds.has(id) && selectedIds.indexOf(id) === index)
  const selectedSet = new Set(resolved)

  for (const criterion of activeCriteria.sort((a, b) => b.weight - a.weight)) {
    if (resolved.length >= maxCriteria) break
    if (!selectedSet.has(criterion.id)) {
      resolved.push(criterion.id)
      selectedSet.add(criterion.id)
    }
  }

  return resolved.slice(0, maxCriteria)
}

type OverlayConfig =
  | {
    id: string
    label: string
    url: string
    sourceLayer: string
    type: 'line'
    paint: NonNullable<LineLayerSpecification['paint']>
  }
  | {
    id: string
    label: string
    url: string
    sourceLayer: string
    type: 'circle'
    paint: NonNullable<CircleLayerSpecification['paint']>
  }
  | {
    id: string
    label: string
    url: string
    sourceLayer: string
    type: 'fill'
    paint: NonNullable<FillLayerSpecification['paint']>
  }
  | {
    id: string
    label: string
    url: string
    sourceLayer: string
    type: 'symbol'
    layout: NonNullable<SymbolLayerSpecification['layout']>
    paint?: SymbolLayerSpecification['paint']
  }

const PMTILES_OVERLAYS: OverlayConfig[] = [
  {
    id: 'lsoa-boundaries',
    label: 'LSOA boundaries',
    url: '/data_source/pmtiles/lsoa_boundaries.pmtiles',
    sourceLayer: 'lsoa_boundaries',
    type: 'line',
    paint: {
      'line-color': '#0f172a',
      'line-width': 0.8,
      'line-opacity': 0.4,
    },
  },
  {
    id: 'london-boroughs',
    label: 'London boroughs',
    url: '/data_source/pmtiles/london_boroughs.pmtiles',
    sourceLayer: 'london_boroughs',
    type: 'line',
    paint: {
      'line-color': '#0f172a',
      'line-width': 1.4,
      'line-opacity': 0.7,
    },
  },
  {
    id: 'london-chargepoints',
    label: 'Existing Chargepoints',
    url: '/data_source/pmtiles/london_chargepoints.pmtiles',
    sourceLayer: 'london_chargepoints',
    type: 'symbol',
    layout: {
      'icon-image': CHARGEPOINT_ICON_ID,
      'icon-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        9,
        0.4,
        12,
        0.55,
        15,
        0.7,
      ],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  },
  {
    id: 'lsoa-fills',
    label: 'LSOA Area Selections',
    url: '/data_source/pmtiles/lsoa_boundaries.pmtiles',
    sourceLayer: 'lsoa_boundaries',
    type: 'fill',
    paint: {
      'fill-color': 'rgba(0,0,0,0)',
      'fill-opacity': 0
    },
  },
]

const buildOverlayLayer = (
  overlay: OverlayConfig,
  sourceId: string,
  visibility: 'visible' | 'none'
): LineLayerSpecification | CircleLayerSpecification | FillLayerSpecification | SymbolLayerSpecification => {
  if (overlay.type === 'line') {
    return {
      id: overlay.id,
      type: 'line',
      source: sourceId,
      'source-layer': overlay.sourceLayer,
      layout: { visibility },
      paint: overlay.paint,
    }
  }
  if (overlay.type === 'circle') {
    return {
      id: overlay.id,
      type: 'circle',
      source: sourceId,
      'source-layer': overlay.sourceLayer,
      layout: { visibility },
      paint: overlay.paint,
    }
  }
  if (overlay.type === 'symbol') {
    return {
      id: overlay.id,
      type: 'symbol',
      source: sourceId,
      'source-layer': overlay.sourceLayer,
      layout: {
        ...overlay.layout,
        visibility,
      },
      paint: overlay.paint ?? {},
    }
  }
  return {
    id: overlay.id,
    type: 'fill',
    source: sourceId,
    'source-layer': overlay.sourceLayer,
    layout: { visibility },
    paint: overlay.paint,
  }
}

const clamp01 = (value: number) => {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

const computeRankValues = (
  rows: Array<{ h3Cell: string; criterionValues: Record<string, number> }>,
  criterionId: string
) => {
  const ranked = rows
    .map((row) => ({
      h3Cell: row.h3Cell,
      value: clamp01(row.criterionValues[criterionId] ?? 0),
    }))
    .sort((a, b) => a.value - b.value)

  const ranks = new Map<string, number>()
  const lastIndex = ranked.length - 1
  if (lastIndex <= 0) {
    for (const row of ranked) ranks.set(row.h3Cell, row.value)
    return ranks
  }

  for (let i = 0; i < ranked.length;) {
    let j = i + 1
    while (j < ranked.length && ranked[j].value === ranked[i].value) {
      j += 1
    }
    const percentile = ((i + j - 1) / 2) / lastIndex
    for (let k = i; k < j; k += 1) {
      ranks.set(ranked[k].h3Cell, percentile)
    }
    i = j
  }

  return ranks
}

const buildGlyphRows = (
  mcdaResults: MapViewProps['mcdaResults'],
  criteria: Criterion[],
  glyphCriterionIds: string[],
  glyphType: GlyphType,
  glyphAggregation: 'auto' | 6 | 7 | 8 | 9 | 10,
  glyphContrastMode: GlyphContrastMode,
  glyphContrastStrength: number
): { activeCriteria: Criterion[]; rows: GlyphRenderRow[] } => {
  const activeCriteriaById = new Map(criteria.filter((criterion) => criterion.active).map((criterion) => [criterion.id, criterion]))
  const activeCriteria = glyphCriterionIds
    .map((id) => activeCriteriaById.get(id))
    .filter((criterion): criterion is Criterion => Boolean(criterion))

  if (activeCriteria.length === 0 || mcdaResults.length === 0) {
    return { activeCriteria, rows: [] }
  }

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
    const target = existing ?? {
      scoreSum: 0,
      count: 0,
      criterionSums: {},
      rawSums: {},
    }

    target.scoreSum += row.mcda_score
    target.count += 1
    for (const criterion of activeCriteria) {
      const value = row.criterion_values?.[criterion.id]
      if (typeof value === 'number' && Number.isFinite(value)) {
        target.criterionSums[criterion.id] = (target.criterionSums[criterion.id] ?? 0) + value
      }
      const rawValue = row.raw_values?.[criterion.id]
      if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
        target.rawSums[criterion.id] = (target.rawSums[criterion.id] ?? 0) + rawValue
      }
    }

    if (!existing) grouped.set(targetCell, target)
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

  const rankValuesByCriterion = new Map<string, Map<string, number>>()
  if (glyphContrastMode === 'rank' && glyphContrastStrength > 0) {
    for (const criterion of activeCriteria) {
      rankValuesByCriterion.set(criterion.id, computeRankValues(aggregated, criterion.id))
    }
  }

  const rows: GlyphRenderRow[] = []
  for (const row of aggregated) {
    let lat = 0
    let lng = 0
    try {
      ;[lat, lng] = getH3Center(row.h3Cell)
    } catch {
      continue
    }

    const displayValues: Record<string, number> = {}
    for (const criterion of activeCriteria) {
      const trueValue = clamp01(row.criterionValues[criterion.id] ?? 0)
      const contrastValue =
        glyphContrastMode === 'rank'
          ? rankValuesByCriterion.get(criterion.id)?.get(row.h3Cell) ?? trueValue
          : trueValue
      displayValues[criterion.id] = clamp01(
        trueValue * (1 - glyphContrastStrength) + contrastValue * glyphContrastStrength
      )
    }

    rows.push({
      ...row,
      label: row.h3Cell,
      displayValues,
      lat,
      lng,
    })
  }

  return { activeCriteria, rows }
}

const createCostPattern = (ctx: CanvasRenderingContext2D) => {
  const patternCanvas = document.createElement('canvas')
  patternCanvas.width = 5
  patternCanvas.height = 5
  const patternCtx = patternCanvas.getContext('2d')
  if (!patternCtx) return null

  patternCtx.beginPath()
  patternCtx.strokeStyle = 'black'
  patternCtx.lineWidth = 1
  patternCtx.moveTo(0, 5)
  patternCtx.lineTo(5, 0)
  patternCtx.stroke()

  return ctx.createPattern(patternCanvas, 'repeat')
}

const drawCriterionGlyph = (
  ctx: CanvasRenderingContext2D,
  {
    centerX,
    centerY,
    width,
    height,
    glyphType,
    criteria,
    values,
    isSelected,
  }: {
    centerX: number
    centerY: number
    width: number
    height: number
    glyphType: 'bars' | 'rose'
    criteria: Criterion[]
    values: Record<string, number>
    isSelected: boolean
  }
) => {
  const costPattern = createCostPattern(ctx)

  if (glyphType === 'rose') {
    const outerRadiusMax = Math.min(width, height) * 0.45
    const petals = criteria.length
    const angleStep = (Math.PI * 2) / petals
    const gapAngle = Math.min(angleStep * 0.12, (2 * Math.PI) / 180)
    const maxWeight = Math.max(...criteria.map((criterion) => Math.abs(criterion.weight)), 0.001)

    ctx.beginPath()
    ctx.arc(centerX, centerY, outerRadiusMax, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(15,23,42,0.08)'
    ctx.lineWidth = 1
    ctx.stroke()

    for (let i = 0; i < petals; i += 1) {
      const criterion = criteria[i]
      const value = clamp01(values[criterion.id] ?? 0)
      const segmentStart = -Math.PI / 2 + i * angleStep
      const segmentEnd = segmentStart + angleStep
      const midAngle = (segmentStart + segmentEnd) / 2
      const availableSweep = Math.max(0, angleStep - gapAngle * 2)
      const weightNorm = Math.max(0.1, Math.min(1, Math.abs(criterion.weight) / maxWeight))
      const sweep = Math.max(availableSweep * 0.18, availableSweep * weightNorm)
      const startAngle = midAngle - sweep / 2
      const endAngle = midAngle + sweep / 2
      const radius = value * outerRadiusMax

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

    if (isSelected) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(centerX, centerY, outerRadiusMax + 1.5, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(15,23,42,0.5)'
      ctx.lineWidth = 1.2
      ctx.stroke()
      ctx.restore()
    }

    ctx.beginPath()
    ctx.arc(centerX, centerY, 2, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(15,23,42,0.55)'
    ctx.fill()
    return
  }

  const left = centerX - width / 2
  const top = centerY - height / 2
  const paddingX = 5
  const paddingY = 4
  const chartWidth = width - paddingX * 2
  const chartHeight = height - paddingY * 2
  const baseline = top + height - paddingY - 1
  const gap = criteria.length > 4 ? 1 : 2
  const barWidth = Math.max(1, Math.floor((chartWidth - (criteria.length - 1) * gap) / criteria.length))

  criteria.forEach((criterion, index) => {
    const clamped = clamp01(values[criterion.id] ?? 0)
    const barHeight = Math.max(1, Math.round(clamped * (chartHeight - 2)))
    const x = left + paddingX + index * (barWidth + gap)
    const y = baseline - barHeight

    ctx.fillStyle = criterion.color
    ctx.shadowColor = 'rgba(255,255,255,0.65)'
    ctx.shadowBlur = 1.5
    ctx.fillRect(x, y, barWidth, barHeight)
    ctx.shadowBlur = 0
    ctx.strokeStyle = 'rgba(15,23,42,0.18)'
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, barWidth - 1), Math.max(1, barHeight - 1))

    if (criterion.polarity === 'cost' && costPattern) {
      ctx.fillStyle = costPattern
      ctx.globalAlpha = 0.22
      ctx.fillRect(x, y, barWidth, barHeight)
      ctx.globalAlpha = 1
    }
  })

  if (isSelected) {
    ctx.save()
    ctx.strokeStyle = 'rgba(15,23,42,0.55)'
    ctx.lineWidth = 1.2
    ctx.strokeRect(left + 1.5, top + 1.5, width - 3, height - 3)
    ctx.restore()
  }
}

const summarizeScreenGridCell = (
  cellInfo: ScreenGridCellInfo,
  criteria: Criterion[]
): GlyphRenderRow | null => {
  const rows = (cellInfo.cellData ?? [])
    .map((item) => item.data)
    .filter((row): row is GlyphRenderRow => Boolean(row))

  if (rows.length === 0) return null
  if (rows.length === 1) return rows[0]

  const criterionValues: Record<string, number> = {}
  const rawValues: Record<string, number> = {}
  const displayValues: Record<string, number> = {}
  for (const criterion of criteria) {
    let criterionSum = 0
    let rawSum = 0
    let displaySum = 0
    let criterionCount = 0
    let rawCount = 0
    let displayCount = 0

    for (const row of rows) {
      const criterionValue = row.criterionValues[criterion.id]
      if (typeof criterionValue === 'number' && Number.isFinite(criterionValue)) {
        criterionSum += criterionValue
        criterionCount += 1
      }
      const rawValue = row.rawValues[criterion.id]
      if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
        rawSum += rawValue
        rawCount += 1
      }
      const displayValue = row.displayValues[criterion.id]
      if (typeof displayValue === 'number' && Number.isFinite(displayValue)) {
        displaySum += displayValue
        displayCount += 1
      }
    }

    if (criterionCount > 0) criterionValues[criterion.id] = criterionSum / criterionCount
    if (rawCount > 0) rawValues[criterion.id] = rawSum / rawCount
    if (displayCount > 0) displayValues[criterion.id] = displaySum / displayCount
  }

  const score = rows.reduce((sum, row) => sum + row.score, 0) / rows.length
  const lat = rows.reduce((sum, row) => sum + row.lat, 0) / rows.length
  const lng = rows.reduce((sum, row) => sum + row.lng, 0) / rows.length

  return {
    h3Cell: `screen-grid:${cellInfo.index ?? 'cell'}`,
    label: `${rows.length} H3 cells`,
    score,
    criterionValues,
    rawValues,
    displayValues,
    lat,
    lng,
  }
}

export function MapView({ mcdaResults }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const tooltipRef = useRef<maplibregl.Popup | null>(null)
  const glyphTooltipActiveRef = useRef(false)
  const glyphMarkersRef = useRef<maplibregl.Marker[]>([])
  const screengridLayerRef = useRef<ScreenGridLayerGL<GlyphRenderRow> | null>(null)
  const previousCriterionWeightsRef = useRef<Record<string, number>>({})
  const latestPlacementsRef = useRef<EVCPPlacement[]>([])
  const mcdaResultsRef = useRef(mcdaResults)
  const isSimulationModeRef = useRef(false)
  const pmtilesProtocolRef = useRef<Protocol | null>(null)
  const [showChargerConfig, setShowChargerConfig] = useState(false)
  const [showPolygonLayer, setShowPolygonLayer] = useState(true)
  const [polygonOpacity, setPolygonOpacity] = useState(0.65)
  const [showGlyphLayer, setShowGlyphLayer] = useState(false)
  const [showTooltips, setShowTooltips] = useState(false)
  const [showLayerPanel, setShowLayerPanel] = useState(true)
  const [showGlyphLegend, setShowGlyphLegend] = useState(true)
  const [isMapFullscreen, setIsMapFullscreen] = useState(false)
  const [glyphType, setGlyphType] = useState<GlyphType>('bars')
  const [glyphRenderer, setGlyphRenderer] = useState<GlyphRenderer>('screengrid')
  const [glyphCriterionIds, setGlyphCriterionIds] = useState<string[]>([])
  const [glyphAggregation, setGlyphAggregation] = useState<'auto' | 6 | 7 | 8 | 9 | 10>(7)
  const [glyphSizeScale, setGlyphSizeScale] = useState(1)
  const [glyphContrastMode, setGlyphContrastMode] = useState<GlyphContrastMode>('rank')
  const [glyphContrastStrength, setGlyphContrastStrength] = useState(0.65)
  const [comparisonGlyph, setComparisonGlyph] = useState<GlyphDatum | null>(null)
  const [selectedClickLocation, setSelectedClickLocation] = useState<ClickLocation | null>(null)
  const [placementCellData, setPlacementCellData] = useState<PlacementCellData | null>(null)
  const [overlayVisibility, setOverlayVisibility] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PMTILES_OVERLAYS.map((overlay) => [overlay.id, false]))
  )

  const setMapReady = useMapStore((s) => s.setMapReady)
  const isMapReady = useMapStore((s) => s.isMapReady)
  const selectH3Cell = useMapStore((s) => s.selectH3Cell)
  const selectedH3Cell = useMapStore((s) => s.selectedH3Cell)
  const criteria = useMCDAStore((s) => s.criteria)

  const setSelectedLSOA = useMapStore((s) => s.setSelectedLSOA)
  const currentPlacements = useScenarioStore((s) => s.currentPlacements)
  const isSimulationMode = useScenarioStore((s) => s.isSimulationMode)
  const setSimulationMode = useScenarioStore((s) => s.setSimulationMode)
  const selectedPlacementCell = useScenarioStore((s) => s.selectedPlacementCell)
  const setSelectedPlacementCell = useScenarioStore((s) => s.setSelectedPlacementCell)
  const scenarios = useScenarioStore((s) => s.scenarios)
  const visibleScenarioIds = useScenarioStore((s) => s.visibleScenarioIds)
  const comparedScenarioIds = useScenarioStore((s) => s.comparedScenarioIds)

  const resolvedGlyphCriterionIds = useMemo(
    () => resolveGlyphCriterionIds(criteria, glyphCriterionIds, glyphType),
    [criteria, glyphCriterionIds, glyphType]
  )

  const activeGlyphCriteria = useMemo(
    () => criteria.filter((criterion) => criterion.active).sort((a, b) => b.weight - a.weight),
    [criteria]
  )

  const glyphData = useMemo(
    () =>
      buildGlyphRows(
        mcdaResults,
        criteria,
        resolvedGlyphCriterionIds,
        glyphType,
        glyphAggregation,
        glyphContrastMode,
        glyphContrastStrength
      ),
    [mcdaResults, criteria, resolvedGlyphCriterionIds, glyphType, glyphAggregation, glyphContrastMode, glyphContrastStrength]
  )

  const glyphLegendCriteria = useMemo(() => {
    return glyphData.activeCriteria
  }, [glyphData.activeCriteria])

  useEffect(() => {
    setGlyphCriterionIds((previous) => {
      const next = resolveGlyphCriterionIds(criteria, previous, glyphType)
      return arraysEqual(previous, next) ? previous : next
    })
  }, [criteria, glyphType])

  useEffect(() => {
    const previousWeights = previousCriterionWeightsRef.current
    const changedActiveCriteria = criteria.filter(
      (criterion) =>
        criterion.active &&
        previousWeights[criterion.id] !== undefined &&
        previousWeights[criterion.id] !== criterion.weight
    )

    if (changedActiveCriteria.length > 0) {
      const changedCriterion = changedActiveCriteria[changedActiveCriteria.length - 1]
      setGlyphCriterionIds((previous) => {
        const current = resolveGlyphCriterionIds(criteria, previous, glyphType)
        if (current.includes(changedCriterion.id)) {
          return arraysEqual(previous, current) ? previous : current
        }

        const maxCriteria = getGlyphMaxCriteria(glyphType)
        const next = current.filter((id) => id !== changedCriterion.id)
        if (next.length >= maxCriteria) {
          next[maxCriteria - 1] = changedCriterion.id
        } else {
          next.push(changedCriterion.id)
        }

        return arraysEqual(previous, next) ? previous : next
      })
    }

    previousCriterionWeightsRef.current = Object.fromEntries(
      criteria.map((criterion) => [criterion.id, criterion.weight])
    )
  }, [criteria, glyphType])

  const replaceGlyphCriterion = useCallback(
    (slotIndex: number, nextCriterionId: string) => {
      setGlyphCriterionIds((previous) => {
        const current = resolveGlyphCriterionIds(criteria, previous, glyphType)
        const nextCriterion = criteria.find((criterion) => criterion.id === nextCriterionId && criterion.active)
        if (!nextCriterion || slotIndex < 0 || slotIndex >= current.length) return current

        const next = [...current]
        const existingIndex = next.indexOf(nextCriterionId)
        if (existingIndex >= 0 && existingIndex !== slotIndex) {
          next[existingIndex] = next[slotIndex]
        }
        next[slotIndex] = nextCriterionId

        return arraysEqual(previous, next) ? previous : next
      })
    },
    [criteria, glyphType]
  )

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

  const safeJsonParse = useCallback(<T,>(value: unknown): T | null => {
    if (typeof value !== 'string') return null
    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  }, [])

  const buildChargepointPopupHtml = useCallback(
    (props: Record<string, unknown>) => {
      const address = safeJsonParse<Record<string, unknown>>(props.AddressInfo)
      const connections = safeJsonParse<Array<Record<string, unknown>>>(props.Connections)

      const locationParts = [
        address?.Title,
        address?.AddressLine1,
        address?.Town,
        address?.Postcode,
      ].filter(Boolean)
      const location = locationParts.length > 0 ? locationParts.join(', ') : 'N/A'

      const operator = props.OperatorsReference ?? props.OperatorID ?? props.DataProvidersReference ?? 'Unknown'

      const connectorSummary = Array.isArray(connections)
        ? connections
          .map((connection) => {
            const power = Number(connection.PowerKW)
            const quantity = Number(connection.Quantity)
            const powerLabel = Number.isFinite(power) ? `${power.toFixed(1)} kW` : null
            const qtyLabel = Number.isFinite(quantity) ? `x${quantity}` : null
            return [powerLabel, qtyLabel].filter(Boolean).join(' ')
          })
          .filter((entry) => entry.length > 0)
          .join(', ')
        : ''

      const statusId = Number(props.StatusTypeID)
      const status = Number.isFinite(statusId)
        ? statusId === 50
          ? 'Operational'
          : statusId === 0
            ? 'Unknown'
            : `Status ${statusId}`
        : 'Unknown'

      return `
        <div class="p-2 min-w-[240px]">
          <h3 class="text-sm font-bold border-b pb-1 mb-2">Existing Chargepoint</h3>
          <div class="space-y-1 text-xs text-slate-700">
            <p><strong>Operator:</strong> ${operator}</p>
            <p><strong>Location:</strong> ${location}</p>
            <p><strong>Connectors:</strong> ${connectorSummary || 'N/A'}</p>
            <p><strong>Points:</strong> ${props.NumberOfPoints ?? 'N/A'}</p>
            <p><strong>Status:</strong> ${status}</p>
          </div>
        </div>
      `
    },
    [safeJsonParse]
  )

  const buildTooltipHtml = useCallback(
    (
      h3Cell: string,
      score: number,
      rawValues?: Record<string, number>,
      comparison?: { h3Cell: string; label?: string; score: number; rawValues?: Record<string, number> },
      label?: string
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
            ${buildPanel('Selected', comparison.label ?? comparison.h3Cell, comparison.score, comparison.rawValues)}
            <div style="width:1px;align-self:stretch;background:rgba(148,163,184,0.3);"></div>
            ${buildPanel('Hovered', label ?? h3Cell, score, rawValues)}
          </div>`
      }

      return buildPanel('Area', label ?? h3Cell, score, rawValues)
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

  const clearScreenGridGlyphLayer = useCallback(() => {
    const map = mapRef.current
    const layer = screengridLayerRef.current
    if (map && layer && map.getLayer(layer.id)) {
      map.removeLayer(layer.id)
    }
    screengridLayerRef.current = null
  }, [])

  const applyLayerVisibility = useCallback((map: maplibregl.Map) => {
    const polygonVisibility = showPolygonLayer ? 'visible' : 'none'
    if (map.getLayer('h3-fill')) {
      map.setLayoutProperty('h3-fill', 'visibility', polygonVisibility)
      map.setPaintProperty('h3-fill', 'fill-opacity', polygonOpacity)
    }
    if (map.getLayer('h3-outline')) {
      map.setLayoutProperty('h3-outline', 'visibility', polygonVisibility)
    }

    for (const overlay of PMTILES_OVERLAYS) {
      if (map.getLayer(overlay.id)) {
        map.setLayoutProperty(
          overlay.id,
          'visibility',
          overlayVisibility[overlay.id] ? 'visible' : 'none'
        )
      }
    }
  }, [overlayVisibility, polygonOpacity, showPolygonLayer])

  const initMap = useCallback(() => {
    if (!mapContainer.current || mapRef.current) return

    if (!pmtilesProtocolRef.current) {
      const protocol = new Protocol()
      maplibregl.addProtocol('pmtiles', protocol.tile)
      pmtilesProtocolRef.current = protocol
    }

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: BASEMAP_STYLE,
      center: LONDON_CENTER,
      zoom: 10,
      minZoom: 6,
      maxZoom: 16,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-left')
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 150 }),
      'bottom-left'
    )

    map.on('load', () => {
      // Add H3 layers immediately
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
        id: 'h3-placement-selection-fill',
        type: 'fill',
        source: 'h3-grid',
        filter: ['==', ['get', 'h3_cell'], ''],
        paint: {
          'fill-color': '#f97316',
          'fill-opacity': 0.2,
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

      map.addLayer({
        id: 'h3-placement-selection-outline',
        type: 'line',
        source: 'h3-grid',
        filter: ['==', ['get', 'h3_cell'], ''],
        paint: {
          'line-color': '#ea580c',
          'line-width': 2,
          'line-opacity': 0.95,
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
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9,
            7,
            12,
            9,
            15,
            11,
          ],
          'circle-color': '#ef4444',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      map.addLayer({
        id: 'evcp-marker-count',
        type: 'symbol',
        source: 'evcp-markers',
        layout: {
          'text-field': [
            'case',
            ['>', ['to-number', ['get', 'charger_count']], 1],
            ['to-string', ['get', 'charger_count']],
            '',
          ],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9,
            9,
            12,
            10,
            15,
            11,
          ],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-anchor': 'center',
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#991b1b',
          'text-halo-width': 1,
        },
      })

      map.addSource('scenario-markers', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      map.addLayer(
        {
          id: 'scenario-markers-muted',
          type: 'circle',
          source: 'scenario-markers',
          filter: ['==', ['get', 'mode'], 'muted'],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 12, 5, 15, 6],
            'circle-color': MUTED_COLOR,
            'circle-opacity': 0.2,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 0.3,
          },
        },
        'evcp-markers'
      )

      map.addLayer(
        {
          id: 'scenario-markers-highlighted',
          type: 'circle',
          source: 'scenario-markers',
          filter: ['==', ['get', 'mode'], 'highlighted'],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 5, 12, 7, 15, 9],
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.55,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 0.7,
          },
        },
        'evcp-markers'
      )

      // Use a canvas marker instead of an external image to avoid decoding errors
      const markerSize = 32
      const canvas = document.createElement('canvas')
      canvas.width = markerSize
      canvas.height = markerSize
      const ctx = canvas.getContext('2d')
      if (ctx) {
        // Draw a simple marker with softer colors
        ctx.beginPath()
        ctx.arc(markerSize / 2, markerSize / 2, markerSize / 2 - 2, 0, Math.PI * 2)
        ctx.fillStyle = '#9fa1ffe8' // Softer indigo
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Draw a placeholder lightning bolt or simple shape
        ctx.fillStyle = '#ffffff'
        ctx.font = '14px sans-serif' // Smaller font for less intimidation
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('⚡', markerSize / 2, markerSize / 2)

        const imageData = ctx.getImageData(0, 0, markerSize, markerSize)
        map.addImage(CHARGEPOINT_ICON_ID, imageData)
      }

      // Add PMTiles layers
      for (const overlay of PMTILES_OVERLAYS) {
        const sourceId = `pmtiles-${overlay.id}`
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'vector',
            url: `pmtiles://${overlay.url}`,
          })
        }

        if (!map.getLayer(overlay.id)) {
          const visibility = overlayVisibility?.[overlay.id] ? 'visible' : 'none'
          map.addLayer(buildOverlayLayer(overlay, sourceId, visibility))
        }
      }

      setMapReady(true)
    })

    map.on('click', 'h3-fill', (e) => {
      if (!e.features || e.features.length === 0) return
      const cell = e.features[0].properties?.h3_cell as string

      const mcdaRow = mcdaResultsRef.current.find((r) => r.h3_cell === cell)

      if (mcdaRow?.lsoa21cd) {
        setSelectedLSOA(mcdaRow.lsoa21cd, mcdaRow.lsoa21nm ?? null, mcdaRow.borough_name ?? null)
      }

      if (!isSimulationModeRef.current) return

      if (mcdaRow) {
        setPlacementCellData({
          raw: mcdaRow.raw_values ?? {},
          normalized: mcdaRow.criterion_values ?? {},
          metadata: {
            lsoa21cd: mcdaRow.lsoa21cd,
            lsoa21nm: mcdaRow.lsoa21nm,
            borough_name: mcdaRow.borough_name,
          },
        })
      } else {
        setPlacementCellData(null)
      }

      selectH3Cell(cell)
      setSelectedClickLocation({ lat: e.lngLat.lat, lng: e.lngLat.lng })
      setSelectedPlacementCell(cell)
      setShowChargerConfig(true)
    })

    map.on('mouseenter', 'h3-fill', () => {
      map.getCanvas().style.cursor = isSimulationModeRef.current ? EVCP_CURSOR : 'pointer'
    })
    map.on('mouseleave', 'h3-fill', () => {
      map.getCanvas().style.cursor = isSimulationModeRef.current ? EVCP_CURSOR : ''
    })

    map.on('zoomend', () => {
      const zoom = map.getZoom()
      const nextZoom = Math.round(zoom)
      const nextDisplayResolution = zoomToH3Resolution(zoom)
      const {
        displayResolution,
        setDisplayResolution,
        setZoom,
      } = useMapStore.getState()

      setZoom(nextZoom)
      if (displayResolution !== nextDisplayResolution) {
        setDisplayResolution(nextDisplayResolution)
      }
    })

    mapRef.current = map
  }, [setMapReady, selectH3Cell, setSelectedPlacementCell])

  useEffect(() => {
    isSimulationModeRef.current = isSimulationMode
    const map = mapRef.current
    if (!map) return
    map.getCanvas().style.cursor = isSimulationMode ? EVCP_CURSOR : ''
  }, [isSimulationMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isMapReady) return

    const filter: maplibregl.FilterSpecification = selectedPlacementCell
      ? ['==', ['get', 'h3_cell'], selectedPlacementCell]
      : ['==', ['get', 'h3_cell'], '']

    if (map.getLayer('h3-placement-selection-fill')) {
      map.setFilter('h3-placement-selection-fill', filter)
    }
    if (map.getLayer('h3-placement-selection-outline')) {
      map.setFilter('h3-placement-selection-outline', filter)
    }
  }, [selectedPlacementCell])

  useEffect(() => {
    if (selectedPlacementCell) return
    setShowChargerConfig(false)
    setSelectedClickLocation(null)
    selectH3Cell(null)
  }, [selectedPlacementCell, selectH3Cell])

  useEffect(() => {
    if (!showTooltips) {
      glyphTooltipActiveRef.current = false
      tooltipRef.current?.remove()
    }
  }, [showTooltips])

  useEffect(() => {
    latestPlacementsRef.current = currentPlacements
  }, [currentPlacements])

  useEffect(() => {
    mcdaResultsRef.current = mcdaResults
  }, [mcdaResults])

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
        return Math.max(GLYPH_SIZE_MIN, Math.min(GLYPH_SIZE_MAX, Number(next.toFixed(2))))
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
    setComparisonGlyph(null)
    glyphTooltipActiveRef.current = false
    tooltipRef.current?.remove()
  }, [glyphRenderer])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const frame = window.requestAnimationFrame(() => map.resize())
    return () => window.cancelAnimationFrame(frame)
  }, [isMapFullscreen])

  useEffect(() => {
    if (!isMapFullscreen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMapFullscreen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isMapFullscreen])

  useEffect(() => {
    initMap()
    return () => {
      tooltipRef.current?.remove()
      tooltipRef.current = null
      clearGlyphMarkers()
      clearScreenGridGlyphLayer()
      mapRef.current?.remove()
      mapRef.current = null
      if (pmtilesProtocolRef.current) {
        maplibregl.removeProtocol('pmtiles')
        pmtilesProtocolRef.current = null
      }
    }
  }, [initMap, clearGlyphMarkers, clearScreenGridGlyphLayer])

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
      const chargepointHits = map.queryRenderedFeatures(e.point, { layers: ['london-chargepoints'] })
      if (chargepointHits.length > 0) {
        const feature = chargepointHits[0]
        const props = feature.properties || {}
        const popupHtml = buildChargepointPopupHtml(props)
        new maplibregl.Popup({ closeButton: true, className: 'chargepoint-popup' })
          .setLngLat(e.lngLat)
          .setHTML(popupHtml)
          .addTo(map)
        return
      }

      if (isSimulationMode && selectedPlacementCell) {
        const hoveredPolygons = map.queryRenderedFeatures(e.point, { layers: ['h3-fill'] })
        if (hoveredPolygons.length === 0) {
          setSelectedPlacementCell(null)
          setShowChargerConfig(false)
        }
      }

      if (!comparisonGlyph) return
      const hoveredPolygons = map.queryRenderedFeatures(e.point, { layers: ['h3-fill'] })
      if (hoveredPolygons.length === 0) {
        setComparisonGlyph(null)
        glyphTooltipActiveRef.current = false
        tooltipRef.current?.remove()
      }
    }

    map.on('click', onMapClick)

    map.on('mouseenter', 'london-chargepoints', () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', 'london-chargepoints', () => {
      map.getCanvas().style.cursor = isSimulationMode ? EVCP_CURSOR : ''
    })

    return () => {
      map.off('click', onMapClick)
    }
  }, [buildChargepointPopupHtml, comparisonGlyph, isMapReady, isSimulationMode, selectedPlacementCell, setSelectedPlacementCell])

  // Update H3 grid when MCDA results change or map becomes ready.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isMapReady || !map.isStyleLoaded()) return

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
  }, [mcdaResults, isMapReady])

  // Sync polygon visibility, overlays, and opacity.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    applyLayerVisibility(map)
  }, [applyLayerVisibility])

  // Draw a glyph layer with criterion-level bars or rose petals as H3 canvas markers.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    clearGlyphMarkers()
    if (!showGlyphLayer || glyphRenderer !== 'h3-markers' || glyphData.rows.length === 0) return

    const selectedGlyph = comparisonGlyph
      ? glyphData.rows.find((row) => row.h3Cell === comparisonGlyph.h3Cell) ?? null
      : null

    if (comparisonGlyph && !selectedGlyph) {
      setComparisonGlyph(null)
    }

    for (const row of glyphData.rows) {
      const baseHeight = glyphType === 'rose' ? 42 : 34
      const markerHeight = Math.round(baseHeight * glyphSizeScale)
      const markerWidth = glyphType === 'rose' ? markerHeight : Math.round(markerHeight * 1.25)
      const dpr = Math.max(1, window.devicePixelRatio || 1)
      const isSelectedGlyph = selectedGlyph?.h3Cell === row.h3Cell

      const canvas = document.createElement('canvas')
      canvas.width = Math.round(markerWidth * dpr)
      canvas.height = Math.round(markerHeight * dpr)
      canvas.style.width = `${markerWidth}px`
      canvas.style.height = `${markerHeight}px`
      canvas.style.display = 'block'

      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      ctx.scale(dpr, dpr)

      drawCriterionGlyph(ctx, {
        centerX: markerWidth / 2,
        centerY: markerHeight / 2,
        width: markerWidth,
        height: markerHeight,
        glyphType,
        criteria: glyphData.activeCriteria,
        values: row.displayValues,
        isSelected: isSelectedGlyph,
      })

      const markerElement = document.createElement('div')
      markerElement.style.pointerEvents = 'auto'
      markerElement.style.cursor = 'pointer'
      markerElement.style.filter = isSelectedGlyph
        ? 'drop-shadow(0 2px 5px rgba(15,23,42,0.42)) drop-shadow(0 0 3px rgba(255,255,255,0.95))'
        : 'drop-shadow(0 1px 2px rgba(15,23,42,0.22))'
      markerElement.appendChild(canvas)

      const popup = getTooltipPopup()
      markerElement.addEventListener('click', (event) => {
        event.stopPropagation()

        const nextGlyph: GlyphDatum = {
          h3Cell: row.h3Cell,
          label: row.label,
          score: row.score,
          criterionValues: row.criterionValues,
          rawValues: row.rawValues,
          lat: row.lat,
          lng: row.lng,
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
          .setLngLat([row.lng, row.lat])
          .setHTML(buildTooltipHtml(row.h3Cell, row.score, row.rawValues, undefined, row.label))
          .addTo(map)
      })

      markerElement.addEventListener('mouseenter', () => {
        if (!showTooltips) return
        glyphTooltipActiveRef.current = true
        popup
          .setLngLat([row.lng, row.lat])
          .setHTML(
            buildTooltipHtml(
              row.h3Cell,
              row.score,
              row.rawValues,
              comparisonGlyph
                ? {
                  h3Cell: comparisonGlyph.h3Cell,
                  label: comparisonGlyph.label,
                  score: comparisonGlyph.score,
                  rawValues: comparisonGlyph.rawValues,
                }
                : undefined,
              row.label
            )
          )
          .addTo(map)
      })

      markerElement.addEventListener('mouseleave', () => {
        glyphTooltipActiveRef.current = false
        popup.remove()
      })

      const marker = new maplibregl.Marker({ element: markerElement, anchor: 'center' })
        .setLngLat([row.lng, row.lat])
        .addTo(map)
      glyphMarkersRef.current.push(marker)
    }
  }, [glyphData, showGlyphLayer, showTooltips, glyphRenderer, glyphType, glyphSizeScale, comparisonGlyph, clearGlyphMarkers, buildTooltipHtml, getTooltipPopup])

  // Draw an alternative screen-space glyph layer with screengrid.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isMapReady) return

    clearScreenGridGlyphLayer()
    if (!showGlyphLayer || glyphRenderer !== 'screengrid' || glyphData.rows.length === 0) return

    const popup = getTooltipPopup()
    const cellSize = Math.max(24, Math.round((glyphType === 'rose' ? 52 : 46) * glyphSizeScale))

    const layer = new ScreenGridLayerGL({
      id: SCREEN_GRID_GLYPH_LAYER_ID,
      data: glyphData.rows,
      getPosition: (row: GlyphRenderRow) => [row.lng, row.lat],
      getWeight: (row: GlyphRenderRow) => Math.max(0.001, row.score),
      cellSizePixels: cellSize,
      glyphSize: 0.82,
      showBackground: false,
      enableGlyphs: true,
      aggregationFunction: 'mean',
      normalizationFunction: 'max-local',
      colorScale: () => [0, 0, 0, 0],
      onDrawCell: (
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        _normVal: number,
        cellInfo: ScreenGridCellInfo
      ) => {
        const row = summarizeScreenGridCell(cellInfo, glyphData.activeCriteria)
        if (!row) return

        const glyphHeight = Math.max(18, (cellInfo.glyphRadius ?? cellSize * 0.36) * 2)
        const glyphWidth = glyphType === 'rose' ? glyphHeight : glyphHeight * 1.25
        drawCriterionGlyph(ctx, {
          centerX: x,
          centerY: y,
          width: glyphWidth,
          height: glyphHeight,
          glyphType,
          criteria: glyphData.activeCriteria,
          values: row.displayValues,
          isSelected: comparisonGlyph?.h3Cell === row.h3Cell,
        })
      },
      onHover: ({ cell }: { cell: ScreenGridCellInfo }) => {
        const row = summarizeScreenGridCell(cell, glyphData.activeCriteria)
        if (!row || !showTooltips) return

        glyphTooltipActiveRef.current = true
        popup
          .setLngLat([row.lng, row.lat])
          .setHTML(
            buildTooltipHtml(
              row.h3Cell,
              row.score,
              row.rawValues,
              comparisonGlyph
                ? {
                  h3Cell: comparisonGlyph.h3Cell,
                  label: comparisonGlyph.label,
                  score: comparisonGlyph.score,
                  rawValues: comparisonGlyph.rawValues,
                }
                : undefined,
              row.label
            )
          )
          .addTo(map)
      },
      onClick: ({ cell }: { cell: ScreenGridCellInfo }) => {
        const row = summarizeScreenGridCell(cell, glyphData.activeCriteria)
        if (!row) return

        if (comparisonGlyph?.h3Cell === row.h3Cell) {
          setComparisonGlyph(null)
          glyphTooltipActiveRef.current = false
          popup.remove()
          return
        }

        setComparisonGlyph(row)
        if (!showTooltips) return

        glyphTooltipActiveRef.current = true
        popup
          .setLngLat([row.lng, row.lat])
          .setHTML(buildTooltipHtml(row.h3Cell, row.score, row.rawValues, undefined, row.label))
          .addTo(map)
      },
    })

    map.addLayer(layer as unknown as maplibregl.CustomLayerInterface)
    screengridLayerRef.current = layer

    const onMouseMove = (event: maplibregl.MapMouseEvent) => {
      if (!showTooltips) return
      const activeLayer = screengridLayerRef.current
      if (!activeLayer?.getCellAt({ x: event.point.x, y: event.point.y })) {
        glyphTooltipActiveRef.current = false
        popup.remove()
      }
    }

    map.on('mousemove', onMouseMove)
    return () => {
      map.off('mousemove', onMouseMove)
      clearScreenGridGlyphLayer()
    }
  }, [
    glyphData,
    showGlyphLayer,
    showTooltips,
    glyphRenderer,
    glyphType,
    glyphSizeScale,
    comparisonGlyph,
    isMapReady,
    clearScreenGridGlyphLayer,
    buildTooltipHtml,
    getTooltipPopup,
  ])

  const syncEvcpMarkers = useCallback((placements: typeof currentPlacements) => {
    const map = mapRef.current
    if (!map) return

    const source = map.getSource('evcp-markers') as maplibregl.GeoJSONSource | undefined
    if (!source) return

    const features = placements.flatMap((p) => {
      try {
        const [lat, lng] = getH3Center(p.h3Cell)
        return [
          {
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [lng, lat] },
            properties: {
              h3_cell: p.h3Cell,
              charger_type: p.chargerType,
              charger_count: p.chargerCount,
            },
          },
        ]
      } catch {
        return []
      }
    })

    source.setData({ type: 'FeatureCollection', features })
  }, [])

  // Update EVCP markers when placements change and when map becomes ready.
  useEffect(() => {
    if (!isMapReady) return
    syncEvcpMarkers(currentPlacements)
  }, [currentPlacements, isMapReady, syncEvcpMarkers])

  const syncScenarioMarkers = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    const source = map.getSource('scenario-markers') as maplibregl.GeoJSONSource | undefined
    if (!source) return

    const renderList = buildScenarioRenderList(
      scenarios.map((s) => s.id),
      comparedScenarioIds,
      visibleScenarioIds
    )

    const features = renderList.flatMap((info) => {
      const scenario = scenarios.find((s) => s.id === info.id)
      if (!scenario) return []
      return scenario.placements.flatMap((p) => {
        try {
          const [lat, lng] = getH3Center(p.h3Cell)
          return [
            {
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates: [lng, lat] },
              properties: {
                scenario_id: info.id,
                scenario_name: scenario.name,
                mode: info.mode,
                color: info.color,
                h3_cell: p.h3Cell,
                charger_type: p.chargerType,
                charger_count: p.chargerCount,
              },
            },
          ]
        } catch {
          return []
        }
      })
    })

    source.setData({ type: 'FeatureCollection', features })
  }, [scenarios, comparedScenarioIds, visibleScenarioIds])

  useEffect(() => {
    if (!isMapReady) return
    syncScenarioMarkers()
  }, [isMapReady, syncScenarioMarkers])

  // Re-apply marker data if the style reloads to avoid losing source data visibility.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const handleStyleData = () => {
      applyLayerVisibility(map)
      syncEvcpMarkers(latestPlacementsRef.current)
    }

    map.on('styledata', handleStyleData)
    return () => {
      map.off('styledata', handleStyleData)
    }
  }, [applyLayerVisibility, syncEvcpMarkers])

  return (
    <div
      className={
        isMapFullscreen
          ? 'fixed inset-0 z-50 bg-white'
          : 'relative flex-1'
      }
    >
      <div ref={mapContainer} className="w-full h-full" />

      <div className="absolute top-2 left-14 z-10">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 shadow-lg">
          <button
            type="button"
            onClick={() => setIsMapFullscreen((prev) => !prev)}
            className="inline-flex h-9 w-9 items-center justify-center border-r border-slate-300 bg-white/95 text-slate-700 transition-colors hover:bg-slate-50"
            aria-label={isMapFullscreen ? 'Exit full-screen map' : 'Show map full screen'}
            title={isMapFullscreen ? 'Exit full-screen map' : 'Show map full screen'}
          >
            {isMapFullscreen ? (
              <Minimize2 className="h-4 w-4" strokeWidth={2.4} />
            ) : (
              <Maximize2 className="h-4 w-4" strokeWidth={2.4} />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !isSimulationMode
              setSimulationMode(next)
              if (!next) {
                setShowChargerConfig(false)
                setSelectedClickLocation(null)
                setSelectedPlacementCell(null)
                selectH3Cell(null)
              }
            }}
            className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-bold transition-colors ${isSimulationMode
              ? 'bg-amber-500 text-white'
              : 'bg-white/95 text-slate-700 hover:bg-slate-50'
              }`}
            title="Toggle EVCP placement mode"
          >
            <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
            {isSimulationMode ? 'Simulation: ON' : 'Simulate EVCP Placement'}
          </button>
          <label className="inline-flex items-center gap-2 border-l border-slate-300 bg-white/95 px-3 py-2 text-[11px] font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={showTooltips}
              onChange={(e) => setShowTooltips(e.target.checked)}
              className="rounded border-slate-300"
            />
            Tooltips
          </label>
        </div>
      </div>

      {/* Layer Controls */}
      <div className="absolute top-4 right-4 z-10">
        {showLayerPanel ? (
          <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 border border-slate-200 min-w-[220px]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Layers</div>
              <button
                type="button"
                onClick={() => setShowLayerPanel(false)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Hide layers panel"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showPolygonLayer}
                onChange={(e) => setShowPolygonLayer(e.target.checked)}
                className="rounded border-slate-300"
              />
              MCDA Final Score
            </label>

            <div className="mb-2">
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                <span>Polygon opacity</span>
                <span className="font-mono text-slate-600">{Math.round(polygonOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(polygonOpacity * 100)}
                onChange={(e) => setPolygonOpacity(Number(e.target.value) / 100)}
                disabled={!showPolygonLayer}
                className="w-full accent-slate-700"
                aria-label="MCDA polygon opacity"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showGlyphLayer}
                onChange={(e) => setShowGlyphLayer(e.target.checked)}
                className="rounded border-slate-300"
              />
              Glyph layer
            </label>

            <div className="mt-2">
              <div className="text-[10px] text-slate-500 mb-1">Overlays</div>
              <div className="flex flex-col gap-2">
                {PMTILES_OVERLAYS.filter((o) => o.id !== 'lsoa-fills').map((overlay) => (
                  <label key={overlay.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overlayVisibility[overlay.id] ?? false}
                      onChange={(e) =>
                        setOverlayVisibility((prev) => ({
                          ...prev,
                          [overlay.id]: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300"
                    />
                    {overlay.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-2">
              <div className="text-[10px] text-slate-500 mb-1">Glyph renderer</div>
              <select
                value={glyphRenderer}
                onChange={(e) => setGlyphRenderer(e.target.value as GlyphRenderer)}
                className="w-full text-xs rounded-md border border-slate-300 bg-white px-2 py-1"
                disabled={!showGlyphLayer}
              >
                <option value="h3-markers">H3 markers</option>
                <option value="screengrid">ScreenGrid</option>
              </select>
            </div>

            <div className="mt-2">
              <div className="text-[10px] text-slate-500 mb-1">Glyph type</div>
              <select
                value={glyphType}
                onChange={(e) => setGlyphType(e.target.value as 'rose' | 'bars')}
                className="w-full text-xs rounded-md border border-slate-300 bg-white px-2 py-1"
                disabled={!showGlyphLayer}
              >
                <option value="bars">Bar chart</option>
                <option value="rose">Rose chart</option>
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
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                <span>Glyph size</span>
                <span className="font-mono text-slate-600">{Math.round(glyphSizeScale * 100)}%</span>
              </div>
              <input
                type="range"
                min={GLYPH_SIZE_MIN}
                max={GLYPH_SIZE_MAX}
                step={0.05}
                value={glyphSizeScale}
                onChange={(e) => setGlyphSizeScale(Number(e.target.value))}
                disabled={!showGlyphLayer}
                className="w-full accent-slate-700"
                aria-label="Glyph size"
              />
              <div className="text-[10px] text-slate-500 mt-0.5">
                Hold Shift + scroll to resize on the map
              </div>
            </div>

            <div className="mt-2">
              <div className="text-[10px] text-slate-500 mb-1">Glyph contrast</div>
              <select
                value={glyphContrastMode}
                onChange={(e) => setGlyphContrastMode(e.target.value as GlyphContrastMode)}
                className="w-full text-xs rounded-md border border-slate-300 bg-white px-2 py-1"
                disabled={!showGlyphLayer}
              >
                <option value="true">True scale</option>
                <option value="rank">Rank contrast</option>
              </select>
            </div>

            <div className="mt-2">
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                <span>Contrast strength</span>
                <span className="font-mono text-slate-600">{Math.round(glyphContrastStrength * 100)}%</span>
              </div>
              <input
                type="range"
                min={GLYPH_CONTRAST_MIN}
                max={GLYPH_CONTRAST_MAX}
                step={0.05}
                value={glyphContrastStrength}
                onChange={(e) => setGlyphContrastStrength(Number(e.target.value))}
                disabled={!showGlyphLayer || glyphContrastMode === 'true'}
                className="w-full accent-slate-700"
                aria-label="Glyph contrast strength"
              />
            </div>

            <div className="mt-2 text-[10px] text-slate-500">
              Pattern fill = cost criterion
              {glyphContrastMode === 'rank' && glyphContrastStrength > 0
                ? `; glyphs are ${Math.round(glyphContrastStrength * 100)}% rank-scaled`
                : ''}
            </div>
            {/* {showGlyphLayer && (
              <div className="mt-1 text-[10px] text-slate-500">
                Click a glyph to compare. Click again or empty map to clear.
              </div>
            )} */}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowLayerPanel(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-600 shadow-lg hover:bg-slate-50"
            aria-label="Show layers panel"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Glyph Legend */}
      {showGlyphLayer && glyphLegendCriteria.length > 0 && (
        showGlyphLegend ? (
          <div className="absolute bottom-8 left-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-3 border border-slate-200 max-w-[270px] z-10">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                Glyph Legend
              </div>
              <button
                type="button"
                onClick={() => setShowGlyphLegend(false)}
                className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-md border border-slate-200 bg-white/90 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                aria-label="Hide glyph legend"
                title="Hide glyph legend"
              >
                <Minimize2 className="h-3.5 w-3.5" strokeWidth={2.4} />
              </button>
            </div>
            <div className="text-[10px] text-slate-600 mb-2">
              {glyphType === 'rose'
                ? 'Petal length shows criterion score; petal width follows criterion weight.'
                : 'Bar height shows criterion score.'}
              {glyphContrastMode === 'rank' && glyphContrastStrength > 0
                ? ` Display is blended ${Math.round(glyphContrastStrength * 100)}% toward per-criterion rank.`
                : ''}
            </div>
            <div className="flex flex-col gap-1.5">
              {glyphLegendCriteria.map((criterion, index) => {
                const criterionOptions = activeGlyphCriteria.filter(
                  (option) => option.id === criterion.id || !resolvedGlyphCriterionIds.includes(option.id)
                )

                return (
                <div key={`${index}-${criterion.id}`} className="flex items-center justify-between gap-2 text-[10px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-[2px] border border-slate-300"
                      style={{ backgroundColor: criterion.color }}
                    />
                    <select
                      value={criterion.id}
                      onChange={(e) => replaceGlyphCriterion(index, e.target.value)}
                      className="min-w-0 max-w-[132px] truncate rounded border border-transparent bg-transparent px-1 py-0.5 text-[10px] text-slate-700 outline-none hover:border-slate-200 hover:bg-white focus:border-slate-300 focus:bg-white"
                      aria-label={`Glyph criterion ${index + 1}`}
                      title="Swap glyph criterion"
                    >
                      {criterionOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
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
                )
              })}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowGlyphLegend(true)}
            className="absolute bottom-8 left-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-600 shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-50 hover:text-slate-800"
            aria-label="Show glyph legend"
            title="Show glyph legend"
          >
            <Maximize2 className="h-3.5 w-3.5" strokeWidth={2.4} />
          </button>
        )
      )}

      {/* Color Legend */}
      <div className="absolute bottom-10 right-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-3 border border-slate-200">
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
            location={selectedClickLocation ?? (() => {
              const [lat, lng] = getH3Center(selectedH3Cell)
              return { lat, lng }
            })()}
            cellData={placementCellData ?? undefined}
            onClose={() => {
              setShowChargerConfig(false)
              setSelectedClickLocation(null)
              setPlacementCellData(null)
              setSelectedPlacementCell(null)
              selectH3Cell(null)
            }}
          />
        </div>
      )}
    </div>
  )
}
