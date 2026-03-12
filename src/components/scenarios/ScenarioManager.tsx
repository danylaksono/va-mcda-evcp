import React, { useState, useEffect } from 'react'
import { Bookmark, FolderOpen, Save, Trash2 } from 'lucide-react'
import { useScenarioStore } from '@/store/scenario-store'
import { useMCDAStore } from '@/store/mcda-store'
import { formatDate } from '@/utils/format'

export function ScenarioManager() {
  const [scenarioName, setScenarioName] = useState('')
  const [showSaveForm, setShowSaveForm] = useState(false)

  const scenarios = useScenarioStore((s) => s.scenarios)
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId)
  const saveScenario = useScenarioStore((s) => s.saveScenario)
  const deleteScenario = useScenarioStore((s) => s.deleteScenario)
  const setActiveScenario = useScenarioStore((s) => s.setActiveScenario)
  const loadFromStorage = useScenarioStore((s) => s.loadFromStorage)
  const currentPlacements = useScenarioStore((s) => s.currentPlacements)

  const criteria = useMCDAStore((s) => s.criteria)
  const method = useMCDAStore((s) => s.method)
  const setWeights = useMCDAStore((s) => s.setWeights)
  const setPolarities = useMCDAStore((s) => s.setPolarities)
  const setMethod = useMCDAStore((s) => s.setMethod)

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  function handleSave() {
    if (!scenarioName.trim()) return
    const weights: Record<string, number> = {}
    const polarities: Record<string, (typeof criteria)[number]['polarity']> = {}
    criteria.forEach((c) => {
      weights[c.id] = c.weight
      polarities[c.id] = c.polarity
    })
    saveScenario(scenarioName, weights, method, polarities)
    setScenarioName('')
    setShowSaveForm(false)
  }

  function handleRestore(scenarioId: string) {
    const scenario = scenarios.find((s) => s.id === scenarioId)
    if (!scenario) return
    setWeights(scenario.weights)
    if (scenario.polarities) {
      setPolarities(scenario.polarities)
    }
    setMethod(scenario.method)
    setActiveScenario(scenario.id)
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <Bookmark className="h-3.5 w-3.5" strokeWidth={2.2} />
            Scenario Library
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Restore full MCDA configurations and compare them in the PCP.
          </div>
        </div>
        <button
          onClick={() => setShowSaveForm(!showSaveForm)}
          className="btn-primary text-[10px] px-3 py-1.5"
        >
          <Save className="h-3.5 w-3.5" strokeWidth={2.2} />
          Save Current
        </button>
      </div>

      {showSaveForm && (
        <div className="flex gap-2">
          <input
            type="text"
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
            placeholder="Scenario name..."
            className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-xs
                       focus:ring-2 focus:ring-brand-500 outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            autoFocus
          />
          <button onClick={handleSave} className="btn-primary text-[10px] px-3 py-1">
            Save
          </button>
        </div>
      )}

      {scenarios.length === 0 ? (
        <div className="text-center py-4">
          <div className="text-xs text-slate-400">No saved scenarios</div>
          <div className="text-[10px] text-slate-300 mt-0.5">
            Adjust weights and place chargers, then save
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {scenarios.map((scenario) => (
            <div
              key={scenario.id}
              className={`p-2.5 rounded-xl border transition-colors ${
                activeScenarioId === scenario.id
                  ? 'bg-brand-50 border-brand-200'
                  : 'bg-slate-50 border-slate-100 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-bold text-slate-700">{scenario.name}</div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleRestore(scenario.id)}
                    className="text-[9px] font-bold text-brand-600 hover:text-brand-800 uppercase"
                  >
                    <span className="inline-flex items-center gap-1">
                      <FolderOpen className="h-3 w-3" strokeWidth={2.4} />
                      Load
                    </span>
                  </button>
                  <button
                    onClick={() => deleteScenario(scenario.id)}
                    className="text-[9px] font-bold text-slate-400 hover:text-red-500 uppercase"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Trash2 className="h-3 w-3" strokeWidth={2.4} />
                      Del
                    </span>
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[9px] text-slate-400">
                <span>{scenario.method}</span>
                <span>•</span>
                <span>{scenario.placements.length} placements</span>
                <span>•</span>
                <span>{formatDate(scenario.timestamp)}</span>
              </div>
              {/* Mini weight bar */}
              <div className="flex gap-0.5 mt-1.5 h-1.5 rounded-full overflow-hidden bg-slate-200">
                {criteria
                  .filter((c) => (scenario.weights[c.id] ?? 0) > 0.01)
                  .map((c) => (
                    <div
                      key={c.id}
                      className="h-full rounded-full"
                      style={{
                        width: `${(scenario.weights[c.id] ?? 0) * 100}%`,
                        backgroundColor: c.color,
                      }}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
