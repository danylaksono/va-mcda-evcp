import React from 'react'
import { useMCDAStore } from '@/store/mcda-store'

export function WeightSummary() {
  const criteria = useMCDAStore((s) => s.criteria)
  const resetWeights = useMCDAStore((s) => s.resetWeights)
  const toggleCriterion = useMCDAStore((s) => s.toggleCriterion)

  const activeCriteria = criteria.filter((c) => c.active)
  const totalWeight = activeCriteria.reduce((s, c) => s + c.weight, 0)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Global Weights
          </div>
          <div className="text-xl font-mono font-bold text-brand-600">
            Σw = {totalWeight.toFixed(3)}
          </div>
        </div>
        <button onClick={resetWeights} className="btn-secondary text-[10px] px-3 py-1">
          Reset
        </button>
      </div>

      {/* Mini criterion toggles */}
      <div className="flex flex-wrap gap-1">
        {criteria.map((c) => (
          <button
            key={c.id}
            onClick={() => toggleCriterion(c.id)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold
              transition-all border ${
                c.active
                  ? 'bg-white border-slate-300 text-slate-700'
                  : 'bg-slate-100 border-slate-200 text-slate-400 line-through'
              }`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: c.active ? c.color : '#cbd5e1' }}
            />
            {c.name.split(' ')[0]}
          </button>
        ))}
      </div>
    </div>
  )
}
