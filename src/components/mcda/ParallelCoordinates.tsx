import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { ArrowLeftRight, BookmarkPlus, RefreshCcw, SlidersHorizontal, Target } from 'lucide-react'
import { useMCDAStore } from '@/store/mcda-store'
import { useScenarioStore } from '@/store/scenario-store'
import type { CriterionPolarity, MCDAMethod } from '@/analysis/types'

const CHART_TOP = 28
const CHART_BOTTOM = 18
const MIN_ROW_HEIGHT = 46
const MAX_ROW_HEIGHT = 72
const FALLBACK_ROW_HEIGHT = 58
const HANDLE_RADIUS = 8
const SCENARIO_COLORS = ['#2563eb', '#f97316', '#14b8a6', '#e11d48', '#8b5cf6', '#0f766e']

const METHOD_COPY: Record<MCDAMethod, string> = {
  WSM: 'Linear weighted sum for transparent trade-offs across normalized criteria.',
  WPM: 'Multiplicative scoring that penalizes weak performance more strongly.',
  TOPSIS: 'Ranks options by distance to the ideal and anti-ideal solution.',
}

function buildActiveLinePath(
  criteria: Array<{ active: boolean }>,
  getPoint: (index: number) => { x: number; y: number },
  lineGenerator: d3.Line<{ x: number; y: number }>
) {
  const points = criteria
    .map((criterion, index) => ({ criterion, index }))
    .filter(({ criterion }) => criterion.active)
    .map(({ index }) => getPoint(index))

  if (points.length < 2) return null
  return lineGenerator(points) ?? null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function ParallelCoordinates() {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragCriterionRef = useRef<string | null>(null)

  const criteria = useMCDAStore((s) => s.criteria)
  const method = useMCDAStore((s) => s.method)
  const setMethod = useMCDAStore((s) => s.setMethod)
  const setWeight = useMCDAStore((s) => s.setWeight)
  const setWeights = useMCDAStore((s) => s.setWeights)
  const setPolarity = useMCDAStore((s) => s.setPolarity)
  const setPolarities = useMCDAStore((s) => s.setPolarities)
  const toggleCriterion = useMCDAStore((s) => s.toggleCriterion)
  const resetWeights = useMCDAStore((s) => s.resetWeights)

  const scenarios = useScenarioStore((s) => s.scenarios)
  const saveScenario = useScenarioStore((s) => s.saveScenario)
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId)
  const currentPlacements = useScenarioStore((s) => s.currentPlacements)
  const setActiveScenario = useScenarioStore((s) => s.setActiveScenario)
  const setPlacements = useScenarioStore((s) => s.setPlacements)
  const resetWorkingScenario = useScenarioStore((s) => s.resetWorkingScenario)

  const [containerWidth, setContainerWidth] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [scenarioName, setScenarioName] = useState('')

  useEffect(() => {
    if (!containerRef.current) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setContainerWidth(entry.contentRect.width)
        setContainerHeight(entry.contentRect.height)
      }
    })

    observer.observe(containerRef.current)
    setContainerWidth(containerRef.current.clientWidth)
    setContainerHeight(containerRef.current.clientHeight)

    return () => observer.disconnect()
  }, [criteria.length]) // re-measure if criteria length changes causing render

  const rowHeight =
    criteria.length > 0
      ? clamp((containerHeight - CHART_TOP - CHART_BOTTOM) / criteria.length, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT)
      : FALLBACK_ROW_HEIGHT
  const totalHeight = CHART_TOP + CHART_BOTTOM + criteria.length * rowHeight

  const longestLabel = useMemo(
    () => criteria.reduce((max, criterion) => Math.max(max, criterion.name.length, criterion.category.length), 0),
    [criteria]
  )
  const labelAwareGutter = 44 + longestLabel * 6
  const leftGutter = clamp(Math.max(containerWidth * 0.28, labelAwareGutter), 124, 210)
  const rightGutter = clamp(containerWidth * 0.14, 52, 72)
  const trackWidth = Math.max(containerWidth - leftGutter - rightGutter, 160)
  const xScale = useMemo(() => d3.scaleLinear().domain([0, 1]).range([0, trackWidth]), [trackWidth])

  const compareScenario = scenarios.find((scenario) => scenario.id === activeScenarioId) ?? null
  const activeCriteria = useMemo(() => criteria.filter((criterion) => criterion.active), [criteria])
  const activeWeightTotal = useMemo(
    () => activeCriteria.reduce((sum, criterion) => sum + criterion.weight, 0),
    [activeCriteria]
  )
  const normalizedActiveWeights = useMemo(
    () =>
      activeCriteria.map((criterion) => ({
        ...criterion,
        normalizedWeight: activeWeightTotal > 0 ? criterion.weight / activeWeightTotal : 0,
      })),
    [activeCriteria, activeWeightTotal]
  )

  const equationText = useMemo(() => {
    const orientedTerms = normalizedActiveWeights.map((criterion, idx) => {
      const scoreSymbol = `s${idx + 1}`
      const orientedScore = criterion.polarity === 'cost' ? `(1-${scoreSymbol})` : scoreSymbol
      return { weightSymbol: `w${idx + 1}`, orientedScore }
    })

    if (method === 'WPM') {
      const product = orientedTerms.map((term) => `${term.orientedScore}^${term.weightSymbol}`).join(' · ')
      return product.length > 0 ? `Score = ${product}` : 'Score = Π(s_i^w_i)'
    }

    if (method === 'TOPSIS') {
      return orientedTerms.length > 0
        ? 'Score = D- / (D+ + D-), with v_i = w_i · oriented(s_i)'
        : 'Score = D- / (D+ + D-)'
    }

    const sumTerms = orientedTerms.map((term) => `${term.weightSymbol}·${term.orientedScore}`).join(' + ')
    return sumTerms.length > 0 ? `Score = ${sumTerms}` : 'Score = Σ(w_i · s_i)'
  }, [method, normalizedActiveWeights])

  const lineGenerator = useMemo(
    () =>
      d3
        .line<{ x: number; y: number }>()
        .x((point) => point.x)
        .y((point) => point.y)
        .curve(d3.curveMonotoneY),
    []
  )

  const currentLinePath = useMemo(
    () =>
      buildActiveLinePath(
        criteria,
        (index) => ({
          x: xScale(criteria[index]?.weight ?? 0),
          y: index * rowHeight + rowHeight / 2,
        }),
        lineGenerator
      ),
    [criteria, lineGenerator, rowHeight, xScale]
  )

  const scenarioPaths = useMemo(
    () =>
      scenarios.map((scenario, index) => ({
        scenario,
        color: SCENARIO_COLORS[index % SCENARIO_COLORS.length],
        path:
          criteria.length < 2
            ? null
            : buildActiveLinePath(
                criteria,
                (rowIndex) => ({
                  x: xScale(scenario.weights[criteria[rowIndex]?.id ?? ''] ?? 0),
                  y: rowIndex * rowHeight + rowHeight / 2,
                }),
                lineGenerator
              ),
      })),
    [criteria, lineGenerator, rowHeight, scenarios, xScale]
  )

  function updateWeightFromClientX(criterionId: string, clientX: number) {
    if (!containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const localX = clientX - rect.left - leftGutter
    const nextWeight = clamp(xScale.invert(localX), 0, 1)
    setWeight(criterionId, nextWeight)
  }

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!dragCriterionRef.current) return
      updateWeightFromClientX(dragCriterionRef.current, event.clientX)
    }

    function handlePointerUp() {
      dragCriterionRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [leftGutter, setWeight, xScale])

  function startDragging(criterionId: string, clientX: number) {
    dragCriterionRef.current = criterionId
    updateWeightFromClientX(criterionId, clientX)
  }

  function handleSaveScenario() {
    const name = scenarioName.trim() || `Scenario ${scenarios.length + 1}`
    const weights: Record<string, number> = {}
    const polarities: Record<string, CriterionPolarity> = {}

    criteria.forEach((criterion) => {
      weights[criterion.id] = criterion.weight
      polarities[criterion.id] = criterion.polarity
    })

    saveScenario(name, weights, method, polarities)
    setScenarioName('')
    setShowSaveForm(false)
  }

  function loadScenario(scenarioId: string) {
    const scenario = scenarios.find((entry) => entry.id === scenarioId)
    if (!scenario) return

    setWeights(scenario.weights)
    if (scenario.polarities) {
      setPolarities(scenario.polarities)
    }
    setMethod(scenario.method)
    setPlacements(scenario.placements)
    setActiveScenario(scenario.id)
  }

  function handleResetScenario() {
    resetWeights()
    resetWorkingScenario()
  }

  function togglePolarity(criterionId: string, polarity: CriterionPolarity) {
    setPolarity(criterionId, polarity === 'benefit' ? 'cost' : 'benefit')
  }

  return (
    <div className="h-full w-full">
      <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-700">
              Parallel Coordinates Weight Lab
            </h2>
          </div>

          <div className="flex flex-col items-end gap-1.5 flex-1">
            <div className="flex items-center justify-end gap-2 w-full">
              <button 
                onClick={handleResetScenario} 
                className="btn-secondary flex h-8 items-center justify-center gap-1.5 px-3 whitespace-nowrap text-[11px]" 
                title="Reset Working Scenario"
              >
                <RefreshCcw className="h-3.5 w-3.5" strokeWidth={2.2} />
                <span className="hidden sm:inline">Reset</span>
              </button>
              <select
                title="MCDA Method"
                value={method}
                onChange={(event) => setMethod(event.target.value as MCDAMethod)}
                className="h-8 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
              >
                <option value="WSM">Weighted Sum (WSM)</option>
                <option value="WPM">Weighted Product (WPM)</option>
                <option value="TOPSIS">TOPSIS</option>
              </select>
            </div>
            <div className="text-[10px] text-slate-500 text-right w-full leading-tight">{METHOD_COPY[method]}</div>
          </div>
        </div>

        {criteria.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            Activate at least one criterion to draw the parallel coordinates view.
          </div>
        ) : (
          <div ref={containerRef} className="mt-4 w-full flex-1 min-h-[430px]">
            <svg width={containerWidth || undefined} height={totalHeight} className="block w-full">
              <g transform={`translate(${leftGutter},${CHART_TOP})`}>
                {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
                <g key={tick}>
                  <line
                    x1={xScale(tick)}
                    x2={xScale(tick)}
                    y1={-10}
                    y2={criteria.length * rowHeight - rowHeight / 2}
                    stroke={tick === 0 || tick === 1 ? '#cbd5e1' : '#e2e8f0'}
                    strokeDasharray={tick === 0 || tick === 1 ? '0' : '3 6'}
                  />
                  <text
                    x={xScale(tick)}
                    y={-14}
                    textAnchor="middle"
                    className="fill-slate-400 text-[10px] font-mono"
                  >
                    {`${Math.round(tick * 100)}%`}
                  </text>
                </g>
              ))}

              {scenarioPaths.map(({ scenario, path, color }) =>
                path ? (
                  <g key={scenario.id}>
                    <path
                      d={path}
                      fill="none"
                      stroke={color}
                      strokeWidth={activeScenarioId === scenario.id ? 4 : 2}
                      strokeOpacity={activeScenarioId === scenario.id ? 0.9 : 0.25}
                      className="cursor-pointer transition-all hover:stroke-opacity-100"
                      onClick={() => setActiveScenario(activeScenarioId === scenario.id ? null : scenario.id)}
                    />
                  </g>
                ) : null
              )}

              {currentLinePath && (
                <path
                  d={currentLinePath}
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth={3}
                  strokeOpacity={0.9}
                  className="pointer-events-none"
                />
              )}

              {criteria.map((criterion, index) => {
                const y = index * rowHeight + rowHeight / 2
                const compareWeight = compareScenario?.weights[criterion.id] ?? null
                const delta = compareWeight === null ? null : criterion.weight - compareWeight
                const labelX = -leftGutter + 30

                return (
                  <g key={criterion.id} transform={`translate(0, ${y})`} className={`transition-opacity duration-300 ${!criterion.active ? 'opacity-30' : ''}`}>
                    <line
                      x1={0}
                      x2={trackWidth}
                      y1={0}
                      y2={0}
                      stroke="#e2e8f0"
                      strokeWidth={12}
                      strokeLinecap="round"
                    />
                    <line
                      x1={0}
                      x2={xScale(criterion.weight)}
                      y1={0}
                      y2={0}
                      stroke={criterion.color}
                      strokeWidth={12}
                      strokeOpacity={0.18}
                      strokeLinecap="round"
                    />
                    <line
                      x1={0}
                      x2={xScale(criterion.weight)}
                      y1={0}
                      y2={0}
                      stroke={criterion.color}
                      strokeWidth={4}
                      strokeLinecap="round"
                    />

                    {scenarioPaths.map(({ scenario, color }) => (
                      <circle
                        key={scenario.id}
                        cx={xScale(scenario.weights[criterion.id] ?? 0)}
                        cy={0}
                        r={activeScenarioId === scenario.id ? 4.5 : 3}
                        fill={color}
                        fillOpacity={activeScenarioId === scenario.id ? 0.85 : 0.3}
                        stroke="white"
                        strokeWidth={1}
                        className="pointer-events-none"
                      />
                    ))}

                    <rect
                      x={0}
                      y={-18}
                      width={trackWidth}
                      height={36}
                      fill="transparent"
                      className="cursor-ew-resize"
                      onPointerDown={(event) => startDragging(criterion.id, event.clientX)}
                    />

                    <circle
                      cx={xScale(criterion.weight)}
                      cy={0}
                      r={HANDLE_RADIUS}
                      fill="white"
                      stroke={criterion.color}
                      strokeWidth={3}
                      style={{ filter: 'drop-shadow(0 4px 10px rgba(15, 23, 42, 0.18))' }}
                      className="cursor-ew-resize"
                      onPointerDown={(event) => startDragging(criterion.id, event.clientX)}
                    />

                    <g className="cursor-pointer" onClick={() => toggleCriterion(criterion.id)}>
                      <circle cx={-leftGutter + 14} cy={-1} r={8} fill={criterion.active ? criterion.color : '#cbd5e1'} />
                      <text x={labelX} y={-3} className="fill-slate-700 text-[12px] font-semibold">
                        {criterion.name}
                      </text>
                      <text x={labelX} y={13} className="fill-slate-400 text-[10px] uppercase tracking-[0.14em]">
                        {criterion.category}
                      </text>
                    </g>

                    <g
                      className="cursor-pointer"
                      onClick={(event) => {
                        event.stopPropagation()
                        togglePolarity(criterion.id, criterion.polarity)
                      }}
                    >
                      <rect
                          x={labelX}
                          y={18}
                          width={38}
                          height={14}
                          rx={7}
                        fill={criterion.polarity === 'benefit' ? '#dcfce7' : '#fee2e2'}
                        stroke={criterion.polarity === 'benefit' ? '#86efac' : '#fecaca'}
                      />
                      <text
                          x={labelX + 19}
                          y={28}
                          textAnchor="middle"
                        className={`text-[8px] font-bold uppercase tracking-[0.06em] ${criterion.polarity === 'benefit' ? 'fill-emerald-700' : 'fill-rose-700'}`}
                      >
                        {criterion.polarity === 'benefit' ? 'Ben' : 'Cost'}
                      </text>
                    </g>

                    <text
                      x={trackWidth + rightGutter - 6}
                      y={-2}
                      textAnchor="end"
                      className="fill-slate-700 text-[11px] font-mono font-bold"
                    >
                      {(criterion.weight * 100).toFixed(1)}%
                    </text>
                    {delta !== null && (
                      <text
                        x={trackWidth + rightGutter - 6}
                        y={13}
                        textAnchor="end"
                        className={`text-[10px] font-bold ${delta >= 0 ? 'fill-emerald-500' : 'fill-rose-500'}`}
                      >
                        {`${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)} vs ref`}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          </svg>

          {scenarioPaths.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {scenarioPaths.map(({ scenario, color }) => {
                const isActive = activeScenarioId === scenario.id

                return (
                  <div
                    key={scenario.id}
                    className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-[11px] shadow-sm transition-colors ${
                      isActive ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveScenario(isActive ? null : scenario.id)}
                      className="flex items-center gap-2 font-semibold text-slate-700"
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span>{scenario.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => loadScenario(scenario.id)}
                      className="rounded-lg border border-slate-200 px-2 py-0.5 font-bold uppercase tracking-[0.12em] text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
                    >
                      Load
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          </div>
        )}

        {activeCriteria.length > 0 && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Current Equation</div>
              <div className="text-[10px] font-semibold text-slate-400">{activeCriteria.length} active criteria</div>
            </div>

            <div className="mt-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-mono text-slate-700">
              {equationText}
            </div>

            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="flex h-full w-full">
                {normalizedActiveWeights.map((criterion) => (
                  <div
                    key={`stack-${criterion.id}`}
                    className="h-full"
                    style={{
                      width: `${criterion.normalizedWeight * 100}%`,
                      backgroundColor: criterion.color,
                    }}
                    title={`${criterion.name}: ${(criterion.normalizedWeight * 100).toFixed(1)}%`}
                  />
                ))}
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {normalizedActiveWeights.map((criterion, index) => (
                <div key={`eq-${criterion.id}`} className="flex items-center justify-between gap-2 text-[10px]">
                  <div className="flex min-w-0 items-center gap-1.5 text-slate-600">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: criterion.color }} />
                    <span className="truncate font-semibold">w{index + 1}: {criterion.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] ${criterion.polarity === 'benefit' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}
                    >
                      {criterion.polarity === 'benefit' ? 'Ben' : 'Cost'}
                    </span>
                    <span className="font-mono font-bold text-slate-700">
                      {(criterion.normalizedWeight * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
