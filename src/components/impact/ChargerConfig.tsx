import React, { useState } from 'react'
import { useScenarioStore } from '@/store/scenario-store'
import { CHARGER_SPECS } from '@/analysis/types'
import type { ChargerType } from '@/analysis/types'
import { formatCurrency } from '@/utils/format'

interface ChargerConfigProps {
  h3Cell: string
  onClose: () => void
}

export function ChargerConfig({ h3Cell, onClose }: ChargerConfigProps) {
  const [chargerType, setChargerType] = useState<ChargerType>('fast')
  const [chargerCount, setChargerCount] = useState(4)
  const addPlacement = useScenarioStore((s) => s.addPlacement)

  const spec = CHARGER_SPECS[chargerType]
  const totalCost = spec.costGBP * chargerCount

  function handlePlace() {
    addPlacement(h3Cell, chargerType, chargerCount)
    onClose()
  }

  return (
    <div className="panel w-72 shadow-xl">
      <div className="panel-header flex items-center justify-between">
        <h3 className="panel-title">Place EVCP</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 text-lg leading-none"
        >
          ×
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
            H3 Cell
          </div>
          <div className="text-[11px] font-mono text-slate-600 bg-slate-50 px-2 py-1 rounded truncate">
            {h3Cell}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
            Charger Type
          </label>
          <select
            value={chargerType}
            onChange={(e) => setChargerType(e.target.value as ChargerType)}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm
                       focus:ring-2 focus:ring-brand-500 outline-none"
          >
            {Object.values(CHARGER_SPECS).map((s) => (
              <option key={s.type} value={s.type}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
            Number of Chargers
          </label>
          <input
            type="range"
            min={1}
            max={20}
            value={chargerCount}
            onChange={(e) => setChargerCount(parseInt(e.target.value))}
            className="w-full accent-brand-600"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>1</span>
            <span className="font-bold text-slate-700">{chargerCount}</span>
            <span>20</span>
          </div>
        </div>

        <div className="p-2 bg-slate-50 rounded-lg text-[11px] space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Power per unit:</span>
            <span className="font-bold">{spec.powerKW} kW</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Total capacity:</span>
            <span className="font-bold">{spec.powerKW * chargerCount} kW</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Est. cost:</span>
            <span className="font-bold text-brand-600">{formatCurrency(totalCost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Install time:</span>
            <span className="font-bold">{spec.installMonths} months</span>
          </div>
        </div>

        <button onClick={handlePlace} className="btn-primary w-full text-xs">
          Place {chargerCount} × {spec.label.split('(')[0].trim()}
        </button>
      </div>
    </div>
  )
}
