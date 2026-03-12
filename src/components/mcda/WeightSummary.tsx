import React from 'react'
import { Layers3, RefreshCcw, Sigma } from 'lucide-react'
import { useMCDAStore } from '@/store/mcda-store'

export function WeightSummary() {
  const criteria = useMCDAStore((s) => s.criteria)
  const resetWeights = useMCDAStore((s) => s.resetWeights)

  const activeCriteria = criteria.filter((c) => c.active)
  const totalWeight = activeCriteria.reduce((s, c) => s + c.weight, 0)
  const dominantCriterion = [...activeCriteria].sort((a, b) => b.weight - a.weight)[0]

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Global Weights
          </div>
          <div className="mt-1 flex items-center gap-2 text-xl font-mono font-bold text-brand-600">
            <Sigma className="h-4 w-4" strokeWidth={2.4} />
            <span>Σw = {totalWeight.toFixed(3)}</span>
          </div>
        </div>
        <button onClick={resetWeights} className="btn-secondary text-[10px] px-3 py-1.5">
          <RefreshCcw className="h-3.5 w-3.5" strokeWidth={2.2} />
          Reset
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <Layers3 className="h-3.5 w-3.5" strokeWidth={2.2} />
            Active Criteria
          </div>
          <div className="mt-1 text-sm font-bold text-slate-700">{activeCriteria.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Dominant Weight
          </div>
          <div className="mt-1 text-sm font-bold text-slate-700">
            {dominantCriterion ? dominantCriterion.name : 'None active'}
          </div>
        </div>
      </div>
    </div>
  )
}
