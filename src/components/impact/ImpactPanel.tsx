import React, { useEffect, useMemo, useState } from 'react'
import { useScenarioStore } from '@/store/scenario-store'
import { estimateImpact, aggregateImpacts } from '@/analysis/impact-model'
import { CHARGER_SPECS } from '@/analysis/types'
import type { PlacementCellData, EVCPPlacement } from '@/analysis/types'
import { KPICards } from './KPICards'
import { KPIRadarChart } from './KPIRadarChart'
import { AlertTriangle, ChevronDown, ChevronRight, MapPin, Trash2, Zap } from 'lucide-react'

function toCellData(data: PlacementCellData) {
  const { raw, normalized } = data
  return {
    popDensity: raw.pop_density ?? 0,
    carOwnership: normalized.car_ownership ?? 0,
    deprivation: raw.deprivation ?? 0,
    gridCapacity: raw.grid_capacity ?? 0,
    existingEVCPDistance: raw.evcp_distance ?? 0,
  }
}

function hasRequiredFields(data: PlacementCellData): boolean {
  return (
    typeof data.raw.pop_density === 'number' &&
    typeof data.raw.grid_capacity === 'number' &&
    (typeof data.normalized.car_ownership === 'number' || typeof data.raw.car_ownership === 'number')
  )
}

function placementLabel(p: EVCPPlacement): { primary: string; secondary?: string } {
  const lsoaName = p.cellData?.metadata?.lsoa21nm
  const lsoaCode = p.cellData?.metadata?.lsoa21cd ?? p.lsoaCode
  const borough = p.cellData?.metadata?.borough_name

  if (lsoaName) {
    return { primary: lsoaName, secondary: borough ?? lsoaCode ?? undefined }
  }
  if (lsoaCode) {
    return { primary: lsoaCode, secondary: borough ?? undefined }
  }
  return { primary: 'Unknown location', secondary: undefined }
}

function LSOABreakdownSection({ computable }: { computable: EVCPPlacement[] }) {
  const [expanded, setExpanded] = useState(false)

  const breakdown = useMemo(() => {
    const groups = new Map<string, { lsoa21nm?: string; borough_name?: string; placements: EVCPPlacement[] }>()
    for (const p of computable) {
      const lsoa = p.cellData?.metadata?.lsoa21cd ?? p.lsoaCode
      if (!lsoa) continue
      const existing = groups.get(lsoa)
      if (existing) {
        existing.placements.push(p)
      } else {
        groups.set(lsoa, {
          lsoa21nm: p.cellData?.metadata?.lsoa21nm,
          borough_name: p.cellData?.metadata?.borough_name,
          placements: [p],
        })
      }
    }
    return Array.from(groups.entries()).map(([code, data]) => ({
      code,
      name: data.lsoa21nm,
      borough: data.borough_name,
      count: data.placements.length,
      totalChargers: data.placements.reduce((s, p) => s + p.chargerCount, 0),
      impact: aggregateImpacts(
        data.placements.map((p) => estimateImpact(p, toCellData(p.cellData!)))
      ),
    }))
  }, [computable])

  if (breakdown.length < 2) return null

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50/80 hover:bg-slate-100 transition-colors"
      >
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Per-LSOA Breakdown ({breakdown.length})
        </span>
        {expanded ? <ChevronDown className="h-3 w-3 text-slate-400" /> : <ChevronRight className="h-3 w-3 text-slate-400" />}
      </button>
      {expanded && (
        <div className="divide-y divide-slate-100">
          {breakdown.map((b) => (
            <div key={b.code} className="px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-slate-700 truncate">
                    {b.name || b.code}
                  </div>
                  {b.name && (
                    <div className="text-[9px] text-slate-400">{b.code}</div>
                  )}
                  {b.borough && <div className="text-[9px] text-slate-400">{b.borough}</div>}
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <div className="text-[10px] font-bold text-slate-600">{b.totalChargers} chargers</div>
                  <div className="text-[9px] text-slate-400">{b.count} site{b.count > 1 ? 's' : ''}</div>
                </div>
              </div>
              <div className="flex gap-3 mt-1 text-[9px] text-slate-500">
                <span>{Math.round(b.impact.energyDeliveredKWh).toLocaleString()} kWh/yr</span>
                <span>{b.impact.carbonSavedTonnes.toFixed(1)} tCO2</span>
                <span>{b.impact.peakDemandKW.toFixed(0)} kW peak</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ImpactPanel() {
  const currentPlacements = useScenarioStore((s) => s.currentPlacements)
  const currentImpact = useScenarioStore((s) => s.currentImpact)
  const scenarios = useScenarioStore((s) => s.scenarios)
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId)
  const setCurrentImpact = useScenarioStore((s) => s.setCurrentImpact)
  const removePlacement = useScenarioStore((s) => s.removePlacement)

  const { computable, missing } = useMemo(() => {
    const computable: EVCPPlacement[] = []
    const missing: EVCPPlacement[] = []
    for (const p of currentPlacements) {
      if (p.cellData && hasRequiredFields(p.cellData)) {
        computable.push(p)
      } else {
        missing.push(p)
      }
    }
    return { computable, missing }
  }, [currentPlacements])

  useEffect(() => {
    if (currentPlacements.length === 0) {
      setCurrentImpact(null)
      return
    }

    if (computable.length === 0) {
      setCurrentImpact(null)
      return
    }

    const impacts = computable.map((p) =>
      estimateImpact(p, toCellData(p.cellData!))
    )

    setCurrentImpact(aggregateImpacts(impacts))
  }, [currentPlacements, computable, setCurrentImpact])

  const totalChargers = currentPlacements.reduce((s, p) => s + p.chargerCount, 0)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <Zap className="h-3.5 w-3.5" strokeWidth={2.2} />
          Impact Simulation
        </div>
        {currentPlacements.length > 0 && (
          <div className="text-[9px] text-slate-400 tabular-nums">
            {currentPlacements.length} site{currentPlacements.length !== 1 ? 's' : ''} · {totalChargers} charger{totalChargers !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {currentPlacements.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl">
          <MapPin className="h-5 w-5 text-slate-300 mx-auto mb-1.5" strokeWidth={1.5} />
          <div className="text-[11px] text-slate-400 font-medium">
            No chargers placed yet
          </div>
          <div className="text-[10px] text-slate-300 mt-0.5">
            Enable simulation mode and click on the map to place EVCP chargers
          </div>
        </div>
      ) : (
        <>
          {missing.length > 0 && (
            <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-[10px] text-amber-700">
                <span className="font-bold">{missing.length}</span> placement{missing.length > 1 ? 's' : ''} missing spatial data
                {computable.length > 0 && ' — excluded from estimates'}
              </div>
            </div>
          )}

          {/* Placement List */}
          <div className="space-y-1">
            {currentPlacements.map((p) => {
              const hasCellData = p.cellData && hasRequiredFields(p.cellData)
              const label = placementLabel(p)
              const spec = CHARGER_SPECS[p.chargerType]
              return (
                <div
                  key={p.h3Cell}
                  className={`group flex items-center gap-2 p-2 rounded-xl border transition-colors ${
                    hasCellData
                      ? 'bg-white border-slate-100 hover:border-slate-200'
                      : 'bg-amber-50/50 border-amber-200/50'
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                      hasCellData ? 'bg-brand-50 text-brand-600' : 'bg-amber-100 text-amber-600'
                    }`}
                  >
                    {p.chargerCount}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-slate-700 truncate">
                      {label.primary}
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] text-slate-400">
                      <span>{spec.label}</span>
                      {label.secondary && (
                        <>
                          <span className="opacity-40">·</span>
                          <span className="truncate">{label.secondary}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removePlacement(p.h3Cell)}
                    className="flex-shrink-0 p-1 rounded-md text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    title="Remove placement"
                  >
                    <Trash2 className="h-3 w-3" strokeWidth={2.2} />
                  </button>
                </div>
              )
            })}
          </div>

          <LSOABreakdownSection computable={computable} />

          {currentImpact && <KPICards impact={currentImpact} />}

          {computable.length > 0 && !currentImpact && (
            <div className="text-center py-3">
              <div className="text-[10px] text-slate-400">Computing impact...</div>
            </div>
          )}
        </>
      )}

      <KPIRadarChart
        currentImpact={currentImpact}
        scenarios={scenarios}
        activeScenarioId={activeScenarioId}
      />
    </div>
  )
}
