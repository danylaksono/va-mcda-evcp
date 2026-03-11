import React from 'react'
import { Dashboard } from './components/layout/Dashboard'
import { useDataLoader, useMCDAQuery } from './hooks/useDuckDB'

function LoadingScreen({
  progress,
  currentLayer,
  error,
}: {
  progress: number
  currentLayer: string
  error: string | null
}) {
  return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center max-w-md w-full px-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">EVCP Siting Dashboard</h1>
        <p className="text-sm text-slate-400 italic mb-8">
          Visual Analytics for Multi-Criteria Decision Analysis
        </p>

        {error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="text-sm font-bold text-red-700 mb-1">Error loading data</div>
            <div className="text-xs text-red-600">{error}</div>
          </div>
        ) : (
          <>
            <div className="w-full bg-slate-200 rounded-full h-1.5 mb-3 overflow-hidden">
              <div
                className="h-full bg-brand-600 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {currentLayer}
            </div>
            <div className="text-[10px] text-slate-300 mt-1">{progress.toFixed(0)}%</div>
          </>
        )}
      </div>
    </div>
  )
}

function AppContent({ totalRows }: { totalRows: number }) {
  const { results } = useMCDAQuery()

  return <Dashboard totalRows={totalRows} mcdaResults={results} />
}

export default function App() {
  const { isLoading, progress, currentLayer, error, totalRows } = useDataLoader()

  if (isLoading || error) {
    return <LoadingScreen progress={progress} currentLayer={currentLayer} error={error} />
  }

  return <AppContent totalRows={totalRows} />
}
