import React from 'react'
import { useMCDAStore } from '@/store/mcda-store'

interface HeaderProps {
  totalRows: number
  computeTime: number
}

export function Header({ totalRows, computeTime }: HeaderProps) {
  const isComputing = useMCDAStore((s) => s.isComputing)

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight">
            EVCP Siting Dashboard
          </h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
            Visual Analytics for Multi-Criteria Decision Analysis
          </p>
        </div>
        <div className="h-8 w-px bg-slate-200" />
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Cells:
          </span>
          <span className="text-xs font-mono font-bold text-slate-700">
            {totalRows.toLocaleString()}
          </span>
        </div>
        {computeTime > 0 && (
          <>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-1">
              {isComputing ? (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              )}
              <span className="text-[10px] font-mono text-slate-400">
                {computeTime.toFixed(0)}ms
              </span>
            </div>
          </>
        )}
      </div>

    </header>
  )
}
