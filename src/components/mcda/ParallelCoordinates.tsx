import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { RefreshCcw, SlidersHorizontal } from 'lucide-react'
import { useMCDAStore } from '@/store/mcda-store'
import { useScenarioStore } from '@/store/scenario-store'
import type { MCDAMethod } from '@/analysis/types'
import {
  buildScenarioRenderList,
  getDraftStyle,
  MUTED_COLOR,
  type ScenarioRenderInfo,
} from '@/scenarios/scenario-styles'

const CHART_TOP = 28
const CHART_BOTTOM = 18
const MIN_ROW_HEIGHT = 42
const MAX_ROW_HEIGHT = 64
const FALLBACK_ROW_HEIGHT = 52
const HANDLE_RADIUS = 8

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

interface ParallelCoordinatesProps {
  mcdaResults?: Array<{
    h3_cell: string
    mcda_score: number
    criterion_values?: Record<string, number>
  }>
}

const TOPSIS_MAX_SCATTER_POINTS = 400

export function ParallelCoordinates({ mcdaResults }: ParallelCoordinatesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragCriterionRef = useRef<string | null>(null)

  const criteria = useMCDAStore((s) => s.criteria)
  const method = useMCDAStore((s) => s.method)
  const setMethod = useMCDAStore((s) => s.setMethod)
  const setWeight = useMCDAStore((s) => s.setWeight)
  const setPolarity = useMCDAStore((s) => s.setPolarity)
  const toggleCriterion = useMCDAStore((s) => s.toggleCriterion)
  const resetWeights = useMCDAStore((s) => s.resetWeights)

  const scenarios = useScenarioStore((s) => s.scenarios)
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId)
  const visibleScenarioIds = useScenarioStore((s) => s.visibleScenarioIds)
  const comparedScenarioIds = useScenarioStore((s) => s.comparedScenarioIds)
  const setActiveScenario = useScenarioStore((s) => s.setActiveScenario)
  const resetWorkingScenario = useScenarioStore((s) => s.resetWorkingScenario)
  const toggleScenarioComparison = useScenarioStore((s) => s.toggleScenarioComparison)

  const [containerWidth, setContainerWidth] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)

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
  }, [criteria.length])

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

  const compareScenario = scenarios.find((s) => s.id === activeScenarioId) ?? null
  const activeCriteria = useMemo(() => criteria.filter((c) => c.active), [criteria])
  const activeWeightTotal = useMemo(
    () => activeCriteria.reduce((sum, c) => sum + c.weight, 0),
    [activeCriteria]
  )
  const normalizedActiveWeights = useMemo(
    () =>
      activeCriteria.map((c) => ({
        ...c,
        normalizedWeight: activeWeightTotal > 0 ? c.weight / activeWeightTotal : 0,
      })),
    [activeCriteria, activeWeightTotal]
  )

  const topsisScatter = useMemo(() => {
    if (method !== 'TOPSIS' || !mcdaResults || mcdaResults.length === 0) return null
    if (normalizedActiveWeights.length === 0) return null

    const alts = mcdaResults
      .filter((r) => r.criterion_values && Object.keys(r.criterion_values).length > 0)
      .map((r) => {
        const wv: Record<string, number> = {}
        for (const c of normalizedActiveWeights) {
          wv[c.id] = c.normalizedWeight * (r.criterion_values![c.id] ?? 0)
        }
        return { score: r.mcda_score, wv }
      })

    if (alts.length === 0) return null

    const pis: Record<string, number> = {}
    const nis: Record<string, number> = {}
    for (const c of normalizedActiveWeights) {
      pis[c.id] = -Infinity
      nis[c.id] = Infinity
    }
    for (const alt of alts) {
      for (const c of normalizedActiveWeights) {
        const v = alt.wv[c.id] ?? 0
        if (v > pis[c.id]) pis[c.id] = v
        if (v < nis[c.id]) nis[c.id] = v
      }
    }

    const points = alts.map((alt) => {
      let dpSq = 0
      let dmSq = 0
      for (const c of normalizedActiveWeights) {
        const v = alt.wv[c.id] ?? 0
        dpSq += (v - pis[c.id]) ** 2
        dmSq += (v - nis[c.id]) ** 2
      }
      return { dPlus: Math.sqrt(dpSq), dMinus: Math.sqrt(dmSq), score: alt.score }
    })

    let sampled = points
    if (points.length > TOPSIS_MAX_SCATTER_POINTS) {
      const sorted = [...points].sort((a, b) => a.score - b.score)
      const step = Math.max(1, Math.floor(sorted.length / TOPSIS_MAX_SCATTER_POINTS))
      sampled = sorted.filter((_, i) => i % step === 0 || i === 0 || i === sorted.length - 1)
    }

    const maxD = Math.max(
      ...sampled.map((p) => p.dPlus),
      ...sampled.map((p) => p.dMinus),
      0.001
    )

    return { points: sampled, maxD, total: points.length }
  }, [method, mcdaResults, normalizedActiveWeights])

  const scenarioRenderList = useMemo<ScenarioRenderInfo[]>(
    () =>
      buildScenarioRenderList(
        scenarios.map((s) => s.id),
        comparedScenarioIds,
        visibleScenarioIds
      ),
    [scenarios, comparedScenarioIds, visibleScenarioIds]
  )

  const equationText = useMemo(() => {
    const orientedTerms = normalizedActiveWeights.map((c, idx) => {
      const scoreSymbol = `s${idx + 1}`
      const orientedScore = c.polarity === 'cost' ? `(1-${scoreSymbol})` : scoreSymbol
      return { weightSymbol: `w${idx + 1}`, orientedScore }
    })

    if (method === 'WPM') {
      const product = orientedTerms.map((t) => `${t.orientedScore}^${t.weightSymbol}`).join(' · ')
      return product.length > 0 ? `Score = ${product}` : 'Score = Π(s_i^w_i)'
    }

    if (method === 'TOPSIS') {
      return orientedTerms.length > 0
        ? 'Score = D- / (D+ + D-), with v_i = w_i · oriented(s_i)'
        : 'Score = D- / (D+ + D-)'
    }

    const sumTerms = orientedTerms.map((t) => `${t.weightSymbol}·${t.orientedScore}`).join(' + ')
    return sumTerms.length > 0 ? `Score = ${sumTerms}` : 'Score = Σ(w_i · s_i)'
  }, [method, normalizedActiveWeights])

  const lineGenerator = useMemo(
    () =>
      d3
        .line<{ x: number; y: number }>()
        .x((p) => p.x)
        .y((p) => p.y)
        .curve(d3.curveMonotoneY),
    []
  )

  const draftStyle = getDraftStyle()

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

  const scenarioPathEntries = useMemo(
    () =>
      scenarioRenderList.map((info) => {
        const scenario = scenarios.find((s) => s.id === info.id)
        if (!scenario) return { info, path: null, scenario: null }
        const path =
          criteria.length < 2
            ? null
            : buildActiveLinePath(
                criteria,
                (rowIndex) => ({
                  x: xScale(scenario.weights[criteria[rowIndex]?.id ?? ''] ?? 0),
                  y: rowIndex * rowHeight + rowHeight / 2,
                }),
                lineGenerator
              )
        return { info, path, scenario }
      }),
    [criteria, lineGenerator, rowHeight, scenarios, scenarioRenderList, xScale]
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

  function handleResetScenario() {
    resetWeights()
    resetWorkingScenario()
  }

  function togglePolarity(criterionId: string, polarity: string) {
    setPolarity(criterionId, polarity === 'benefit' ? 'cost' : 'benefit')
  }

  return (
    <div className="h-full w-full">
      <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
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
                onChange={(e) => setMethod(e.target.value as MCDAMethod)}
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
          <div ref={containerRef} className="mt-2 w-full flex-1 min-h-[340px]">
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

                {/* Muted scenario lines first (behind) */}
                {scenarioPathEntries
                  .filter((e) => e.info.mode === 'muted' && e.path)
                  .map(({ info, path }) => (
                    <path
                      key={info.id}
                      d={path!}
                      fill="none"
                      stroke={info.style.stroke}
                      strokeWidth={info.style.strokeWidth}
                      strokeOpacity={info.style.opacity}
                      className="pointer-events-none"
                    />
                  ))}

                {/* Highlighted scenario lines */}
                {scenarioPathEntries
                  .filter((e) => e.info.mode === 'highlighted' && e.path)
                  .map(({ info, path }) => (
                    <path
                      key={info.id}
                      d={path!}
                      fill="none"
                      stroke={info.style.stroke}
                      strokeWidth={info.style.strokeWidth}
                      strokeOpacity={info.style.opacity}
                      className="cursor-pointer transition-all hover:stroke-[3]"
                      onClick={() => toggleScenarioComparison(info.id)}
                    />
                  ))}

                {/* Draft line on top */}
                {currentLinePath && (
                  <path
                    d={currentLinePath}
                    fill="none"
                    stroke={draftStyle.stroke}
                    strokeWidth={draftStyle.strokeWidth}
                    strokeOpacity={draftStyle.opacity}
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

                      {/* Scenario endpoint circles */}
                      {scenarioPathEntries.map(({ info, scenario }) => {
                        if (!scenario) return null
                        const cx = xScale(scenario.weights[criterion.id] ?? 0)
                        return (
                          <circle
                            key={info.id}
                            cx={cx}
                            cy={0}
                            r={info.style.circleRadius * 0.6}
                            fill={info.style.stroke}
                            fillOpacity={info.style.opacity}
                            stroke="white"
                            strokeWidth={info.mode === 'highlighted' ? 1 : 0}
                            className="pointer-events-none"
                          />
                        )
                      })}

                      <rect
                        x={0}
                        y={-18}
                        width={trackWidth}
                        height={36}
                        fill="transparent"
                        className="cursor-ew-resize"
                        onPointerDown={(e) => startDragging(criterion.id, e.clientX)}
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
                        onPointerDown={(e) => startDragging(criterion.id, e.clientX)}
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
                        onClick={(e) => {
                          e.stopPropagation()
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

            {/* Scenario comparison chips */}
            {scenarioPathEntries.filter((e) => e.info.mode === 'highlighted').length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {scenarioPathEntries
                  .filter((e) => e.info.mode === 'highlighted' && e.scenario)
                  .map(({ info, scenario }) => (
                    <button
                      key={info.id}
                      type="button"
                      onClick={() => setActiveScenario(activeScenarioId === info.id ? null : info.id)}
                      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors ${
                        activeScenarioId === info.id
                          ? 'border-slate-300 bg-slate-50 text-slate-700'
                          : 'border-slate-200 bg-white text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: info.color }}
                      />
                      <span className="truncate max-w-[100px]">{scenario!.name}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        {activeCriteria.length > 0 && method === 'TOPSIS' && (
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                D⁺ vs D⁻ Distance Plot
              </div>
              <div className="text-[10px] font-semibold text-slate-400">
                {topsisScatter ? `${topsisScatter.total.toLocaleString()} alternatives` : 'loading…'}
              </div>
            </div>

            {topsisScatter ? (
              <>
                <svg viewBox="0 0 260 230" className="mt-1.5 w-full" style={{ maxHeight: '200px' }} preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <clipPath id="topsis-plot-clip">
                      <rect x={40} y={8} width={200} height={200} />
                    </clipPath>
                  </defs>

                  {/* Plot background */}
                  <rect x={40} y={8} width={200} height={200} rx={4} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={0.5} />

                  {/* Grid lines */}
                  {[0.25, 0.5, 0.75].map((t) => (
                    <g key={t}>
                      <line
                        x1={40 + t * 200} y1={8} x2={40 + t * 200} y2={208}
                        stroke="#e2e8f0" strokeWidth={0.3} strokeDasharray="2 3"
                      />
                      <line
                        x1={40} y1={8 + t * 200} x2={240} y2={8 + t * 200}
                        stroke="#e2e8f0" strokeWidth={0.3} strokeDasharray="2 3"
                      />
                    </g>
                  ))}

                  {/* Iso-closeness lines: C = D⁻/(D⁺+D⁻) = k ⟹ D⁻ = (k/(1-k))·D⁺ */}
                  {/* C = 0.25 → slope 1/3 */}
                  <line
                    x1={40} y1={208} x2={240} y2={208 - (200 / 3)}
                    stroke="#cbd5e1" strokeWidth={0.4} strokeDasharray="4 4"
                  />
                  <text x={242} y={208 - (200 / 3) + 3} className="fill-slate-300 text-[6px]">C=.25</text>

                  {/* C = 0.5 → slope 1 (diagonal) */}
                  <line
                    x1={40} y1={208} x2={240} y2={8}
                    stroke="#94a3b8" strokeWidth={0.6} strokeDasharray="3 3"
                  />
                  <text x={242} y={11} className="fill-slate-400 text-[6px] font-semibold">C=.5</text>

                  {/* C = 0.75 → slope 3 */}
                  <line
                    x1={40} y1={208} x2={40 + (200 / 3)} y2={8}
                    stroke="#cbd5e1" strokeWidth={0.4} strokeDasharray="4 4"
                  />
                  <text x={40 + (200 / 3) + 2} y={11} className="fill-slate-300 text-[6px]">C=.75</text>

                  {/* Scatter points */}
                  <g clipPath="url(#topsis-plot-clip)">
                    {topsisScatter.points.map((p, i) => {
                      const px = 40 + (p.dPlus / topsisScatter.maxD) * 200
                      const py = 208 - (p.dMinus / topsisScatter.maxD) * 200
                      const hue = p.score * 120
                      return (
                        <circle
                          key={i}
                          cx={px}
                          cy={py}
                          r={1.4}
                          fill={`hsl(${hue}, 72%, 52%)`}
                          opacity={0.55}
                        />
                      )
                    })}
                  </g>

                  {/* Axis tick labels */}
                  <text x={40} y={220} textAnchor="middle" className="fill-slate-400 text-[7px] font-mono">0</text>
                  <text x={140} y={220} textAnchor="middle" className="fill-slate-400 text-[7px] font-mono">
                    {(topsisScatter.maxD / 2).toFixed(2)}
                  </text>
                  <text x={240} y={220} textAnchor="middle" className="fill-slate-400 text-[7px] font-mono">
                    {topsisScatter.maxD.toFixed(2)}
                  </text>

                  <text x={36} y={212} textAnchor="end" className="fill-slate-400 text-[7px] font-mono">0</text>
                  <text x={36} y={112} textAnchor="end" className="fill-slate-400 text-[7px] font-mono">
                    {(topsisScatter.maxD / 2).toFixed(2)}
                  </text>
                  <text x={36} y={14} textAnchor="end" className="fill-slate-400 text-[7px] font-mono">
                    {topsisScatter.maxD.toFixed(2)}
                  </text>

                  {/* Axis labels */}
                  <text x={140} y={229} textAnchor="middle" className="fill-slate-500 text-[8px] font-semibold">
                    D⁺ (distance to ideal)
                  </text>
                  <text
                    x={10} y={108}
                    textAnchor="middle"
                    className="fill-slate-500 text-[8px] font-semibold"
                    transform="rotate(-90, 10, 108)"
                  >
                    D⁻ (distance to anti-ideal)
                  </text>
                </svg>

                {/* Color legend + formula */}
                <div className="mt-1 flex items-center gap-2 text-[9px]">
                  <span className="text-slate-400">Low C</span>
                  <div
                    className="flex-1 h-1.5 rounded-full"
                    style={{ background: 'linear-gradient(to right, hsl(0,72%,52%), hsl(60,72%,52%), hsl(120,72%,52%))' }}
                  />
                  <span className="text-slate-400">High C</span>
                  <span className="ml-1 font-mono text-slate-400">
                    C = D⁻/(D⁺+D⁻)
                  </span>
                </div>
              </>
            ) : (
              <div className="mt-2 py-6 text-center text-[11px] text-slate-400">
                No MCDA results yet — adjust weights to compute.
              </div>
            )}
          </div>
        )}

        {activeCriteria.length > 0 && method !== 'TOPSIS' && (
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Current Equation</div>
              <div className="text-[10px] font-semibold text-slate-400">{activeCriteria.length} active criteria</div>
            </div>

            <div className="mt-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-mono text-slate-700">
              {equationText}
            </div>

            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="flex h-full w-full">
                {normalizedActiveWeights.map((c) => (
                  <div
                    key={`stack-${c.id}`}
                    className="h-full"
                    style={{
                      width: `${c.normalizedWeight * 100}%`,
                      backgroundColor: c.color,
                    }}
                    title={`${c.name}: ${(c.normalizedWeight * 100).toFixed(1)}%`}
                  />
                ))}
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {normalizedActiveWeights.map((c, index) => (
                <div key={`eq-${c.id}`} className="flex items-center justify-between gap-2 text-[10px]">
                  <div className="flex min-w-0 items-center gap-1.5 text-slate-600">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="truncate font-semibold">w{index + 1}: {c.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] ${c.polarity === 'benefit' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}
                    >
                      {c.polarity === 'benefit' ? 'Ben' : 'Cost'}
                    </span>
                    <span className="font-mono font-bold text-slate-700">
                      {(c.normalizedWeight * 100).toFixed(1)}%
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
