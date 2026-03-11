import React, { useEffect } from 'react'
import { useScenarioStore } from '@/store/scenario-store'
import { estimateImpact, aggregateImpacts } from '@/analysis/impact-model'
import { CHARGER_SPECS } from '@/analysis/types'
import { KPICards } from './KPICards'

export function ImpactPanel() {
  const currentPlacements = useScenarioStore((s) => s.currentPlacements)
  const currentImpact = useScenarioStore((s) => s.currentImpact)
  const setCurrentImpact = useScenarioStore((s) => s.setCurrentImpact)
  const removePlacement = useScenarioStore((s) => s.removePlacement)

  useEffect(() => {
    if (currentPlacements.length === 0) {
      setCurrentImpact(null)
      return
    }

    // Use placeholder cell data since actual data requires DuckDB query
    const impacts = currentPlacements.map((p) =>
      estimateImpact(p, {
        popDensity: 5000 + Math.random() * 10000,
        carOwnership: 0.4 + Math.random() * 0.3,
        deprivation: Math.random() * 0.6,
        gridCapacity: 0.3 + Math.random() * 0.5,
        existingEVCPDistance: 5 + Math.random() * 15,
      })
    )

    setCurrentImpact(aggregateImpacts(impacts))
  }, [currentPlacements, setCurrentImpact])

  return (
    <div className="p-4 space-y-4">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        Impact Simulation
      </div>

      {currentPlacements.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-3xl mb-2 opacity-30">📍</div>
          <div className="text-xs text-slate-400">
            Click on the map to place EVCP chargers
          </div>
          <div className="text-[10px] text-slate-300 mt-1">
            Impact estimates will appear here
          </div>
        </div>
      ) : (
        <>
          {/* Placement List */}
          <div className="space-y-1.5">
            {currentPlacements.map((p) => (
              <div
                key={p.h3Cell}
                className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100"
              >
                <div>
                  <div className="text-[10px] font-mono text-slate-500 truncate max-w-[180px]">
                    {p.h3Cell}
                  </div>
                  <div className="text-[10px] font-bold text-slate-700">
                    {p.chargerCount} × {CHARGER_SPECS[p.chargerType].label}
                  </div>
                </div>
                <button
                  onClick={() => removePlacement(p.h3Cell)}
                  className="text-slate-400 hover:text-red-500 text-xs font-bold px-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Impact KPIs */}
          {currentImpact && <KPICards impact={currentImpact} />}
        </>
      )}
    </div>
  )
}
