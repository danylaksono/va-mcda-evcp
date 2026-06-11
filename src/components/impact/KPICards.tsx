import React, { useState, useRef, useEffect } from 'react'
import { Info } from 'lucide-react'
import type { ImpactEstimate } from '@/analysis/types'
import { formatEnergy, formatCO2, formatCurrency, formatPercent, formatCompact } from '@/utils/format'

interface KPICardDef {
  label: string
  value: string
  rawValue: number
  getValue: (impact: ImpactEstimate) => number
  formatValue: (value: number) => string
  sublabel: string
  color: string
  bg: string
  border: string
  info: string
  lowerIsBetter?: boolean
}

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
        className="p-0.5 rounded-full text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
        aria-label="How is this calculated?"
      >
        <Info className="h-3 w-3" strokeWidth={2.2} />
      </button>
      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-52 p-2.5 bg-slate-800 text-white text-[10px] leading-relaxed rounded-lg shadow-lg">
          <div className="font-bold mb-1 text-slate-300 uppercase tracking-wider text-[8px]">
            How it's calculated
          </div>
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-slate-800" />
        </div>
      )}
    </div>
  )
}

interface KPICardsProps {
  impact: ImpactEstimate
  comparison?: {
    label: string
    impact: ImpactEstimate
  }
  primaryLabel?: string
}

function formatSignedDelta(value: number, formatter: (value: number) => string): string {
  if (Math.abs(value) < 0.0001) return 'same'
  return `${value > 0 ? '+' : '-'}${formatter(Math.abs(value))}`
}

function getDeltaColor(delta: number, lowerIsBetter?: boolean): string {
  if (Math.abs(delta) < 0.0001) return 'text-slate-400'
  const isFavourable = lowerIsBetter ? delta < 0 : delta > 0
  return isFavourable ? 'text-emerald-700' : 'text-rose-600'
}

export function KPICards({ impact, comparison, primaryLabel = 'Current draft' }: KPICardsProps) {
  const cards: KPICardDef[] = [
    {
      label: 'Energy Delivered',
      value: formatEnergy(impact.energyDeliveredKWh),
      rawValue: impact.energyDeliveredKWh,
      getValue: (estimate) => estimate.energyDeliveredKWh,
      formatValue: formatEnergy,
      sublabel: '/year',
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      info: 'Annual energy = N chargers × power (kW) × 16 operating hours × utilization factor × 365 days. Utilization is capped at 100% and depends on local demand from EV adoption estimates.',
    },
    {
      label: 'Carbon Saved',
      value: formatCO2(impact.carbonSavedTonnes),
      rawValue: impact.carbonSavedTonnes,
      getValue: (estimate) => estimate.carbonSavedTonnes,
      formatValue: formatCO2,
      sublabel: '/year',
      color: 'text-teal-600',
      bg: 'bg-teal-50',
      border: 'border-teal-200',
      info: 'CO₂ saved = displaced ICE emissions minus EV grid emissions. Uses UK 2024 grid factor (0.233 kg CO₂/kWh) and ICE factor (0.21 kg CO₂/km). EV efficiency assumed at 0.18 kWh/km.',
    },
    {
      label: 'Install Cost',
      value: formatCurrency(impact.installCostGBP),
      rawValue: impact.installCostGBP,
      getValue: (estimate) => estimate.installCostGBP,
      formatValue: formatCurrency,
      sublabel: 'total',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      info: 'Sum of per-unit costs × number of chargers at each site. Costs vary by type: slow £1k, fast £5k, rapid £40k, ultra-rapid £100k per unit.',
      lowerIsBetter: true,
    },
    {
      label: 'Annual Revenue',
      value: formatCurrency(impact.annualRevenue),
      rawValue: impact.annualRevenue,
      getValue: (estimate) => estimate.annualRevenue,
      formatValue: formatCurrency,
      sublabel: '/year',
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      border: 'border-violet-200',
      info: 'Revenue = annual energy delivered × electricity price (£0.35/kWh). This is a gross estimate and does not account for operating costs, maintenance, or network fees.',
    },
    {
      label: 'Peak Demand',
      value: `${impact.peakDemandKW.toFixed(0)} kW`,
      rawValue: impact.peakDemandKW,
      getValue: (estimate) => estimate.peakDemandKW,
      formatValue: (value) => `${value.toFixed(0)} kW`,
      sublabel: 'grid load',
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      info: 'Peak grid load = total chargers × rated power × 0.7 diversity factor. The diversity factor accounts for the fact that not all chargers operate at full power simultaneously.',
      lowerIsBetter: true,
    },
    {
      label: 'Headroom Impact',
      value: formatPercent(impact.headroomImpactPct),
      rawValue: impact.headroomImpactPct,
      getValue: (estimate) => estimate.headroomImpactPct,
      formatValue: (value) => formatPercent(value),
      sublabel: 'of capacity',
      color: impact.headroomImpactPct > 80 ? 'text-red-600' : 'text-amber-600',
      bg: impact.headroomImpactPct > 80 ? 'bg-red-50' : 'bg-amber-50',
      border: impact.headroomImpactPct > 80 ? 'border-red-200' : 'border-amber-200',
      info: 'Headroom = peak demand / estimated local grid capacity. Grid capacity is estimated from the normalised headroom value in the MCDA data (× 5,000 kW). Values above 80% indicate potential grid stress.',
      lowerIsBetter: true,
    },
    {
      label: 'Population Served',
      value: formatCompact(impact.populationServed, 0),
      rawValue: impact.populationServed,
      getValue: (estimate) => estimate.populationServed,
      formatValue: (value) => formatCompact(value, 0),
      sublabel: 'people',
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      border: 'border-indigo-200',
      info: 'Estimated from population density × H3 cell area (0.015 km²) × 7 (cell + 6 neighbours). Represents the approximate number of residents within walking distance of a charger.',
    },
    {
      label: 'Utilization',
      value: formatPercent(impact.utilizationFactor * 100),
      rawValue: impact.utilizationFactor * 100,
      getValue: (estimate) => estimate.utilizationFactor * 100,
      formatValue: (value) => formatPercent(value),
      sublabel: 'avg rate',
      color: 'text-cyan-600',
      bg: 'bg-cyan-50',
      border: 'border-cyan-200',
      info: 'Utilization = min(1, daily demand / daily capacity). Daily demand is derived from local population density, car ownership rates, an assumed 15% EV adoption rate, and 30% daily charging probability.',
    },
  ]

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
          Key Performance Indicators
        </div>
        <div className="truncate text-[9px] text-slate-400">
          {comparison ? `${primaryLabel} vs ${comparison.label}` : primaryLabel}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {cards.map((card) => {
          const baselineValue = comparison ? card.getValue(comparison.impact) : 0
          const delta = comparison ? card.rawValue - baselineValue : 0

          return (
            <div
              key={card.label}
              className={`p-2.5 rounded-xl border ${card.border} ${card.bg}`}
            >
              <div className="flex items-center justify-between">
                <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                  {card.label}
                </div>
                <InfoTooltip text={card.info} />
              </div>
              <div className={`text-base font-mono font-bold ${card.color} mt-0.5 leading-tight`}>
                {card.value}
              </div>
              <div className="text-[8px] text-slate-400 font-medium">{card.sublabel}</div>
              {comparison && (
                <div className="mt-1 flex items-center justify-between gap-1 border-t border-white/70 pt-1 text-[8px]">
                  <span className="truncate text-slate-500">
                    Ref {card.formatValue(baselineValue)}
                  </span>
                  <span className={`font-bold ${getDeltaColor(delta, card.lowerIsBetter)}`}>
                    {formatSignedDelta(delta, card.formatValue)}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
