import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { ArrowLeftRight, BookmarkPlus, RefreshCcw, SlidersHorizontal, Target } from 'lucide-react'
import { useMCDAStore } from '@/store/mcda-store'
import { useScenarioStore } from '@/store/scenario-store'
import type { MCDAMethod } from '@/analysis/types'

const MARGIN = { top: 28, right: 110, bottom: 18, left: 178 }
const ROW_HEIGHT = 58
const HANDLE_RADIUS = 8
const SCENARIO_COLORS = ['#2563eb', '#f97316', '#14b8a6', '#e11d48', '#8b5cf6', '#0f766e']

const METHOD_COPY: Record<MCDAMethod, string> = {
  WSM: 'Linear weighted sum for transparent trade-offs across normalized criteria.',
  WPM: 'Multiplicative scoring that penalizes weak performance more strongly.',
  TOPSIS: 'Ranks options by distance to the ideal and anti-ideal solution.',
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
  const toggleCriterion = useMCDAStore((s) => s.toggleCriterion)
  const resetWeights = useMCDAStore((s) => s.resetWeights)

  const scenarios = useScenarioStore((s) => s.scenarios)
  const saveScenario = useScenarioStore((s) => s.saveScenario)
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId)
  const currentPlacements = useScenarioStore((s) => s.currentPlacements)
  const setActiveScenario = useScenarioStore((s) => s.setActiveScenario)

  const [containerWidth, setContainerWidth] = useState(0)
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [scenarioName, setScenarioName] = useState('')

  useEffect(() => {
    if (!containerRef.current) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setContainerWidth(entry.contentRect.width)
      }
    })

    observer.observe(containerRef.current)
    setContainerWidth(containerRef.current.getBoundingClientRect().width)

    return () => observer.disconnect()
  }, [])

  const activeCriteria = criteria.filter((criterion) => criterion.active)
  const totalHeight = MARGIN.top + MARGIN.bottom + activeCriteria.length * ROW_HEIGHT
  const trackWidth = Math.max(containerWidth - MARGIN.left - MARGIN.right, 180)
  const xScale = useMemo(() => d3.scaleLinear().domain([0, 1]).range([0, trackWidth]), [trackWidth])

  const compareScenario = scenarios.find((scenario) => scenario.id === activeScenarioId) ?? null

  const lineGenerator = useMemo(
    () =>
      d3
        .line<{ x: number; y: number }>()
        .x((point) => point.x)
        .y((point) => point.y)
        .curve(d3.curveMonotoneY),
    []
  )

  const currentLinePath = useMemo(() => {
    if (activeCriteria.length < 2) return null

    return (
      lineGenerator(
        activeCriteria.map((criterion, index) => ({
          x: xScale(criterion.weight),
          y: index * ROW_HEIGHT + ROW_HEIGHT / 2,
        }))
      ) ?? null
    )
  }, [activeCriteria, lineGenerator, xScale])

  const scenarioPaths = useMemo(
    () =>
      scenarios.map((scenario, index) => ({
        scenario,
        color: SCENARIO_COLORS[index % SCENARIO_COLORS.length],
        path:
          activeCriteria.length < 2
            ? null
            : (lineGenerator(
                activeCriteria.map((criterion, rowIndex) => ({
                  x: xScale(scenario.weights[criterion.id] ?? 0),
                  y: rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2,
                }))
              ) ?? null),
      })),
    [activeCriteria, lineGenerator, scenarios, xScale]
  )

  function updateWeightFromClientX(criterionId: string, clientX: number) {
    if (!containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const localX = clientX - rect.left - MARGIN.left
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
  }, [xScale, setWeight])

  function startDragging(criterionId: string, clientX: number) {
    dragCriterionRef.current = criterionId
    updateWeightFromClientX(criterionId, clientX)
  }

  function handleSaveScenario() {
    const name = scenarioName.trim() || `Scenario ${scenarios.length + 1}`
    const weights: Record<string, number> = {}

    criteria.forEach((criterion) => {
      weights[criterion.id] = criterion.weight
    })

    saveScenario(name, weights, method)
    setScenarioName('')
    setShowSaveForm(false)
  }

  function loadScenario(scenarioId: string) {
    const scenario = scenarios.find((entry) => entry.id === scenarioId)
    if (!scenario) return

    setWeights(scenario.weights)
    setMethod(scenario.method)
    setActiveScenario(scenario.id)
  }

  return (
    <div ref={containerRef} className="w-full space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50/70 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-md">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2.2} />
              Parallel Coordinates Weight Lab
            </div>
            <h2 className="mt-2 text-lg font-bold tracking-tight text-slate-800">
              Tune weights directly on the axes, then compare against saved scenarios.
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
              The PCP allows independent 0–100% adjustment for intuitive tuning. 
              Weights are mathematically normalized behind the scenes based on the number of active parameters.
            </p>
          </div>

          <div className="min-w-[250px] space-y-3 rounded-2xl border border-white/70 bg-white/80 p-3 shadow-sm backdrop-blur">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                <Target className="h-3.5 w-3.5" strokeWidth={2.2} />
                Step 1. Select Method
              </div>
              <select
                value={method}
                onChange={(event) => setMethod(event.target.value as MCDAMethod)}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
              >
                <option value="WSM">Weighted Sum (WSM)</option>
                <option value="WPM">Weighted Product (WPM)</option>
                <option value="TOPSIS">TOPSIS</option>
              </select>
              <div className="mt-2 text-[11px] leading-relaxed text-slate-500">{METHOD_COPY[method]}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={resetWeights} className="btn-secondary px-3 py-1.5 text-[10px]">
                <RefreshCcw className="h-3.5 w-3.5" strokeWidth={2.2} />
                Reset Weights
              </button>
              <button
                onClick={() => setShowSaveForm((value) => !value)}
                className="btn-primary px-3 py-1.5 text-[10px]"
              >
                <BookmarkPlus className="h-3.5 w-3.5" strokeWidth={2.2} />
                Save Snapshot
              </button>
            </div>

            {showSaveForm && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={scenarioName}
                  onChange={(event) => setScenarioName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleSaveScenario()
                  }}
                  placeholder={`Scenario ${scenarios.length + 1}`}
                  className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
                />
                <button onClick={handleSaveScenario} className="btn-primary px-3 py-2 text-[10px]">
                  Save
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[1.2fr,1fr]">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Step 2. Choose Active Criteria
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {criteria.map((criterion) => (
                <button
                  key={criterion.id}
                  onClick={() => toggleCriterion(criterion.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition-all ${
                    criterion.active
                      ? 'border-slate-300 bg-white text-slate-700 shadow-sm'
                      : 'border-slate-200 bg-slate-100 text-slate-400'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: criterion.active ? criterion.color : '#cbd5e1' }}
                  />
                  {criterion.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              <ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={2.2} />
              Step 3. Compare Saved Scenarios
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => setActiveScenario(null)}
                className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition-all ${
                  activeScenarioId === null
                    ? 'border-slate-800 bg-slate-800 text-white'
                    : 'border-slate-300 bg-white text-slate-600'
                }`}
              >
                Current State
              </button>
              {scenarioPaths.map(({ scenario, color }) => (
                <button
                  key={scenario.id}
                  onClick={() => setActiveScenario(activeScenarioId === scenario.id ? null : scenario.id)}
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition-all ${
                    activeScenarioId === scenario.id
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'bg-slate-100 text-slate-500 hover:bg-white'
                  }`}
                  style={{ borderColor: color }}
                >
                  {scenario.name}
                </button>
              ))}
            </div>
            {compareScenario && (
              <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
                <div>
                  Comparing against <span className="font-bold text-slate-700">{compareScenario.name}</span>
                  {' '}({compareScenario.method}, {compareScenario.placements.length} placements)
                </div>
                <button onClick={() => loadScenario(compareScenario.id)} className="text-[10px] font-bold uppercase text-brand-600">
                  Load to workspace
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Step 4. Adjust on the Rail
            </div>
            <div className="mt-1 text-[12px] text-slate-500">
              Click or drag anywhere on a rail to set a criterion share. Saved lines stay in view for sensitivity checks.
            </div>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            {activeCriteria.length} active axes · {currentPlacements.length} charger placements
          </div>
        </div>

        {activeCriteria.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            Activate at least one criterion to draw the parallel coordinates view.
          </div>
        ) : (
          <svg width={containerWidth || undefined} height={totalHeight} className="mt-4 w-full overflow-visible">
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
                <g key={tick}>
                  <line
                    x1={xScale(tick)}
                    x2={xScale(tick)}
                    y1={-10}
                    y2={activeCriteria.length * ROW_HEIGHT - ROW_HEIGHT / 2}
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
                  <path
                    key={scenario.id}
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth={activeScenarioId === scenario.id ? 2.8 : 1.8}
                    strokeOpacity={activeScenarioId === scenario.id ? 0.7 : 0.18}
                  />
                ) : null
              )}

              {currentLinePath && (
                <path
                  d={currentLinePath}
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth={3}
                  strokeOpacity={0.9}
                />
              )}

              {activeCriteria.map((criterion, index) => {
                const y = index * ROW_HEIGHT + ROW_HEIGHT / 2
                const compareWeight = compareScenario?.weights[criterion.id] ?? null
                const delta = compareWeight === null ? null : criterion.weight - compareWeight

                return (
                  <g key={criterion.id} transform={`translate(0, ${y})`}>
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

                    <circle cx={-148} cy={-1} r={5} fill={criterion.color} />
                    <text x={-132} y={-3} className="fill-slate-700 text-[12px] font-semibold">
                      {criterion.name}
                    </text>
                    <text x={-132} y={13} className="fill-slate-400 text-[10px] uppercase tracking-[0.14em]">
                      {criterion.category}
                    </text>

                    <text x={trackWidth + 14} y={-2} className="fill-slate-700 text-[11px] font-mono font-bold">
                      {(criterion.weight * 100).toFixed(1)}%
                    </text>
                    {delta !== null && (
                      <text
                        x={trackWidth + 14}
                        y={13}
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
        )}
      </div>
    </div>
  )
}
