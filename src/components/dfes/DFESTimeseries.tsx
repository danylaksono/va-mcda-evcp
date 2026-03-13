import React, { useEffect, useRef, useMemo, useState } from 'react'
import * as d3 from 'd3'
import { TrendingUp, Search, Zap, Leaf } from 'lucide-react'
import { useDFESStore, type DFESMetric, type DFESSeries } from '@/store/dfes-store'
import { useDFESData, type DFESScope } from '@/hooks/useDFESData'
import { useScenarioStore } from '@/store/scenario-store'
import { estimateImpact, aggregateImpacts } from '@/analysis/impact-model'
import type { PlacementCellData, ImpactEstimate } from '@/analysis/types'
import { buildScenarioRenderList, type ScenarioRenderInfo } from '@/scenarios/scenario-styles'

const CHART_MARGIN = { top: 20, right: 30, bottom: 40, left: 60 }
const API_KEY = import.meta.env.VITE_DFES_API_KEY || '7fe348e85bd7f26ab10a115c33d44bb5f3e79946d54886f900782042'
const BASE_URL = 'https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/ukpn-dfes-by-local-authorities/records'
const PATHWAY_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

function toCellData(data: PlacementCellData) {
  const { raw, normalized } = data
  return {
    popDensity: raw.pop_density ?? 0,
    carOwnership: normalized.car_ownership ?? 0,
    deprivation: raw.deprivation ?? 0,
    gridCapacity: raw.grid_capacity ?? 0,
    existingEVCPDistance: raw.evcp_distance ?? 0,
  }
}

const METRIC_LABELS: Record<DFESMetric, string> = {
  electric_cars: 'Electric Cars & Hybrids',
  electric_vans: 'Electric Vans & Hybrids',
  heat_pumps: 'Domestic Heat Pumps',
  batteries: 'Domestic Batteries (kW)',
}

type DFESScopeLevel = 'network' | 'lsoa' | 'borough'

const SCOPE_LABELS: Record<DFESScopeLevel, string> = {
  network: 'All UKPN',
  lsoa: 'LSOA',
  borough: 'Borough',
}

const AVG_ANNUAL_HEAT_PUMP_KWH = 4000
const AVG_DOMESTIC_BATTERY_KW = 4
const EV_KWH_PER_UNIT = 2500

function impactToMetricValue(impact: ImpactEstimate, metric: DFESMetric): number {
  switch (metric) {
    case 'electric_cars':
    case 'electric_vans':
      return impact.energyDeliveredKWh / EV_KWH_PER_UNIT
    case 'heat_pumps':
      return impact.energyDeliveredKWh / AVG_ANNUAL_HEAT_PUMP_KWH
    case 'batteries':
      return impact.peakDemandKW / AVG_DOMESTIC_BATTERY_KW
  }
}

function metricCapLabel(metric: DFESMetric): string {
  switch (metric) {
    case 'electric_cars':
    case 'electric_vans':
      return 'EVs supportable'
    case 'heat_pumps':
      return 'Heat pumps eq.'
    case 'batteries':
      return 'Battery eq.'
  }
}

interface LSOAOption {
  code: string
  name: string
}

interface DFESTimeseriesProps {
  selectedLSOA: string | null
  selectedLSOAName: string | null
  selectedBoroughName: string | null
}

export function DFESTimeseries({ selectedLSOA: mapSelectedLSOA, selectedLSOAName: mapSelectedLSOAName, selectedBoroughName: mapSelectedBoroughName }: DFESTimeseriesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [lsoaOptions, setLsoaOptions] = useState<LSOAOption[]>([])
  const [componentSelectedLSOA, setComponentSelectedLSOA] = useState<string | null>(null)
  const [componentSelectedLSOAName, setComponentSelectedLSOAName] = useState<string | null>(null)
  const [scopeLevel, setScopeLevel] = useState<DFESScopeLevel>('network')

  const selectedPathway = useDFESStore((s) => s.selectedPathway)
  const selectedMetric = useDFESStore((s) => s.selectedMetric)
  const availablePathways = useDFESStore((s) => s.availablePathways)
  const allSeries = useDFESStore((s) => s.series)
  const setSelectedPathway = useDFESStore((s) => s.setSelectedPathway)
  const setSelectedMetric = useDFESStore((s) => s.setSelectedMetric)
  const isLoading = useDFESStore((s) => s.isLoading)
  const error = useDFESStore((s) => s.error)
  const getSeries = useDFESStore((s) => s.getSeries)

  const activeSelectedLSOA = componentSelectedLSOA || mapSelectedLSOA
  const activeSelectedLSOAName = componentSelectedLSOAName || mapSelectedLSOAName
  const activeBoroughName = mapSelectedBoroughName

  const currentPlacements = useScenarioStore((s) => s.currentPlacements)
  const baseImpact = useScenarioStore((s) => s.currentImpact)
  const isSimulationMode = useScenarioStore((s) => s.isSimulationMode)
  const scenarios = useScenarioStore((s) => s.scenarios)
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

  const scenarioSupplyLines = useMemo(() => {
    return scenarioRenderList
      .map((info) => {
        const scenario = scenarios.find((s) => s.id === info.id)
        if (!scenario?.impactSummary) return null
        return { info, impact: scenario.impactSummary, name: scenario.name }
      })
      .filter(Boolean) as Array<{ info: ScenarioRenderInfo; impact: ImpactEstimate; name: string }>
  }, [scenarioRenderList, scenarios])

  useEffect(() => {
    if (activeSelectedLSOA && activeBoroughName) {
      setScopeLevel('lsoa')
    } else if (activeBoroughName) {
      setScopeLevel('borough')
    } else {
      setScopeLevel('network')
    }
  }, [activeSelectedLSOA, activeBoroughName])

  const dfesScope: DFESScope = useMemo(() => {
    if (scopeLevel === 'lsoa' && activeSelectedLSOA) return { level: 'lsoa', code: activeSelectedLSOA }
    if (scopeLevel === 'borough' && activeBoroughName) return { level: 'borough', code: activeBoroughName }
    return { level: 'network' }
  }, [scopeLevel, activeSelectedLSOA, activeBoroughName])

  useDFESData(dfesScope)

  const series = useMemo(() => getSeries(), [getSeries, allSeries, dfesScope, selectedPathway, selectedMetric])
  const hasPoints = series.some((s) => s.points.length > 0)

  const availableScopes = useMemo(() => {
    const scopes: DFESScopeLevel[] = ['network']
    if (activeBoroughName) scopes.push('borough')
    if (activeSelectedLSOA) scopes.push('lsoa')
    return scopes
  }, [activeSelectedLSOA, activeBoroughName])

  const currentImpact = useMemo(() => {
    if (scopeLevel === 'network') return baseImpact

    if (scopeLevel === 'lsoa' && activeSelectedLSOA) {
      const localPlacements = currentPlacements.filter(
        (p) => p.lsoaCode === activeSelectedLSOA && p.cellData
      )
      if (localPlacements.length === 0) return null
      const impacts = localPlacements.map((p) =>
        estimateImpact(p, toCellData(p.cellData!))
      )
      return aggregateImpacts(impacts)
    }

    if (scopeLevel === 'borough' && activeBoroughName) {
      const boroughPlacements = currentPlacements.filter(
        (p) => p.cellData?.metadata?.borough_name === activeBoroughName && p.cellData
      )
      if (boroughPlacements.length === 0) return null
      const impacts = boroughPlacements.map((p) =>
        estimateImpact(p, toCellData(p.cellData!))
      )
      return aggregateImpacts(impacts)
    }

    return baseImpact
  }, [scopeLevel, activeSelectedLSOA, activeBoroughName, currentPlacements, baseImpact])
  const legendColor = useMemo(
    () => d3.scaleOrdinal<string, string>().domain(availablePathways).range(PATHWAY_COLORS),
    [availablePathways]
  )

  // Search for available LSOAs
  useEffect(() => {
    if (!searchInput || searchInput.length < 1 || !API_KEY) {
      setLsoaOptions([])
      return
    }

    const searchLSOAs = async () => {
      try {
        const params = new URLSearchParams({
          'q': searchInput,
          'limit': '50',
          'apikey': API_KEY,
        })

        const response = await fetch(`${BASE_URL}?${params}`)
        if (!response.ok) return

        const json = await response.json()
        const records = json.results || []

        const uniqueLSOAs = Array.from(
          new Map(records.map((r: any) => [r.lsoa21cd, r])).values()
        ).map((r: any) => ({
          code: r.lsoa21cd,
          name: r.lad22nm,
        }))

        setLsoaOptions(uniqueLSOAs.slice(0, 20))
      } catch (err) {
        console.debug('Search error:', err)
      }
    }

    const timer = setTimeout(searchLSOAs, 300)
    return () => clearTimeout(timer)
  }, [searchInput])


  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const allPoints = series.flatMap((s) => s.points)
    if (allPoints.length === 0) return

    const container = containerRef.current
    const width = container.clientWidth - CHART_MARGIN.left - CHART_MARGIN.right
    const height = container.clientHeight - CHART_MARGIN.top - CHART_MARGIN.bottom

    if (width <= 0 || height <= 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    d3.select(containerRef.current).selectAll('.dfes-tooltip').remove()

    const xScale = d3
      .scaleLinear()
      .domain(d3.extent(allPoints, (d) => d.year) as [number, number])
      .range([0, width])

    const yScale = d3
      .scaleLinear()
      .domain([0, (d3.max(allPoints, (d) => d.value) as number) * 1.1 || 0])
      .range([height, 0])
      .nice()

    const color = d3
      .scaleOrdinal<string, string>()
      .domain(series.map((s) => s.pathway))
      .range(PATHWAY_COLORS)

    const line = d3
      .line<DFESSeries['points'][number]>()
      .x((d) => xScale(d.year))
      .y((d) => yScale(d.value))
      .curve(d3.curveMonotoneX)

    const g = svg.append('g').attr('transform', `translate(${CHART_MARGIN.left},${CHART_MARGIN.top})`)

    // Background and selection highlight area
    g.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'rgba(248, 250, 252, 0.5)')
      .attr('rx', 8)

    // Improved Gridlines
    g.append('g')
      .attr('class', 'gridlines')
      .call(d3.axisLeft(yScale).tickSize(-width).tickFormat(() => '') as any)
      .attr('stroke', 'rgba(148, 163, 184, 0.1)')
      .attr('stroke-dasharray', '3,3')

    // X Axis
    const xAxis = g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(10).tickFormat(d3.format('d')).tickSize(8))

    xAxis.selectAll('text').attr('class', 'text-[11px] fill-slate-500 font-medium pt-2')
    xAxis.select('.domain').attr('stroke', '#cbd5e1').attr('stroke-width', 1)
    xAxis.selectAll('.tick line').attr('stroke', '#cbd5e1')

    // Y Axis
    const yAxis = g.append('g')
      .call(d3.axisLeft(yScale).ticks(6).tickFormat(d3.format('.2s')).tickSize(8))

    yAxis.selectAll('text').attr('class', 'text-[11px] fill-slate-500 font-medium pr-2')
    yAxis.select('.domain').attr('stroke', '#cbd5e1').attr('stroke-width', 1)
    yAxis.selectAll('.tick line').attr('stroke', '#cbd5e1')

    // Axis Labels
    g.append('text')
      .attr('x', width / 2)
      .attr('y', height + 35)
      .attr('fill', '#94a3b8')
      .attr('text-anchor', 'middle')
      .attr('class', 'text-[10px] uppercase font-bold tracking-wider')
      .text('Projections Year')

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -CHART_MARGIN.left + 15)
      .attr('x', -height / 2)
      .attr('fill', '#94a3b8')
      .attr('text-anchor', 'middle')
      .attr('class', 'text-[10px] uppercase font-bold tracking-wider')
      .text(METRIC_LABELS[selectedMetric])

    // Series paths
    const seriesGroup = g.selectAll('.series').data(series, (d: any) => d.pathway)
      .join('g')
      .attr('class', 'series')

    // Glow effect for lines
    const filter = svg.append('defs')
      .append('filter')
      .attr('id', 'glow')
      .attr('x', '-20%')
      .attr('y', '-20%')
      .attr('width', '140%')
      .attr('height', '140%')

    filter.append('feGaussianBlur')
      .attr('stdDeviation', '2.5')
      .attr('result', 'coloredBlur')

    const feMerge = filter.append('feMerge')
    feMerge.append('feMergeNode').attr('in', 'coloredBlur')
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic')

    seriesGroup
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', (d) => color(d.pathway))
      .attr('stroke-width', 3)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('d', (d) => line(d.points) || '')
      .style('opacity', 0.8)

    // Overlay vertical line guide
    const guide = g.append('line')
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,4')
      .attr('y1', 0)
      .attr('y2', height)
      .style('opacity', 0)

    const tooltip = d3
      .select(containerRef.current)
      .append('div')
      .attr('class', 'dfes-tooltip')
      .style('position', 'absolute')
      .style('background', 'white')
      .style('border', '1px solid #e2e8f0')
      .style('box-shadow', '0 4px 12px rgba(0,0,0,0.1)')
      .style('color', '#1e293b')
      .style('padding', '10px 14px')
      .style('border-radius', '12px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', '1000')
      .style('transition', 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)')

    const years = Array.from(new Set(allPoints.map((p) => p.year))).sort((a, b) => a - b)

    // Saved scenario supply lines (behind draft)
    scenarioSupplyLines.forEach(({ info, impact, name }) => {
      const val = impactToMetricValue(impact, selectedMetric)
      const sy = yScale(val)
      if (sy < -20 || sy > height + 20) return

      const scenG = g.append('g').attr('class', 'scenario-supply-overlay')

      scenG.append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', sy)
        .attr('y2', sy)
        .attr('stroke', info.style.stroke)
        .attr('stroke-width', info.style.strokeWidth * 0.6)
        .attr('stroke-dasharray', info.mode === 'muted' ? '4,4' : '6,3')
        .style('opacity', info.style.opacity)

      if (info.mode === 'highlighted') {
        const lbl = name.length > 16 ? name.slice(0, 14) + '..' : name
        const lw = Math.max(60, lbl.length * 5.5 + 14)
        scenG.append('rect')
          .attr('x', 4)
          .attr('y', sy - 14)
          .attr('width', lw)
          .attr('height', 14)
          .attr('fill', info.style.stroke)
          .attr('rx', 3)
          .style('opacity', 0.75)
        scenG.append('text')
          .attr('x', 4 + lw / 2)
          .attr('y', sy - 4)
          .attr('text-anchor', 'middle')
          .attr('fill', 'white')
          .attr('class', 'text-[8px] font-bold')
          .text(lbl)
      }
    })

    // Simulation Impact Overlay (all metrics)
    if (currentImpact) {
      const supplyValue = impactToMetricValue(currentImpact, selectedMetric)
      const supplyY = yScale(supplyValue)

      if (supplyY >= -20 && supplyY <= height + 20) {
        const impactG = g.append('g').attr('class', 'impact-overlay')

        // Clip regions for shaded areas
        const clipId = `clip-supply-${Date.now()}`
        const defs = svg.select('defs').empty() ? svg.append('defs') : svg.select('defs')

        defs.append('clipPath').attr('id', `${clipId}-below`)
          .append('rect')
          .attr('x', 0)
          .attr('y', Math.max(0, supplyY))
          .attr('width', width)
          .attr('height', Math.max(0, height - supplyY))

        defs.append('clipPath').attr('id', `${clipId}-above`)
          .append('rect')
          .attr('x', 0)
          .attr('y', 0)
          .attr('width', width)
          .attr('height', Math.max(0, supplyY))

        const areaGen = d3
          .area<DFESSeries['points'][number]>()
          .x((d) => xScale(d.year))
          .y0(Math.min(Math.max(supplyY, 0), height))
          .y1((d) => yScale(d.value))
          .curve(d3.curveMonotoneX)

        series.forEach((s) => {
          // Green: demand met (demand below supply line)
          impactG.append('path')
            .datum(s.points)
            .attr('clip-path', `url(#${clipId}-below)`)
            .attr('fill', 'rgba(34, 197, 94, 0.12)')
            .attr('d', areaGen)

          // Red: unmet demand (demand above supply line)
          impactG.append('path')
            .datum(s.points)
            .attr('clip-path', `url(#${clipId}-above)`)
            .attr('fill', 'rgba(239, 68, 68, 0.12)')
            .attr('d', areaGen)
        })

        // Supply line
        impactG.append('line')
          .attr('x1', 0)
          .attr('x2', width)
          .attr('y1', supplyY)
          .attr('y2', supplyY)
          .attr('stroke', '#f97316')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '8,4')
          .style('opacity', 0.8)

        // Label
        const labelText = `${metricCapLabel(selectedMetric).toUpperCase()}: ${Math.round(supplyValue).toLocaleString()}`
        const labelW = Math.max(120, labelText.length * 6.5 + 20)
        impactG.append('rect')
          .attr('x', width - labelW)
          .attr('y', supplyY - 24)
          .attr('width', labelW)
          .attr('height', 20)
          .attr('fill', '#f97316')
          .attr('rx', 4)

        impactG.append('text')
          .attr('x', width - labelW / 2)
          .attr('y', supplyY - 10)
          .attr('text-anchor', 'middle')
          .attr('fill', 'white')
          .attr('class', 'text-[10px] font-bold')
          .text(labelText)

        // Year of constriction intersections
        const intersections: Array<{ pathway: string; year: number; x: number; y: number; color: string }> = []

        series.forEach((s) => {
          for (let i = 0; i < s.points.length - 1; i++) {
            const p1 = s.points[i]
            const p2 = s.points[i + 1]
            if (p1.value <= supplyValue && p2.value >= supplyValue && p1.value !== p2.value) {
              const fraction = (supplyValue - p1.value) / (p2.value - p1.value)
              const intersectYear = p1.year + fraction * (p2.year - p1.year)

              if (intersectYear >= years[0] && intersectYear <= years[years.length - 1]) {
                intersections.push({
                  pathway: s.pathway,
                  year: intersectYear,
                  x: xScale(intersectYear),
                  y: supplyY,
                  color: color(s.pathway),
                })
              }
              break
            }
          }
        })

        let lastX = -999
        let stackLevel = 0

        intersections.sort((a, b) => a.x - b.x).forEach((ix) => {
          impactG.append('line')
            .attr('x1', ix.x)
            .attr('x2', ix.x)
            .attr('y1', ix.y)
            .attr('y2', height)
            .attr('stroke', ix.color)
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '4,4')
            .style('opacity', 0.7)

          impactG.append('circle')
            .attr('cx', ix.x)
            .attr('cy', ix.y)
            .attr('r', 5)
            .attr('fill', 'white')
            .attr('stroke', ix.color)
            .attr('stroke-width', 2.5)
            .style('cursor', 'help')
            .append('title')
            .text(`${ix.pathway}\nCapacity exceeded in ${Math.round(ix.year)}`)

          const labelW = 34
          const labelH = 16

          if (Math.abs(ix.x - lastX) < labelW + 2) {
            stackLevel++
          } else {
            stackLevel = 0
          }
          lastX = ix.x

          const yOffset = height + 2 + stackLevel * 18

          const gbox = impactG.append('g').attr('transform', `translate(${ix.x - labelW / 2}, ${yOffset})`)

          gbox.append('rect')
            .attr('width', labelW)
            .attr('height', labelH)
            .attr('fill', 'white')
            .attr('stroke', ix.color)
            .attr('stroke-width', 1)
            .attr('rx', 3)

          gbox.append('text')
            .attr('x', labelW / 2)
            .attr('y', 11)
            .attr('text-anchor', 'middle')
            .attr('fill', ix.color)
            .attr('class', 'text-[9px] font-bold tracking-tighter')
            .text(Math.round(ix.year).toString())
        })
      }
    }

    // Interaction overlay
    g.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'transparent')
      .attr('pointer-events', 'all')
      .on('mousemove', function (event) {
        const [mouseX] = d3.pointer(event)
        const yearValue = xScale.invert(mouseX)
        const nearestYear = years.reduce((prev, curr) =>
          Math.abs(curr - yearValue) < Math.abs(prev - yearValue) ? curr : prev
          , years[0])

        const items = series.map((s) => {
          const point = s.points.reduce((prev, curr) =>
            Math.abs(curr.year - nearestYear) < Math.abs(prev.year - nearestYear) ? curr : prev
          )
          return { pathway: s.pathway, point }
        }).sort((a, b) => b.point.value - a.point.value)

        const xPos = xScale(nearestYear)
        guide.attr('x1', xPos).attr('x2', xPos).style('opacity', 1)

        const containerBounds = containerRef.current?.getBoundingClientRect()
        const xTranslate = xPos + CHART_MARGIN.left
        const tooltipX = xTranslate > width / 2 ? xTranslate - 180 : xTranslate + 20

        const rows = items
          .map((item) => `
            <div class="flex items-center justify-between gap-6 py-1 border-b border-slate-50 last:border-0">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full" style="background:${color(item.pathway)}"></span>
                <span class="font-medium text-slate-600">${item.pathway}</span>
              </div>
              <span class="font-mono font-bold text-slate-900">${item.point.value.toLocaleString()}</span>
            </div>
          `)
          .join('')

        tooltip
          .style('opacity', 1)
          .html(`
            <div class="font-bold text-slate-400 text-[10px] uppercase mb-2 tracking-widest">${nearestYear} PROJECTIONS</div>
            <div class="flex flex-col">${rows}</div>
          `)
          .style('left', `${tooltipX}px`)
          .style('top', `20px`)

        // Highlight corresponding circles
        g.selectAll('.hover-point').remove()
        items.forEach(item => {
          g.append('circle')
            .attr('class', 'hover-point')
            .attr('cx', xScale(item.point.year))
            .attr('cy', yScale(item.point.value))
            .attr('r', 5)
            .attr('fill', color(item.pathway))
            .attr('stroke', 'white')
            .attr('stroke-width', 2)
            .attr('pointer-events', 'none')
        })
      })
      .on('mouseleave', () => {
        tooltip.style('opacity', 0)
        guide.style('opacity', 0)
        g.selectAll('.hover-point').remove()
      })
  }, [series, selectedMetric, currentImpact])

  return (
    <div className="bg-white border-t border-slate-200 p-4 flex flex-col gap-4 shadow-sm overflow-visible">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">DFES Projections</div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 leading-tight">
              {scopeLevel === 'lsoa' && (activeSelectedLSOAName || activeSelectedLSOA)}
              {scopeLevel === 'borough' && activeBoroughName}
              {scopeLevel === 'network' && 'Greater London Area'}
              <span className="text-slate-300 font-light ml-1 text-sm">Pathways Overview</span>
              {componentSelectedLSOA && (
                <button
                  onClick={() => {
                    setComponentSelectedLSOA(null)
                    setComponentSelectedLSOAName(null)
                    setScopeLevel('network')
                  }}
                  className="text-[10px] font-bold text-blue-500 hover:text-blue-700 uppercase tracking-wider pl-2"
                >
                  Reset to Network
                </button>
              )}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {isSimulationMode && currentImpact && (
            <div className="hidden lg:flex items-center gap-4 px-4 py-2 bg-orange-50/50 rounded-2xl border border-orange-100/50 backdrop-blur-sm animate-in fade-in zoom-in duration-500">
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-orange-400 uppercase tracking-[0.2em] mb-0.5">
                  {scopeLevel === 'borough' && activeBoroughName ? `${activeBoroughName} Impact` : scopeLevel === 'lsoa' ? 'LSOA Impact' : 'Scenario Impact'}
                </span>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                      <Zap className="h-3 w-3" />
                    </div>
                    <span className="text-xs font-bold text-slate-700 leading-none">{Math.round(currentImpact.energyDeliveredKWh).toLocaleString()} <span className="text-[9px] text-slate-400 font-medium tracking-normal">kWh/yr</span></span>
                  </div>
                  <div className="w-[1px] h-4 bg-orange-200/50" />
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                      <Leaf className="h-3 w-3" />
                    </div>
                    <span className="text-xs font-bold text-slate-700 leading-none">{currentImpact.carbonSavedTonnes.toFixed(1)} <span className="text-[9px] text-slate-400 font-medium tracking-normal">tCO2e</span></span>
                  </div>
                  <div className="w-[1px] h-4 bg-orange-200/50" />
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 leading-none">{Math.round(impactToMetricValue(currentImpact, selectedMetric)).toLocaleString()} <span className="text-[9px] text-slate-400 font-medium tracking-normal">{metricCapLabel(selectedMetric)}</span></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className="relative group">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input
                  type="text"
                  id="dfes-search"
                  name="dfes-search"
                  placeholder="Search LSOA code or area..."
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value)
                    setSearchOpen(true)
                  }}
                  onFocus={() => setSearchOpen(true)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                />
              </div>

              {searchOpen && lsoaOptions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-200">
                  {lsoaOptions.map((option) => (
                    <button
                      key={option.code}
                      onClick={() => {
                        setComponentSelectedLSOA(option.code)
                        setComponentSelectedLSOAName(option.name)
                        setSearchInput('')
                        setSearchOpen(false)
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0 group/item"
                    >
                      <div className="font-bold text-slate-800 text-sm group-hover/item:text-blue-600 transition-colors">{option.code}</div>
                      <div className="text-slate-500 text-xs font-medium">{option.name}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {availableScopes.length > 1 && (
              <>
                <div className="h-10 w-[1px] bg-slate-200 mx-1 hidden sm:block"></div>
                <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden">
                  {availableScopes.map((s) => (
                    <button
                      key={s}
                      onClick={() => setScopeLevel(s)}
                      className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        scopeLevel === s
                          ? 'bg-blue-500 text-white'
                          : 'bg-white text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {SCOPE_LABELS[s]}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="h-10 w-[1px] bg-slate-200 mx-1 hidden sm:block"></div>

            <select
              value={selectedPathway || ''}
              onChange={(e) => setSelectedPathway(e.target.value || null)}
              className="h-10 px-4 text-sm font-semibold border border-slate-200 rounded-xl bg-slate-50/50 hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer text-slate-700"
            >
              <option value="">All Pathways</option>
              {availablePathways.map((pathway) => (
                <option key={pathway} value={pathway}>
                  {pathway}
                </option>
              ))}
            </select>

            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value as DFESMetric)}
              className="h-10 px-4 text-sm font-semibold border border-slate-200 rounded-xl bg-slate-50/50 hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer text-slate-700"
            >
              <option value="electric_cars">Electric Cars</option>
              <option value="electric_vans">Electric Vans</option>
              <option value="heat_pumps">Heat Pumps</option>
              <option value="batteries">Batteries</option>
            </select>
          </div>
        </div>
      </div>

      <div className="relative min-h-[320px] bg-slate-50/30 rounded-2xl border border-slate-100 p-4 transition-all overflow-hidden flex flex-col">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[2px] z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
              <div className="text-sm font-bold text-slate-500 tracking-wider">LOADING DATA</div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-red-50 text-red-600 px-6 py-4 rounded-2xl border border-red-100 flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <span className="text-sm font-semibold">Error: {error}</span>
            </div>
          </div>
        )}

        {!isLoading && !error && !hasPoints && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-2">📊</div>
              <div className="text-sm font-bold text-slate-400 uppercase tracking-widest">No data available for this selection</div>
            </div>
          </div>
        )}

        {!isLoading && !error && hasPoints && (
          <>
            <div ref={containerRef} className="flex-1 relative mb-6">
              <svg ref={svgRef} className="w-full h-full" />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 py-3 border-t border-slate-100 bg-white/50 rounded-b-2xl">
              {/* Use all available series for the legend, not just the filtered selection */}
              {allSeries.map((s) => (
                <button
                  key={s.pathway}
                  onClick={() => setSelectedPathway(selectedPathway === s.pathway ? null : s.pathway)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${selectedPathway === s.pathway
                    ? 'bg-white border-blue-200 shadow-md scale-105'
                    : 'bg-white/50 border-transparent hover:border-slate-200 opacity-70 hover:opacity-100'
                    }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full shadow-sm" style={{ background: legendColor(s.pathway) as string }} />
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${selectedPathway === s.pathway ? 'text-slate-900' : 'text-slate-500'}`}>
                    {s.pathway}
                  </span>
                </button>
              ))}
              {selectedPathway && (
                <button
                  onClick={() => setSelectedPathway(null)}
                  className="text-[10px] font-bold text-blue-500 hover:text-blue-700 uppercase tracking-wider px-3"
                >
                  Show All
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
