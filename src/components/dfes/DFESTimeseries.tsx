import React, { useEffect, useRef, useMemo, useState } from 'react'
import * as d3 from 'd3'
import { TrendingUp, Search } from 'lucide-react'
import { useDFESStore, type DFESMetric, type DFESSeries } from '@/store/dfes-store'
import { useDFESData } from '@/hooks/useDFESData'

const CHART_MARGIN = { top: 16, right: 20, bottom: 28, left: 48 }
const API_KEY = import.meta.env.VITE_DFES_API_KEY || '7fe348e85bd7f26ab10a115c33d44bb5f3e79946d54886f900782042'
const BASE_URL = 'https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/ukpn-dfes-by-local-authorities/records'
const PATHWAY_COLORS = d3.schemeTableau10

const METRIC_LABELS: Record<DFESMetric, string> = {
  electric_cars: 'Electric Cars & Hybrids',
  electric_vans: 'Electric Vans & Hybrids',
  heat_pumps: 'Domestic Heat Pumps',
  batteries: 'Domestic Batteries (kW)',
}

interface LSOAOption {
  code: string
  name: string
}

interface DFESTimeseriesProps {
  selectedLSOA: string | null
  selectedLSOAName: string | null
}

export function DFESTimeseries({ selectedLSOA: mapSelectedLSOA, selectedLSOAName: mapSelectedLSOAName }: DFESTimeseriesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [lsoaOptions, setLsoaOptions] = useState<LSOAOption[]>([])
  const [componentSelectedLSOA, setComponentSelectedLSOA] = useState<string | null>(null)
  const [componentSelectedLSOAName, setComponentSelectedLSOAName] = useState<string | null>(null)

  const selectedPathway = useDFESStore((s) => s.selectedPathway)
  const selectedMetric = useDFESStore((s) => s.selectedMetric)
  const availablePathways = useDFESStore((s) => s.availablePathways)
  const setSelectedPathway = useDFESStore((s) => s.setSelectedPathway)
  const setSelectedMetric = useDFESStore((s) => s.setSelectedMetric)
  const isLoading = useDFESStore((s) => s.isLoading)
  const error = useDFESStore((s) => s.error)
  const getSeries = useDFESStore((s) => s.getSeries)

  const activeSelectedLSOA = componentSelectedLSOA || mapSelectedLSOA
  const activeSelectedLSOAName = componentSelectedLSOAName || mapSelectedLSOAName

  useDFESData(activeSelectedLSOA ? { level: 'lsoa', code: activeSelectedLSOA } : { level: 'network' })

  const series = useMemo(() => getSeries(), [getSeries, activeSelectedLSOA, selectedPathway, selectedMetric])

  const hasPoints = series.some((s) => s.points.length > 0)
  const isLsoaScoped = Boolean(activeSelectedLSOA)
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
        // Use full-text search via q parameter for flexible searching
        const params = new URLSearchParams({
          'q': searchInput,
          'limit': '50',
          'apikey': API_KEY,
        })

        const response = await fetch(`${BASE_URL}?${params}`)
        if (!response.ok) {
          console.debug('Search failed with status', response.status)
          return
        }

        const json = await response.json()
        const records = json.results || []

        // Extract unique LSOAs
        const uniqueLSOAs = Array.from(
          new Map(records.map((r: any) => [r.lsoa21cd, r])).values()
        ).map((r: any) => ({
          code: r.lsoa21cd,
          name: r.lad22nm,
        }))

        setLsoaOptions(uniqueLSOAs.slice(0, 20))
      } catch (err) {
        // Silently fail for search
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

    d3.select(svgRef.current).selectAll('*').remove()
    d3.select(containerRef.current).selectAll('.dfes-tooltip').remove()

    const xScale = d3
      .scaleLinear()
      .domain(d3.extent(allPoints, (d) => d.year) as [number, number])
      .range([0, width])

    const yScale = d3
      .scaleLinear()
      .domain([0, (d3.max(allPoints, (d) => d.value) as number) || 0])
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

    const svg = d3.select(svgRef.current)
    const g = svg.append('g').attr('transform', `translate(${CHART_MARGIN.left},${CHART_MARGIN.top})`)

    g.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'rgba(255, 255, 255, 0.5)')
      .attr('rx', 4)

    g.append('g')
      .attr('class', 'gridlines')
      .call(d3.axisLeft(yScale).tickSize(-width).tickFormat(() => '').scale(yScale) as any)
      .attr('stroke', 'rgba(0, 0, 0, 0.05)')
      .attr('stroke-dasharray', '4')

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).tickFormat(d3.format('d')))
      .attr('class', 'text-[10px] fill-slate-500')
      .append('text')
      .attr('x', width / 2)
      .attr('y', 24)
      .attr('fill', '#64748b')
      .attr('text-anchor', 'middle')
      .attr('class', 'text-[10px] font-medium')
      .text('Year')

    g.append('g')
      .call(d3.axisLeft(yScale))
      .attr('class', 'text-[10px] fill-slate-500')
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', 0 - CHART_MARGIN.left)
      .attr('x', 0 - height / 2)
      .attr('dy', '1em')
      .attr('fill', '#64748b')
      .attr('text-anchor', 'middle')
      .attr('class', 'text-[10px] font-medium')
      .text(METRIC_LABELS[selectedMetric])

    const seriesGroup = g.selectAll('.series').data(series, (d: any) => d.pathway)
      .join('g')
      .attr('class', 'series')

    seriesGroup
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', (d) => color(d.pathway))
      .attr('stroke-width', 2.5)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('d', (d) => line(d.points) || '')

    seriesGroup
      .selectAll('.data-point')
      .data((d) => d.points.map((p) => ({ ...p, pathway: d.pathway })))
      .join('circle')
      .attr('class', 'data-point')
      .attr('cx', (d) => xScale(d.year))
      .attr('cy', (d) => yScale(d.value))
      .attr('r', 3)
      .attr('fill', (d) => color(d.pathway))
      .attr('stroke', 'white')
      .attr('stroke-width', 1.5)
      .style('opacity', 0.85)

    const tooltip = d3
      .select(containerRef.current)
      .append('div')
      .attr('class', 'dfes-tooltip')
      .style('position', 'absolute')
      .style('background', 'rgba(15, 23, 42, 0.95)')
      .style('color', 'white')
      .style('padding', '6px 10px')
      .style('border-radius', '4px')
      .style('font-size', '10px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', '1000')
      .style('backdrop-filter', 'blur(4px)')

    const years = Array.from(new Set(allPoints.map((p) => p.year))).sort((a, b) => a - b)

    g.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'none')
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
        })

        const x = xScale(nearestYear) + CHART_MARGIN.left
        const y = yScale(d3.max(items.map((i) => i.point.value)) || 0) + CHART_MARGIN.top

        const rows = items
          .map((item) => `<div style="color:${color(item.pathway)}">${item.pathway}: ${item.point.value.toLocaleString()}</div>`)
          .join('')

        tooltip
          .style('opacity', 1)
          .html(`<strong>${nearestYear}</strong><br/>${rows}`)
          .style('left', `${x}px`)
          .style('top', `${y - 32}px`)
      })
      .on('mouseleave', () => {
        tooltip.style('opacity', 0)
      })
  }, [series, selectedMetric])

  return (
    <div className="h-64 bg-white border-t border-slate-200 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">DFES Projections</div>
          <div className="text-xs text-slate-600 truncate flex items-center gap-2">
            {isLsoaScoped ? (activeSelectedLSOAName || activeSelectedLSOA) : 'All UKPN (pathway overview)'}
            {componentSelectedLSOA && (
              <button
                onClick={() => {
                  setComponentSelectedLSOA(null)
                  setComponentSelectedLSOAName(null)
                }}
                className="text-[9px] text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded border border-slate-300 hover:border-slate-500"
              >
                Change
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                id="dfes-search"
                name="dfes-search"
                placeholder={isLsoaScoped ? 'Search to change LSOA...' : 'Search LSOA code or area...'}
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value)
                  setSearchOpen(true)
                }}
                onFocus={() => setSearchOpen(true)}
                className="w-48 sm:w-56 pl-8 pr-3 py-2 text-xs border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>

            {searchOpen && lsoaOptions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded shadow-lg z-10 max-h-48 overflow-y-auto">
                {lsoaOptions.map((option) => (
                  <button
                    key={option.code}
                    onClick={() => {
                      setComponentSelectedLSOA(option.code)
                      setComponentSelectedLSOAName(option.name)
                      setSearchInput('')
                      setSearchOpen(false)
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-100 transition-colors border-b border-slate-100 last:border-b-0"
                  >
                    <div className="font-medium text-slate-700">{option.code}</div>
                    <div className="text-slate-500 text-[9px]">{option.name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <select
            value={selectedPathway || ''}
            onChange={(e) => setSelectedPathway(e.target.value || null)}
            className="text-[10px] px-2 py-1 border border-slate-300 rounded bg-white"
          >
            <option value="">All pathways</option>
            {availablePathways.map((pathway) => (
              <option key={pathway} value={pathway}>
                {pathway}
              </option>
            ))}
          </select>

          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as DFESMetric)}
            className="text-[10px] px-2 py-1 border border-slate-300 rounded bg-white"
          >
            <option value="electric_cars">Electric Cars</option>
            <option value="electric_vans">Electric Vans</option>
            <option value="heat_pumps">Heat Pumps</option>
            <option value="batteries">Batteries</option>
          </select>
        </div>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-xs text-slate-400">Loading data...</div>
        </div>
      )}

      {error && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-xs text-red-500">Error: {error}</div>
        </div>
      )}

      {!isLoading && !error && !hasPoints && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-xs text-slate-400">No data available for this selection</div>
        </div>
      )}

      {!isLoading && !error && hasPoints && (
        <div ref={containerRef} className="flex-1 relative">
          <svg ref={svgRef} className="w-full h-full" />
          <div className="absolute bottom-0 left-0 right-0 px-1 py-1 flex flex-wrap gap-2 text-[10px] text-slate-500">
            {series.map((s) => (
              <span key={s.pathway} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: legendColor(s.pathway) as string }} />
                {s.pathway}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
