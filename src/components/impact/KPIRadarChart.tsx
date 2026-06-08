import React, { useMemo } from 'react'
import type { ImpactEstimate, Scenario } from '@/analysis/types'
import { formatCO2, formatCompact, formatCurrency, formatEnergy, formatPercent } from '@/utils/format'
import { useScenarioStore } from '@/store/scenario-store'
import {
  buildScenarioRenderList,
  getDraftStyle,
  MUTED_COLOR,
  type ScenarioRenderInfo,
} from '@/scenarios/scenario-styles'

type MetricDef = {
  key: string
  label: string
  getValue: (impact: ImpactEstimate) => number
}

const METRICS: MetricDef[] = [
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

type RadarEntry = {
  id: string
  label: string
  impact: ImpactEstimate
  mode: 'hidden' | 'muted' | 'highlighted' | 'draft'
  stroke: string
  fill: string
  strokeWidth: number
  opacity: number
  dotRadius: number
  isDraft: boolean
}

interface KPIRadarChartProps {
  currentImpact: ImpactEstimate | null
  scenarios: Scenario[]
  activeScenarioId: string | null
}

export function KPIRadarChart({ currentImpact, scenarios, activeScenarioId }: KPIRadarChartProps) {
  const visibleScenarioIds = useScenarioStore((s) => s.visibleScenarioIds)
  const comparedScenarioIds = useScenarioStore((s) => s.comparedScenarioIds)

  const scenarioRenderList = useMemo<ScenarioRenderInfo[]>(
    () =>
      buildScenarioRenderList(
        scenarios.map((s) => s.id),
        comparedScenarioIds,
        visibleScenarioIds
      ),
    [scenarios, comparedScenarioIds, visibleScenarioIds]
  )

  const entries = useMemo<RadarEntry[]>(() => {
    const result: RadarEntry[] = []

    scenarioRenderList.forEach((info) => {
      const scenario = scenarios.find((s) => s.id === info.id)
      if (!scenario?.impactSummary) return

      const r = parseInt(info.color.slice(1, 3), 16)
      const g = parseInt(info.color.slice(3, 5), 16)
      const b = parseInt(info.color.slice(5, 7), 16)

      result.push({
        id: scenario.id,
        label: scenario.name,
        impact: scenario.impactSummary,
        mode: info.mode,
        stroke: info.style.stroke,
        fill: info.mode === 'muted'
          ? 'rgba(148, 163, 184, 0.035)'
          : `rgba(${r}, ${g}, ${b}, 0.10)`,
        strokeWidth: info.mode === 'muted' ? 1 : 3.25,
        opacity: info.mode === 'muted' ? Math.min(info.style.opacity, 0.18) : 0.92,
        dotRadius: info.mode === 'muted' ? 0 : 3.5,
        isDraft: false,
      })
    })

    if (currentImpact) {
      const draft = getDraftStyle()
      result.push({
        id: 'current',
        label: 'Current draft',
        impact: currentImpact,
        mode: 'draft',
        stroke: draft.stroke,
        fill: 'rgba(15, 23, 42, 0.08)',
        strokeWidth: 3.75,
        opacity: 0.95,
        dotRadius: 4,
        isDraft: true,
      })
    }

    return result
  }, [currentImpact, scenarios, scenarioRenderList])

  const normalizedEntries = useMemo(() => {
    if (entries.length === 0) return [] as Array<RadarEntry & { values: number[] }>

    const maxPerMetric = METRICS.map((metric) =>
      Math.max(...entries.map((e) => metric.getValue(e.impact)), 0)
    )

    return entries
      .map((entry) => ({
        ...entry,
        values: METRICS.map((metric, i) => {
          const max = maxPerMetric[i]
          if (max <= 0) return 0
          return Math.min(1, metric.getValue(entry.impact) / max)
        }),
      }))
      .sort((a, b) => {
        const order = { hidden: -1, muted: 0, highlighted: 1, draft: 2 }
        return order[a.mode] - order[b.mode]
      })
  }, [entries])

  const size = 248
  const center = size / 2
  const radius = 90
  const levels = 4

  function pointFor(axisIndex: number, value: number): [number, number] {
    const angle = (Math.PI * 2 * axisIndex) / METRICS.length - Math.PI / 2
    const r = radius * value
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)]
  }

  function polygonPoints(values: number[]): string {
    return values
      .map((v, idx) => {
        const [x, y] = pointFor(idx, v)
        return `${x},${y}`
      })
      .join(' ')
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            KPI Radar
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Compare draft vs visible/highlighted scenarios
          </div>
        </div>
        <div className="text-[9px] text-slate-400 uppercase tracking-wide">
          {entries.length} shown
        </div>
      </div>

      <div className="mx-auto w-full max-w-[248px]">
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto">
          {Array.from({ length: levels }, (_, i) => {
            const ratio = (i + 1) / levels
            const ringPoints = METRICS.map((_, axisIndex) => pointFor(axisIndex, ratio))
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

          {METRICS.map((metric, idx) => {
            const [x, y] = pointFor(idx, 1)
            return (
              <g key={metric.key}>
                <line x1={center} y1={center} x2={x} y2={y} stroke="#cbd5e1" strokeWidth={1} />
                <text
                  x={x}
                  y={y}
                  textAnchor={x < center - 4 ? 'end' : x > center + 4 ? 'start' : 'middle'}
                  dominantBaseline={y < center ? 'auto' : 'hanging'}
                  className="fill-slate-500"
                  style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em' }}
                >
                  {metric.label}
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
                  strokeWidth={entry.strokeWidth + 2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <polygon
                points={polygonPoints(entry.values)}
                fill={entry.fill}
                stroke={entry.stroke}
                strokeWidth={entry.strokeWidth}
                strokeOpacity={entry.opacity}
                fillOpacity={entry.opacity}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              >
                <title>
                  {`${entry.label}\n${METRICS.map((m) => `${m.label}: ${formatMetricValue(m.key, entry.impact)}`).join('\n')}`}
                </title>
              </polygon>
              {entry.dotRadius > 0 &&
                entry.values.map((value, axisIndex) => {
                  const [x, y] = pointFor(axisIndex, value)
                  const metric = METRICS[axisIndex]
                  return (
                    <circle
                      key={`${entry.id}-${axisIndex}`}
                      cx={x}
                      cy={y}
                      r={entry.dotRadius}
                      fill={entry.stroke}
                      fillOpacity={entry.opacity}
                      stroke="white"
                      strokeWidth={entry.mode === 'muted' ? 0 : 1.5}
                      vectorEffect="non-scaling-stroke"
                    >
                      <title>{`${entry.label} - ${metric.label}: ${formatMetricValue(metric.key, entry.impact)}`}</title>
                    </circle>
                  )
                })}
            </g>
          ))}
        </svg>
      </div>

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
