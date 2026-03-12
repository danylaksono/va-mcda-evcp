import React from 'react'
import { useMCDAStore } from '@/store/mcda-store'

export function MatrixView() {
  const criteria = useMCDAStore((s) => s.criteria)
  const method = useMCDAStore((s) => s.method)
  const ahpMetrics = useMCDAStore((s) => s.ahpMetrics)

  const activeCriteria = criteria.filter((c) => c.active)
  const sortedByWeight = [...activeCriteria].sort((a, b) => b.weight - a.weight)
  const weightSource = ahpMetrics ? 'AHP' : 'Manual / Scenario'

  const methodDescriptions: Record<string, string> = {
    WSM: 'Score = Σ(wᵢ × Sᵢ) — Linear weighted sum of normalized scores',
    WPM: 'Score = Π(Sᵢ^wᵢ) — Weighted product of normalized scores',
    TOPSIS: 'Score = D⁻ / (D⁺ + D⁻) — Distance to ideal/anti-ideal solutions',
  }

  return (
    <div className="space-y-4">
      {/* Method Info */}
      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
          Active Method
        </div>
        <div className="text-sm font-bold text-slate-700">{method}</div>
        <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Weight Source</span>
          <span
            className={`text-[10px] font-bold uppercase tracking-wide ${
              ahpMetrics ? 'text-brand-700' : 'text-slate-600'
            }`}
          >
            {weightSource}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 mt-1 italic font-mono">
          {methodDescriptions[method]}
        </div>
      </div>

      {ahpMetrics && (
        <div className="grid grid-cols-3 gap-2">
          <div
            className={`kpi-card ${
              ahpMetrics.isConsistent
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-amber-200 bg-amber-50'
            }`}
          >
            <div className="kpi-label">AHP CR</div>
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
            <div className="kpi-label">AHP CI</div>
            <div className="text-lg font-mono font-bold">
              {ahpMetrics.consistencyIndex.toFixed(3)}
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">AHP λ max</div>
            <div className="text-lg font-mono font-bold">
              {ahpMetrics.lambdaMax.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* Weight Distribution Matrix */}
      <div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
          Weight Distribution
        </div>
        <div className="space-y-1.5">
          {sortedByWeight.map((criterion, idx) => (
            <div
              key={criterion.id}
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <div className="w-5 text-[10px] font-mono text-slate-400 text-right">
                {idx + 1}
              </div>
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: criterion.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-700 truncate">
                  {criterion.name}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex-1 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${criterion.weight * 100}%`,
                        backgroundColor: criterion.color,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-mono font-bold text-slate-600 w-10 text-right">
                    {(criterion.weight * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Category Breakdown */}
      <div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
          Category Allocation
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(
            activeCriteria.reduce(
              (acc, c) => {
                acc[c.category] = (acc[c.category] || 0) + c.weight
                return acc
              },
              {} as Record<string, number>
            )
          )
            .sort(([, a], [, b]) => b - a)
            .map(([category, weight]) => (
              <div key={category} className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <div className="text-[9px] font-bold text-slate-400 uppercase">{category}</div>
                <div className="text-sm font-mono font-bold text-slate-700">
                  {(weight * 100).toFixed(1)}%
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Sensitivity Indicator */}
      <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
        <div className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-1">
          Weight Entropy
        </div>
        <div className="text-xs text-blue-600">
          {(() => {
            const weights = activeCriteria.map((c) => c.weight)
            const entropy = -weights.reduce((s, w) => {
              if (w <= 0) return s
              return s + w * Math.log2(w)
            }, 0)
            const maxEntropy = Math.log2(weights.length)
            const normalized = maxEntropy > 0 ? entropy / maxEntropy : 0

            if (normalized > 0.9) return 'Weights are nearly equal — low sensitivity to individual criteria'
            if (normalized > 0.7) return 'Moderate weight dispersion — balanced sensitivity'
            return 'High weight concentration — results sensitive to dominant criteria'
          })()}
        </div>
      </div>
    </div>
  )
}
