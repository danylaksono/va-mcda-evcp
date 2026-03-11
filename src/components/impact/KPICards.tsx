import React from 'react'
import type { ImpactEstimate } from '@/analysis/types'
import { formatEnergy, formatCO2, formatCurrency, formatPercent, formatCompact } from '@/utils/format'

interface KPICardsProps {
  impact: ImpactEstimate
}

export function KPICards({ impact }: KPICardsProps) {
  const cards = [
    {
      label: 'Energy Delivered',
      value: formatEnergy(impact.energyDeliveredKWh),
      sublabel: '/year',
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
    },
    {
      label: 'Carbon Saved',
      value: formatCO2(impact.carbonSavedTonnes),
      sublabel: '/year',
      color: 'text-teal-600',
      bg: 'bg-teal-50',
      border: 'border-teal-200',
    },
    {
      label: 'Install Cost',
      value: formatCurrency(impact.installCostGBP),
      sublabel: 'total',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
    },
    {
      label: 'Annual Revenue',
      value: formatCurrency(impact.annualRevenue),
      sublabel: '/year',
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      border: 'border-violet-200',
    },
    {
      label: 'Peak Demand',
      value: `${impact.peakDemandKW.toFixed(0)} kW`,
      sublabel: 'grid load',
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      border: 'border-orange-200',
    },
    {
      label: 'Headroom Impact',
      value: formatPercent(impact.headroomImpactPct),
      sublabel: 'of capacity',
      color: impact.headroomImpactPct > 80 ? 'text-red-600' : 'text-amber-600',
      bg: impact.headroomImpactPct > 80 ? 'bg-red-50' : 'bg-amber-50',
      border: impact.headroomImpactPct > 80 ? 'border-red-200' : 'border-amber-200',
    },
    {
      label: 'Population Served',
      value: formatCompact(impact.populationServed, 0),
      sublabel: 'people',
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      border: 'border-indigo-200',
    },
    {
      label: 'Utilization',
      value: formatPercent(impact.utilizationFactor * 100),
      sublabel: 'avg rate',
      color: 'text-cyan-600',
      bg: 'bg-cyan-50',
      border: 'border-cyan-200',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`p-2.5 rounded-lg border ${card.border} ${card.bg}`}
        >
          <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
            {card.label}
          </div>
          <div className={`text-base font-mono font-bold ${card.color} mt-0.5`}>
            {card.value}
          </div>
          <div className="text-[8px] text-slate-400 font-medium">{card.sublabel}</div>
        </div>
      ))}
    </div>
  )
}
