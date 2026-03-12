import React from 'react'
import { Layers3 } from 'lucide-react'
import { useMCDAStore } from '@/store/mcda-store'

export function WeightSummary() {
  const criteria = useMCDAStore((s) => s.criteria)

  const activeCriteria = criteria.filter((c) => c.active)
  const dominantCriterion = [...activeCriteria].sort((a, b) => b.weight - a.weight)[0]

  return (
    <div className="p-4">
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
