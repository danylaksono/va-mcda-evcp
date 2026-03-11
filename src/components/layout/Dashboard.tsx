import React, { useState } from 'react'
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
  mcdaResults: Array<{ h3_cell: string; mcda_score: number }>
}

export function Dashboard({ totalRows, mcdaResults }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('pcp')
  const computeTime = useMCDAStore((s) => s.lastComputeTime)

  const tabs: { id: TabId; label: string }[] = [
    { id: 'pcp', label: 'Parallel Coordinates' },
    { id: 'ahp', label: 'AHP Comparison' },
    { id: 'matrix', label: 'Matrix & Diagnostics' },
  ]

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      <Header totalRows={totalRows} computeTime={computeTime} />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: MCDA Controls */}
        <div className="w-[440px] min-w-[380px] flex flex-col border-r border-slate-200 bg-white overflow-y-auto">
          {/* Tab Navigation */}
          <div className="flex border-b border-slate-200 px-4 pt-3">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-2.5 px-3 text-xs font-bold uppercase tracking-wider transition-all
                  ${
                    activeTab === tab.id
                      ? 'text-brand-600 border-b-2 border-brand-600'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
              >
                {tab.label}
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
          <div className="border-t border-slate-200">
            <WeightSummary />
          </div>
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
