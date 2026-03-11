import React, { useState } from 'react'
import { useMCDAStore } from '@/store/mcda-store'
import { ratioToAHPScale } from '@/analysis/ahp-solver'

const AHP_SCALE_LABELS: Record<number, string> = {
  1: 'Equal',
  3: 'Moderate',
  5: 'Strong',
  7: 'Very Strong',
  9: 'Extreme',
}

export function AHPComparison() {
  const criteria = useMCDAStore((s) => s.criteria)
  const comparisons = useMCDAStore((s) => s.comparisons)
  const addComparison = useMCDAStore((s) => s.addComparison)
  const updateComparison = useMCDAStore((s) => s.updateComparison)
  const removeComparison = useMCDAStore((s) => s.removeComparison)
  const clearComparisons = useMCDAStore((s) => s.clearComparisons)
  const applyAHPWeights = useMCDAStore((s) => s.applyAHPWeights)
  const ahpMetrics = useMCDAStore((s) => s.ahpMetrics)

  const [selectedPair, setSelectedPair] = useState<[string, string] | null>(null)

  const activeCriteria = criteria.filter((c) => c.active)

  function handleCellClick(c1: string, c2: string) {
    if (c1 === c2) return
    const existing = comparisons.find(
      (comp) =>
        (comp.criterion1 === c1 && comp.criterion2 === c2) ||
        (comp.criterion1 === c2 && comp.criterion2 === c1)
    )
    if (!existing) {
      addComparison({ criterion1: c1, criterion2: c2, ratio: 1 })
    }
    setSelectedPair([c1, c2])
  }

  function getComparisonValue(c1: string, c2: string): number | null {
    const comp = comparisons.find(
      (c) =>
        (c.criterion1 === c1 && c.criterion2 === c2) ||
        (c.criterion1 === c2 && c.criterion2 === c1)
    )
    if (!comp) return null
    if (comp.criterion1 === c1) return comp.ratio
    return 1 / comp.ratio
  }

  function handleSliderChange(value: number) {
    if (!selectedPair) return
    updateComparison(selectedPair[0], selectedPair[1], value)
  }

  return (
    <div className="space-y-4">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        Pairwise Comparison Matrix
      </div>

      {/* AHP Diagnostics */}
      {ahpMetrics && (
        <div className="grid grid-cols-3 gap-2">
          <div
            className={`kpi-card ${
              ahpMetrics.isConsistent
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-amber-200 bg-amber-50'
            }`}
          >
            <div className="kpi-label">CR</div>
            <div className="text-lg font-mono font-bold">
              {ahpMetrics.consistencyRatio.toFixed(3)}
            </div>
            <div
              className={`text-[9px] font-bold uppercase ${
                ahpMetrics.isConsistent ? 'text-emerald-600' : 'text-amber-600'
              }`}
            >
              {ahpMetrics.isConsistent ? 'Consistent' : 'Inconsistent'}
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Comparisons</div>
            <div className="text-lg font-mono font-bold">{comparisons.length}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">λ max</div>
            <div className="text-lg font-mono font-bold">
              {ahpMetrics.lambdaMax.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* Comparison Matrix */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr>
              <th className="p-1.5 bg-slate-50 border border-slate-200" />
              {activeCriteria.map((c) => (
                <th
                  key={c.id}
                  className="p-1.5 bg-slate-50 border border-slate-200 font-bold"
                  style={{ color: c.color }}
                >
                  {c.name.split(' ')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeCriteria.map((row) => (
              <tr key={row.id}>
                <td
                  className="p-1.5 bg-slate-50 border border-slate-200 font-bold"
                  style={{ color: row.color }}
                >
                  {row.name.split(' ')[0]}
                </td>
                {activeCriteria.map((col) => {
                  const value = row.id === col.id ? 1 : getComparisonValue(row.id, col.id)
                  const isSelected =
                    selectedPair &&
                    ((selectedPair[0] === row.id && selectedPair[1] === col.id) ||
                      (selectedPair[0] === col.id && selectedPair[1] === row.id))

                  return (
                    <td
                      key={col.id}
                      onClick={() => handleCellClick(row.id, col.id)}
                      className={`p-1.5 border border-slate-200 text-center font-mono cursor-pointer transition-colors
                        ${row.id === col.id ? 'bg-slate-100 text-slate-400' : ''}
                        ${isSelected ? 'bg-brand-50 ring-1 ring-brand-400' : 'hover:bg-slate-50'}
                        ${value && value > 1 ? 'text-brand-700 font-bold' : ''}
                        ${value && value < 1 ? 'text-slate-400' : ''}
                      `}
                    >
                      {value !== null ? value.toFixed(2) : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Slider for selected pair */}
      {selectedPair && (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex justify-between text-[10px] font-bold mb-1">
            <span style={{ color: criteria.find((c) => c.id === selectedPair[0])?.color }}>
              {criteria.find((c) => c.id === selectedPair[0])?.name}
            </span>
            <span style={{ color: criteria.find((c) => c.id === selectedPair[1])?.color }}>
              {criteria.find((c) => c.id === selectedPair[1])?.name}
            </span>
          </div>
          <input
            type="range"
            min={1 / 9}
            max={9}
            step={0.1}
            value={getComparisonValue(selectedPair[0], selectedPair[1]) ?? 1}
            onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
            className="w-full accent-brand-600"
          />
          <div className="flex justify-between text-[8px] text-slate-400 mt-1">
            <span>1/9 (Extreme favor →)</span>
            <span>1 (Equal)</span>
            <span>(← Extreme favor) 9</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            applyAHPWeights()
          }}
          className="btn-primary text-xs flex-1"
          disabled={comparisons.length === 0}
        >
          Apply AHP Weights
        </button>
        <button onClick={clearComparisons} className="btn-secondary text-xs">
          Clear
        </button>
      </div>
    </div>
  )
}
