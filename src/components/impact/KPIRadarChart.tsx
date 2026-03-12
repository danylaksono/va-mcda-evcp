import React, { useEffect, useMemo, useState } from 'react'
import type { ImpactEstimate, Scenario } from '@/analysis/types'
import { formatCO2, formatCompact, formatCurrency, formatEnergy, formatPercent } from '@/utils/format'

const RADAR_SELECTION_KEY = 'va-mcda-impact-radar-selection'

const RADAR_COLORS = [
  { stroke: '#0f766e', fill: 'rgba(15, 118, 110, 0.18)' },
  { stroke: '#1d4ed8', fill: 'rgba(29, 78, 216, 0.15)' },
  { stroke: '#7c3aed', fill: 'rgba(124, 58, 237, 0.15)' },
  { stroke: '#b45309', fill: 'rgba(180, 83, 9, 0.15)' },
  { stroke: '#be123c', fill: 'rgba(190, 18, 60, 0.14)' },
  { stroke: '#0f172a', fill: 'rgba(15, 23, 42, 0.12)' },
] as const

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

type RadarSeries = {
  id: string
  label: string
  impact: ImpactEstimate
  colorIndex: number
}

interface KPIRadarChartProps {
  currentImpact: ImpactEstimate | null
  scenarios: Scenario[]
  activeScenarioId: string | null
}

function loadSelection(): string[] {
  try {
    const raw = localStorage.getItem(RADAR_SELECTION_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function KPIRadarChart({ currentImpact, scenarios, activeScenarioId }: KPIRadarChartProps) {
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>(() => loadSelection())

  const scenarioOptions = useMemo(
    () => scenarios.filter((scenario) => scenario.impactSummary),
    [scenarios]
  )

  useEffect(() => {
    const validIds = new Set(scenarioOptions.map((scenario) => scenario.id))
    setSelectedScenarioIds((prev) => {
      const pruned = prev.filter((id) => validIds.has(id))
      if (pruned.length > 0 || !activeScenarioId || !validIds.has(activeScenarioId)) {
        return pruned
      }
      return [activeScenarioId]
    })
  }, [scenarioOptions, activeScenarioId])

  useEffect(() => {
    localStorage.setItem(RADAR_SELECTION_KEY, JSON.stringify(selectedScenarioIds))
  }, [selectedScenarioIds])

  const series = useMemo<RadarSeries[]>(() => {
    const fromCurrent = currentImpact
      ? [
          {
            id: 'current',
            label: 'Current draft',
            impact: currentImpact,
            colorIndex: 0,
          },
        ]
      : []

    const fromSaved = scenarioOptions
      .filter((scenario) => selectedScenarioIds.includes(scenario.id) && scenario.impactSummary)
      .map((scenario, idx) => ({
        id: scenario.id,
        label: scenario.name,
        impact: scenario.impactSummary as ImpactEstimate,
        colorIndex: (idx + 1) % RADAR_COLORS.length,
      }))

    return [...fromCurrent, ...fromSaved]
  }, [currentImpact, scenarioOptions, selectedScenarioIds])

  const normalizedSeries = useMemo(() => {
    if (series.length === 0) {
      return [] as Array<RadarSeries & { values: number[] }>
    }

    const maxPerMetric = METRICS.map((metric) =>
      Math.max(...series.map((entry) => metric.getValue(entry.impact)), 0)
    )

    return series.map((entry) => ({
      ...entry,
      values: METRICS.map((metric, index) => {
        const max = maxPerMetric[index]
        if (max <= 0) return 0
        return Math.min(1, metric.getValue(entry.impact) / max)
      }),
    }))
  }, [series])

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
      .map((value, idx) => {
        const [x, y] = pointFor(idx, value)
        return `${x},${y}`
      })
      .join(' ')
  }

  function toggleScenario(id: string) {
    setSelectedScenarioIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            KPI Radar
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Persistent profile for current and saved scenarios
          </div>
        </div>
        <div className="text-[9px] text-slate-400 uppercase tracking-wide">{series.length} shown</div>
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

          {normalizedSeries.map((entry) => {
            const color = RADAR_COLORS[entry.colorIndex]
            return (
              <g key={entry.id}>
                <polygon points={polygonPoints(entry.values)} fill={color.fill} stroke={color.stroke} strokeWidth={2}>
                  <title>
                    {`${entry.label}\n${METRICS.map((metric) => `${metric.label}: ${formatMetricValue(metric.key, entry.impact)}`).join('\n')}`}
                  </title>
                </polygon>
                {entry.values.map((value, axisIndex) => {
                  const [x, y] = pointFor(axisIndex, value)
                  const metric = METRICS[axisIndex]
                  return (
                    <circle key={`${entry.id}-${axisIndex}`} cx={x} cy={y} r={2.5} fill={color.stroke}>
                      <title>{`${entry.label} - ${metric.label}: ${formatMetricValue(metric.key, entry.impact)}`}</title>
                    </circle>
                  )
                })}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {series.length === 0 ? (
            <div className="text-[10px] text-slate-400">No impact data yet. Add placements or load a saved scenario.</div>
          ) : (
            series.map((entry) => {
              const color = RADAR_COLORS[entry.colorIndex]
              return (
                <div key={entry.id} className="inline-flex items-center gap-1.5 text-[10px] text-slate-600">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color.stroke }} />
                  {entry.label}
                </div>
              )
            })
          )}
        </div>

        {scenarioOptions.length > 0 && (
          <div className="space-y-1">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Compare saved scenarios</div>
            <div className="max-h-20 overflow-y-auto pr-1 space-y-1">
              {scenarioOptions.map((scenario) => (
                <label key={scenario.id} className="flex items-center gap-2 text-[10px] text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedScenarioIds.includes(scenario.id)}
                    onChange={() => toggleScenario(scenario.id)}
                    className="h-3 w-3 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="truncate">{scenario.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
