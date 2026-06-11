import React, { useMemo, useState } from 'react'
import type { Criterion, ImpactEstimate, Scenario } from '@/analysis/types'
import { formatCO2, formatCompact, formatCurrency, formatEnergy, formatPercent } from '@/utils/format'
import { useScenarioStore } from '@/store/scenario-store'
import { useMCDAStore } from '@/store/mcda-store'
import {
  buildScenarioRenderList,
  getDraftStyle,
  type ScenarioRenderInfo,
} from '@/scenarios/scenario-styles'

type RadarMode = 'weights' | 'impacts'

type ImpactMetricDef = {
  key: string
  label: string
  getValue: (impact: ImpactEstimate) => number
}

type RadarAxis = {
  key: string
  label: string
}

const IMPACT_METRICS: ImpactMetricDef[] = [
  { key: 'energy', label: 'Energy', getValue: (impact) => impact.energyDeliveredKWh },
  { key: 'carbon', label: 'Carbon', getValue: (impact) => impact.carbonSavedTonnes },
  { key: 'revenue', label: 'Revenue', getValue: (impact) => impact.annualRevenue },
  { key: 'population', label: 'Population', getValue: (impact) => impact.populationServed },
  { key: 'utilization', label: 'Utilization', getValue: (impact) => impact.utilizationFactor * 100 },
  {
    key: 'headroom_spare',
    label: 'Headroom',
    getValue: (impact) => Math.max(0, 100 - impact.headroomImpactPct),
  },
]

const CRITERION_LABELS: Record<string, string> = {
  pop_density: 'Pop',
  car_ownership: 'Cars',
  deprivation: 'Depriv',
  disabled_population: 'Disabled',
  employment_access: 'Jobs',
  supermarket_access: 'Shops',
  transport_emission: 'CO2',
  grid_capacity: 'Grid',
  traffic_index: 'Traffic',
  evcp_distance: 'EVCP',
}

function formatMetricValue(metricKey: string, impact: ImpactEstimate): string {
  switch (metricKey) {
    case 'energy':
      return `${formatEnergy(impact.energyDeliveredKWh)} /year`
    case 'carbon':
      return `${formatCO2(impact.carbonSavedTonnes)} /year`
    case 'revenue':
      return `${formatCurrency(impact.annualRevenue)} /year`
    case 'population':
      return `${formatCompact(impact.populationServed, 0)} people`
    case 'utilization':
      return formatPercent(impact.utilizationFactor * 100)
    case 'headroom_spare':
      return formatPercent(Math.max(0, 100 - impact.headroomImpactPct))
    default:
      return '-'
  }
}

function normaliseWeights(weights: Record<string, number>, criteria: Criterion[]): Record<string, number> {
  const total = criteria.reduce((sum, criterion) => sum + Math.max(0, weights[criterion.id] ?? 0), 0)
  if (total <= 0) {
    return Object.fromEntries(criteria.map((criterion) => [criterion.id, 0]))
  }
  return Object.fromEntries(
    criteria.map((criterion) => [criterion.id, Math.max(0, weights[criterion.id] ?? 0) / total])
  )
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

type RadarEntry = {
  id: string
  label: string
  mode: 'hidden' | 'muted' | 'highlighted' | 'draft'
  stroke: string
  fill: string
  strokeWidth: number
  opacity: number
  dotRadius: number
  isDraft: boolean
  values: number[]
  tooltipLines: string[]
}

interface KPIRadarChartProps {
  currentImpact: ImpactEstimate | null
  scenarios: Scenario[]
  activeScenarioId: string | null
}

export function KPIRadarChart({ currentImpact, scenarios, activeScenarioId }: KPIRadarChartProps) {
  const [radarMode, setRadarMode] = useState<RadarMode>('weights')
  const [radarZoom, setRadarZoom] = useState(2)
  const criteria = useMCDAStore((s) => s.criteria)
  const visibleScenarioIds = useScenarioStore((s) => s.visibleScenarioIds)
  const comparedScenarioIds = useScenarioStore((s) => s.comparedScenarioIds)

  const activeCriteria = useMemo(
    () => criteria.filter((criterion) => criterion.active),
    [criteria]
  )

  const scenarioRenderList = useMemo<ScenarioRenderInfo[]>(
    () =>
      buildScenarioRenderList(
        scenarios.map((s) => s.id),
        comparedScenarioIds,
        visibleScenarioIds
      ),
    [scenarios, comparedScenarioIds, visibleScenarioIds]
  )

  const weightAxes = useMemo<RadarAxis[]>(
    () =>
      activeCriteria.map((criterion) => ({
        key: criterion.id,
        label: CRITERION_LABELS[criterion.id] ?? criterion.name,
      })),
    [activeCriteria]
  )

  const impactAxes = useMemo<RadarAxis[]>(
    () => IMPACT_METRICS.map((metric) => ({ key: metric.key, label: metric.label })),
    []
  )

  const axes = radarMode === 'weights' ? weightAxes : impactAxes

  const entries = useMemo<RadarEntry[]>(() => {
    const result: RadarEntry[] = []

    scenarioRenderList.forEach((info) => {
      const scenario = scenarios.find((s) => s.id === info.id)
      if (!scenario) return

      if (radarMode === 'impacts' && !scenario.impactSummary) return

      const weightShares = radarMode === 'weights'
        ? normaliseWeights(scenario.weights, activeCriteria)
        : null
      const rawValues = radarMode === 'weights'
        ? activeCriteria.map((criterion) => weightShares?.[criterion.id] ?? 0)
        : IMPACT_METRICS.map((metric) => metric.getValue(scenario.impactSummary!))

      result.push({
        id: scenario.id,
        label: scenario.id === activeScenarioId ? `${scenario.name} (loaded)` : scenario.name,
        mode: info.mode,
        stroke: info.style.stroke,
        fill: info.mode === 'muted'
          ? 'rgba(148, 163, 184, 0.035)'
          : hexToRgba(info.color, 0.10),
        strokeWidth: info.mode === 'muted' ? 1 : 3.25,
        opacity: info.mode === 'muted' ? Math.min(info.style.opacity, 0.18) : 0.92,
        dotRadius: info.mode === 'muted' ? 0 : 3.5,
        isDraft: false,
        values: rawValues,
        tooltipLines: radarMode === 'weights'
          ? activeCriteria.map((criterion) =>
            `${criterion.name}: ${formatPercent((weightShares?.[criterion.id] ?? 0) * 100)}`
          )
          : IMPACT_METRICS.map((metric) =>
            `${metric.label}: ${formatMetricValue(metric.key, scenario.impactSummary!)}`
          ),
      })
    })

    if (radarMode === 'weights') {
      const draft = getDraftStyle()
      const draftWeights = Object.fromEntries(criteria.map((criterion) => [criterion.id, criterion.weight]))
      const weightShares = normaliseWeights(draftWeights, activeCriteria)
      result.push({
        id: 'current',
        label: 'Current draft',
        mode: 'draft',
        stroke: draft.stroke,
        fill: 'rgba(15, 23, 42, 0.08)',
        strokeWidth: 3.75,
        opacity: 0.95,
        dotRadius: 4,
        isDraft: true,
        values: activeCriteria.map((criterion) => weightShares[criterion.id] ?? 0),
        tooltipLines: activeCriteria.map((criterion) =>
          `${criterion.name}: ${formatPercent((weightShares[criterion.id] ?? 0) * 100)}`
        ),
      })
    } else if (currentImpact) {
      const draft = getDraftStyle()
      result.push({
        id: 'current',
        label: 'Current draft',
        mode: 'draft',
        stroke: draft.stroke,
        fill: 'rgba(15, 23, 42, 0.08)',
        strokeWidth: 3.75,
        opacity: 0.95,
        dotRadius: 4,
        isDraft: true,
        values: IMPACT_METRICS.map((metric) => metric.getValue(currentImpact)),
        tooltipLines: IMPACT_METRICS.map((metric) =>
          `${metric.label}: ${formatMetricValue(metric.key, currentImpact)}`
        ),
      })
    }

    return result
  }, [activeCriteria, activeScenarioId, criteria, currentImpact, radarMode, scenarios, scenarioRenderList])

  const normalizedEntries = useMemo(() => {
    if (entries.length === 0) return [] as Array<RadarEntry & { values: number[] }>

    const maxPerAxis = radarMode === 'weights'
      ? axes.map((_, axisIndex) => Math.max(0.5, ...entries.map((entry) => entry.values[axisIndex] ?? 0)))
      : axes.map((_, axisIndex) => Math.max(...entries.map((entry) => entry.values[axisIndex] ?? 0), 0))

    return entries
      .map((entry) => ({
        ...entry,
        values: axes.map((_, axisIndex) => {
          const max = maxPerAxis[axisIndex]
          if (max <= 0) return 0
          return Math.min(1, (entry.values[axisIndex] ?? 0) / max)
        }),
      }))
      .sort((a, b) => {
        const order = { hidden: -1, muted: 0, highlighted: 1, draft: 2 }
        return order[a.mode] - order[b.mode]
      })
  }, [axes, entries, radarMode])

  const canCompareImpacts = useMemo(() => {
    const savedImpactCount = scenarioRenderList.filter((info) => {
      const scenario = scenarios.find((s) => s.id === info.id)
      return Boolean(scenario?.impactSummary)
    }).length
    return savedImpactCount + (currentImpact ? 1 : 0) >= 2
  }, [currentImpact, scenarioRenderList, scenarios])

  const size = 248
  const center = size / 2
  const radius = 90
  const levels = 4
  const markScale = Math.max(0.64, 1 / Math.sqrt(radarZoom))

  function zoomValue(value: number): number {
    return Math.min(1, Math.max(0, value) * radarZoom)
  }

  function pointFor(axisIndex: number, value: number): [number, number] {
    const angle = (Math.PI * 2 * axisIndex) / Math.max(axes.length, 1) - Math.PI / 2
    const r = radius * value
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)]
  }

  function polygonPoints(values: number[]): string {
    return values
      .map((v, idx) => {
        const [x, y] = pointFor(idx, zoomValue(v))
        return `${x},${y}`
      })
      .join(' ')
  }

  function adjustRadarZoom(delta: number) {
    setRadarZoom((previous) => clamp(previous + delta, 1, 4))
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Scenario Radar
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {radarMode === 'weights' ? 'MCDA priority distribution' : 'Impact KPIs, relative to max shown'}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
            {(['weights', 'impacts'] as RadarMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setRadarMode(mode)}
                className={`rounded px-2 py-1 text-[9px] font-bold uppercase tracking-wide transition-colors ${
                  radarMode === mode
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5" title={`Radar zoom ${radarZoom.toFixed(2)}x`}>
            <button
              type="button"
              onClick={() => adjustRadarZoom(-0.25)}
              disabled={radarZoom <= 1}
              className="flex h-5 w-5 items-center justify-center rounded text-xs font-bold text-slate-500 transition-colors hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:text-slate-300"
              aria-label="Zoom radar out"
            >
              -
            </button>
            <button
              type="button"
              onClick={() => adjustRadarZoom(0.25)}
              disabled={radarZoom >= 4}
              className="flex h-5 w-5 items-center justify-center rounded text-xs font-bold text-slate-500 transition-colors hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:text-slate-300"
              aria-label="Zoom radar in"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {radarMode === 'impacts' && !canCompareImpacts ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center text-[10px] text-slate-400">
          Save or show at least two scenarios with computed impacts.
        </div>
      ) : (
        <>
          <div className="mx-auto w-full max-w-[248px]">
            <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto">
              {Array.from({ length: levels }, (_, i) => {
                const ratio = (i + 1) / levels
                const ringPoints = axes.map((_, axisIndex) => pointFor(axisIndex, ratio))
                  .map(([x, y]) => `${x},${y}`)
                  .join(' ')
                return (
                  <polygon
                    key={`ring-${ratio}`}
                    points={ringPoints}
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth={1}
                  />
                )
              })}

              {axes.map((axis, idx) => {
                const [x, y] = pointFor(idx, 1)
                return (
                  <g key={axis.key}>
                    <line x1={center} y1={center} x2={x} y2={y} stroke="#cbd5e1" strokeWidth={1} />
                    <text
                      x={x}
                      y={y}
                      textAnchor={x < center - 4 ? 'end' : x > center + 4 ? 'start' : 'middle'}
                      dominantBaseline={y < center ? 'auto' : 'hanging'}
                      className="fill-slate-500"
                      style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em' }}
                    >
                      {axis.label}
                    </text>
                  </g>
                )
              })}

              {normalizedEntries.map((entry) => (
                <g key={entry.id}>
                  {entry.mode !== 'muted' && (
                    <polygon
                      points={polygonPoints(entry.values)}
                      fill="none"
                      stroke="rgba(255,255,255,0.92)"
                      strokeWidth={(entry.strokeWidth + 2.5) * markScale}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  <polygon
                    points={polygonPoints(entry.values)}
                    fill={entry.fill}
                    stroke={entry.stroke}
                    strokeWidth={entry.strokeWidth * markScale}
                    strokeOpacity={entry.opacity}
                    fillOpacity={entry.opacity}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>
                      {`${entry.label}\n${entry.tooltipLines.join('\n')}`}
                    </title>
                  </polygon>
                  {entry.dotRadius > 0 &&
                    entry.values.map((value, axisIndex) => {
                      const [x, y] = pointFor(axisIndex, zoomValue(value))
                      const axis = axes[axisIndex]
                      return (
                        <circle
                          key={`${entry.id}-${axisIndex}`}
                          cx={x}
                          cy={y}
                          r={entry.dotRadius * markScale}
                          fill={entry.stroke}
                          fillOpacity={entry.opacity}
                          stroke="white"
                          strokeWidth={entry.mode === 'muted' ? 0 : 1.5 * markScale}
                          vectorEffect="non-scaling-stroke"
                        >
                          <title>{`${entry.label} - ${entry.tooltipLines[axisIndex] ?? axis.label}`}</title>
                        </circle>
                      )
                    })}
                </g>
              ))}
            </svg>
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {entries.length === 0 ? (
          <div className="text-[10px] text-slate-400">
            No impact data yet. Add placements or toggle scenario visibility.
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="inline-flex items-center gap-1.5 text-[10px] text-slate-600">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.stroke, opacity: entry.opacity }}
              />
              <span className={entry.isDraft ? 'font-bold' : ''}>{entry.label}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
