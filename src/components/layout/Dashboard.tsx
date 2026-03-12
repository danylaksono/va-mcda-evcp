import React, { useState } from 'react'
import { Scale, SlidersHorizontal, TableProperties } from 'lucide-react'
import { Header } from './Header'
import { MapView } from '../map/MapView'
import { ParallelCoordinates } from '../mcda/ParallelCoordinates'
import { AHPComparison } from '../mcda/AHPComparison'
import { MatrixView } from '../mcda/MatrixView'
import { WeightSummary } from '../mcda/WeightSummary'
import { ImpactPanel } from '../impact/ImpactPanel'
import { ScenarioManager } from '../scenarios/ScenarioManager'
import { useMCDAStore } from '@/store/mcda-store'

type TabId = 'pcp' | 'ahp' | 'matrix'

interface DashboardProps {
  totalRows: number
  mcdaResults: Array<{
    h3_cell: string
    mcda_score: number
    criterion_values?: Record<string, number>
    raw_values?: Record<string, number>
  }>
}

export function Dashboard({ totalRows, mcdaResults }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('pcp')
  const computeTime = useMCDAStore((s) => s.lastComputeTime)

  const tabs: {
    id: TabId
    label: string
    detail: string
    icon: typeof SlidersHorizontal
  }[] = [
    { id: 'pcp', label: 'Weight Lab', detail: 'Method, criteria, scenarios', icon: SlidersHorizontal },
    { id: 'ahp', label: 'Pairwise AHP', detail: 'Refine relative importance', icon: Scale },
    { id: 'matrix', label: 'Diagnostics', detail: 'Inspect allocation patterns', icon: TableProperties },
  ]

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      <Header totalRows={totalRows} computeTime={computeTime} />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: MCDA Controls */}
        <div className="w-[500px] min-w-[420px] flex flex-col border-r border-slate-200 bg-white overflow-y-auto">
          {/* Tab Navigation */}
          <div className="grid grid-cols-3 gap-2 border-b border-slate-200 p-4 bg-slate-50/70">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-2xl border px-3 py-3 text-left transition-all
                  ${
                    activeTab === tab.id
                      ? 'border-brand-200 bg-white text-brand-700 shadow-sm'
                      : 'border-transparent bg-white/60 text-slate-500 hover:border-slate-200 hover:text-slate-700'
                  }`}
              >
                <tab.icon className="mb-2 h-4 w-4" strokeWidth={2.2} />
                <div className="text-[11px] font-bold uppercase tracking-[0.16em]">{tab.label}</div>
                <div className="mt-1 text-[10px] text-slate-400 normal-case tracking-normal">
                  {tab.detail}
                </div>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'pcp' && <ParallelCoordinates />}
            {activeTab === 'ahp' && <AHPComparison />}
            {activeTab === 'matrix' && <MatrixView />}
          </div>

          {/* Weight Summary */}
          {/* Not needed */}
          {/* <div className="border-t border-slate-200">
            <WeightSummary />
          </div> */}
        </div>

        {/* Center: Map */}
        <div className="flex-1 flex flex-col">
          <MapView mcdaResults={mcdaResults} />
        </div>

        {/* Right Panel: Impact & Scenarios */}
        <div className="w-[340px] flex flex-col border-l border-slate-200 bg-white overflow-y-auto">
          <ImpactPanel />
          <div className="border-t border-slate-200">
            <ScenarioManager />
          </div>
        </div>
      </div>
    </div>
  )
}
