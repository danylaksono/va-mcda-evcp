import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { useMCDAStore } from '@/store/mcda-store'
import { useScenarioStore } from '@/store/scenario-store'
import type { Criterion } from '@/analysis/types'

const MARGIN = { top: 12, right: 20, bottom: 12, left: 130 }
const ROW_HEIGHT = 44
const HANDLE_RADIUS = 7

export function ParallelCoordinates() {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const criteria = useMCDAStore((s) => s.criteria)
  const setWeight = useMCDAStore((s) => s.setWeight)
  const scenarios = useScenarioStore((s) => s.scenarios)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const containerWidth = containerRef.current.getBoundingClientRect().width
    const activeCriteria = criteria.filter((c) => c.active)
    const totalHeight = MARGIN.top + MARGIN.bottom + activeCriteria.length * ROW_HEIGHT
    const trackWidth = containerWidth - MARGIN.left - MARGIN.right

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', containerWidth).attr('height', totalHeight)

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    const yScale = d3
      .scaleBand<string>()
      .domain(activeCriteria.map((c) => c.id))
      .range([0, activeCriteria.length * ROW_HEIGHT])
      .padding(0.2)

    const xScale = d3.scaleLinear().domain([0, 1]).range([0, trackWidth])

    // Grid lines at 25% intervals
    const gridTicks = [0.25, 0.5, 0.75]
    gridTicks.forEach((tick) => {
      g.append('line')
        .attr('x1', xScale(tick))
        .attr('x2', xScale(tick))
        .attr('y1', 0)
        .attr('y2', activeCriteria.length * ROW_HEIGHT)
        .attr('stroke', '#f1f5f9')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '2,3')
    })

    // Draw saved scenario ghost markers
    scenarios.forEach((scenario) => {
      activeCriteria.forEach((c) => {
        const w = scenario.weights[c.id] ?? 0
        const cy = (yScale(c.id) ?? 0) + yScale.bandwidth() / 2
        g.append('circle')
          .attr('cx', xScale(w))
          .attr('cy', cy)
          .attr('r', 3)
          .attr('fill', '#94a3b8')
          .attr('fill-opacity', 0.35)
      })
    })

    // Connect current weights with a polyline
    const linePoints = activeCriteria.map((c) => ({
      x: xScale(c.weight),
      y: (yScale(c.id) ?? 0) + yScale.bandwidth() / 2,
    }))

    if (linePoints.length > 1) {
      const line = d3
        .line<{ x: number; y: number }>()
        .x((d) => d.x)
        .y((d) => d.y)
        .curve(d3.curveMonotoneY)

      g.append('path')
        .datum(linePoints)
        .attr('d', line)
        .attr('fill', 'none')
        .attr('stroke', '#4c6ef5')
        .attr('stroke-width', 1.5)
        .attr('stroke-opacity', 0.35)
    }

    // Draw each criterion row
    const rows = g
      .selectAll('.criterion-row')
      .data(activeCriteria)
      .enter()
      .append('g')
      .attr('transform', (d) => `translate(0, ${yScale(d.id)})`)

    // Track background
    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', yScale.bandwidth() * 0.35)
      .attr('width', trackWidth)
      .attr('height', yScale.bandwidth() * 0.3)
      .attr('rx', 3)
      .attr('fill', '#f1f5f9')

    // Track fill (from 0 to weight)
    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', yScale.bandwidth() * 0.35)
      .attr('width', (d) => xScale(d.weight))
      .attr('height', yScale.bandwidth() * 0.3)
      .attr('rx', 3)
      .attr('fill', (d) => d.color)
      .attr('fill-opacity', 0.25)

    // Active fill bar
    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', yScale.bandwidth() * 0.42)
      .attr('width', (d) => xScale(d.weight))
      .attr('height', yScale.bandwidth() * 0.16)
      .attr('rx', 2)
      .attr('fill', (d) => d.color)
      .attr('fill-opacity', 0.7)

    // Draggable handle
    rows
      .append('circle')
      .attr('cx', (d) => xScale(d.weight))
      .attr('cy', yScale.bandwidth() / 2)
      .attr('r', HANDLE_RADIUS)
      .attr('fill', '#fff')
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', 2.5)
      .attr('cursor', 'ew-resize')
      .style('filter', 'drop-shadow(0 1px 3px rgba(0,0,0,0.15))')
      .call(
        d3.drag<SVGCircleElement, Criterion>().on('drag', function (event, d) {
          const newWeight = Math.max(0, Math.min(1, xScale.invert(event.x)))
          setWeight(d.id, newWeight)
        })
      )

    // Labels (left of track)
    rows
      .append('text')
      .attr('x', -8)
      .attr('y', yScale.bandwidth() / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('class', 'text-[10px] font-semibold fill-slate-700')
      .text((d) => d.name)

    // Color dot next to label
    rows
      .append('circle')
      .attr('cx', -MARGIN.left + 8)
      .attr('cy', yScale.bandwidth() / 2)
      .attr('r', 3.5)
      .attr('fill', (d) => d.color)

    // Weight percentage (right of handle)
    rows
      .append('text')
      .attr('x', (d) => Math.max(xScale(d.weight) + 14, 28))
      .attr('y', yScale.bandwidth() / 2)
      .attr('dominant-baseline', 'middle')
      .attr('class', 'text-[9px] font-mono font-bold fill-slate-400')
      .text((d) => `${(d.weight * 100).toFixed(0)}%`)

    // Top axis ticks
    const topTicks = [0, 0.25, 0.5, 0.75, 1]
    topTicks.forEach((tick) => {
      g.append('text')
        .attr('x', xScale(tick))
        .attr('y', -2)
        .attr('text-anchor', 'middle')
        .attr('class', 'text-[7px] fill-slate-300 font-mono')
        .text(tick === 0 ? '0' : tick === 1 ? '1.0' : tick.toFixed(2))
    })
  }, [criteria, setWeight, scenarios])

  const activeCriteria = criteria.filter((c) => c.active)
  const totalHeight = MARGIN.top + MARGIN.bottom + activeCriteria.length * ROW_HEIGHT

  return (
    <div ref={containerRef} className="w-full">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
        Drag handles to adjust criterion weights
      </div>
      <svg ref={svgRef} className="w-full" style={{ height: totalHeight }} />
    </div>
  )
}
