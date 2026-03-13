import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Bookmark,
  Eye,
  EyeOff,
  FolderOpen,
  Save,
  Trash2,
  Download,
  Upload,
  GitCompareArrows,
  Search,
  X,
} from 'lucide-react'
import { useScenarioStore } from '@/store/scenario-store'
import { useMCDAStore } from '@/store/mcda-store'
import { formatDate } from '@/utils/format'
import {
  getScenarioDisplayMode,
  getScenarioColor,
  MUTED_COLOR,
} from '@/scenarios/scenario-styles'

export function ScenarioManager() {
  const [scenarioName, setScenarioName] = useState('')
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const scenarios = useScenarioStore((s) => s.scenarios)
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId)
  const visibleScenarioIds = useScenarioStore((s) => s.visibleScenarioIds)
  const comparedScenarioIds = useScenarioStore((s) => s.comparedScenarioIds)
  const saveScenario = useScenarioStore((s) => s.saveScenario)
  const deleteScenario = useScenarioStore((s) => s.deleteScenario)
  const setActiveScenario = useScenarioStore((s) => s.setActiveScenario)
  const setPlacements = useScenarioStore((s) => s.setPlacements)
  const setSelectedPlacementCell = useScenarioStore((s) => s.setSelectedPlacementCell)
  const toggleScenarioVisibility = useScenarioStore((s) => s.toggleScenarioVisibility)
  const toggleScenarioComparison = useScenarioStore((s) => s.toggleScenarioComparison)
  const importScenarios = useScenarioStore((s) => s.importScenarios)
  const exportScenarios = useScenarioStore((s) => s.exportScenarios)
  const loadFromStorage = useScenarioStore((s) => s.loadFromStorage)

  const criteria = useMCDAStore((s) => s.criteria)
  const method = useMCDAStore((s) => s.method)
  const comparisons = useMCDAStore((s) => s.comparisons)
  const setWeights = useMCDAStore((s) => s.setWeights)
  const setPolarities = useMCDAStore((s) => s.setPolarities)
  const setMethod = useMCDAStore((s) => s.setMethod)
  const setComparisons = useMCDAStore((s) => s.setComparisons)
  const setActiveCriteria = useMCDAStore((s) => s.setActiveCriteria)

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  const filteredScenarios = useMemo(() => {
    if (!searchQuery.trim()) return scenarios
    const q = searchQuery.toLowerCase()
    return scenarios.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.method.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q))
    )
  }, [scenarios, searchQuery])

  function handleSave() {
    if (!scenarioName.trim()) return
    const weights: Record<string, number> = {}
    const polarities: Record<string, (typeof criteria)[number]['polarity']> = {}
    const activeCriteriaIds: string[] = []
    criteria.forEach((c) => {
      weights[c.id] = c.weight
      polarities[c.id] = c.polarity
      if (c.active) activeCriteriaIds.push(c.id)
    })
    saveScenario(
      scenarioName,
      weights,
      method,
      polarities,
      activeCriteriaIds,
      comparisons.length > 0 ? [...comparisons] : undefined
    )
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
    if (scenario.activeCriteria) {
      setActiveCriteria(scenario.activeCriteria)
    }
    if (scenario.ahpComparisons) {
      const currentCriteriaIds = new Set(criteria.map((c) => c.id))
      const validComparisons = scenario.ahpComparisons.filter(
        (comp) => currentCriteriaIds.has(comp.criterion1) && currentCriteriaIds.has(comp.criterion2)
      )
      setComparisons(validComparisons)
    }
    setPlacements(scenario.placements)
    setSelectedPlacementCell(null)
    setActiveScenario(scenario.id)
  }

  function handleExportAll() {
    const json = exportScenarios()
    downloadJson(json, 'va-mcda-scenarios.json')
  }

  function handleExportSingle(id: string) {
    const json = exportScenarios([id])
    const scenario = scenarios.find((s) => s.id === id)
    const filename = `scenario-${scenario?.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || id}.json`
    downloadJson(json, filename)
  }

  function downloadJson(json: string, filename: string) {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportClick() {
    fileInputRef.current?.click()
  }

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result as string
      const result = importScenarios(content)
      if (result.errors.length > 0) {
        setImportError(result.errors.join('; '))
      }
      if (result.imported > 0) {
        setTimeout(() => setImportError(null), 4000)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <Bookmark className="h-3.5 w-3.5" strokeWidth={2.2} />
            Scenario Library
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            Save, compare & restore full configurations.
          </div>
        </div>
        <button
          onClick={() => setShowSaveForm(!showSaveForm)}
          className="btn-primary text-[10px] px-2.5 py-1.5"
        >
          <Save className="h-3.5 w-3.5" strokeWidth={2.2} />
          Save
        </button>
      </div>

      {showSaveForm && (
        <div className="flex gap-1.5">
          <input
            type="text"
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
            placeholder="Scenario name..."
            className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs
                       focus:ring-2 focus:ring-brand-500 outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            autoFocus
          />
          <button onClick={handleSave} className="btn-primary text-[10px] px-2.5 py-1">
            Save
          </button>
        </div>
      )}

      {/* Bulk actions */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleImportClick}
          className="flex items-center gap-1 text-[9px] font-bold text-slate-500 hover:text-brand-600 uppercase tracking-wide px-2 py-1 rounded-lg border border-slate-200 hover:border-brand-200 transition-colors"
        >
          <Upload className="h-3 w-3" strokeWidth={2.2} />
          Import
        </button>
        {scenarios.length > 0 && (
          <button
            onClick={handleExportAll}
            className="flex items-center gap-1 text-[9px] font-bold text-slate-500 hover:text-brand-600 uppercase tracking-wide px-2 py-1 rounded-lg border border-slate-200 hover:border-brand-200 transition-colors"
          >
            <Download className="h-3 w-3" strokeWidth={2.2} />
            Export All
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileImport}
          className="hidden"
        />
      </div>

      {importError && (
        <div className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
          {importError}
        </div>
      )}

      {/* Search */}
      {scenarios.length > 5 && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter scenarios..."
            className="w-full pl-7 pr-7 py-1.5 text-[10px] border border-slate-200 rounded-lg focus:ring-1 focus:ring-brand-500 outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Scenario list */}
      {filteredScenarios.length === 0 ? (
        <div className="text-center py-3">
          <div className="text-[10px] text-slate-400">
            {scenarios.length === 0 ? 'No saved scenarios' : 'No matches'}
          </div>
          {scenarios.length === 0 && (
            <div className="text-[9px] text-slate-300 mt-0.5">
              Adjust weights and place chargers, then save
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1 max-h-[320px] overflow-y-auto pr-0.5">
          {filteredScenarios.map((scenario) => {
            const mode = getScenarioDisplayMode(
              scenario.id,
              comparedScenarioIds,
              visibleScenarioIds
            )
            const color = getScenarioColor(scenario.id, comparedScenarioIds)
            const isVisible = visibleScenarioIds.has(scenario.id)
            const isCompared = comparedScenarioIds.includes(scenario.id)
            const isActive = activeScenarioId === scenario.id

            return (
              <div
                key={scenario.id}
                className={`p-2 rounded-xl border transition-all ${
                  isActive
                    ? 'bg-brand-50 border-brand-200'
                    : isCompared
                    ? 'border-slate-300 bg-slate-50'
                    : 'bg-white border-slate-100 hover:border-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {/* Color swatch / comparison indicator */}
                  <button
                    onClick={() => toggleScenarioComparison(scenario.id)}
                    className="flex-shrink-0 rounded-full border transition-all"
                    style={{
                      width: 12,
                      height: 12,
                      backgroundColor: isCompared ? color : 'transparent',
                      borderColor: isCompared ? color : '#cbd5e1',
                      borderWidth: 2,
                    }}
                    title={isCompared ? 'Remove from comparison' : 'Add to comparison'}
                  />

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-slate-700 truncate">
                      {scenario.name}
                    </div>
                    <div className="flex items-center gap-1.5 text-[8px] text-slate-400">
                      <span>{scenario.method}</span>
                      <span className="opacity-40">|</span>
                      <span>{scenario.placements.length} loc</span>
                      <span className="opacity-40">|</span>
                      <span>{formatDate(scenario.timestamp)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => toggleScenarioVisibility(scenario.id)}
                      className={`p-1 rounded-md transition-colors ${
                        isVisible ? 'text-slate-600 hover:text-slate-800' : 'text-slate-300 hover:text-slate-500'
                      }`}
                      title={isVisible ? 'Hide overlay' : 'Show overlay'}
                    >
                      {isVisible ? (
                        <Eye className="h-3 w-3" strokeWidth={2.2} />
                      ) : (
                        <EyeOff className="h-3 w-3" strokeWidth={2.2} />
                      )}
                    </button>
                    <button
                      onClick={() => handleRestore(scenario.id)}
                      className="p-1 rounded-md text-brand-500 hover:text-brand-700 transition-colors"
                      title="Load (restore to draft)"
                    >
                      <FolderOpen className="h-3 w-3" strokeWidth={2.2} />
                    </button>
                    <button
                      onClick={() => handleExportSingle(scenario.id)}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-600 transition-colors"
                      title="Export JSON"
                    >
                      <Download className="h-3 w-3" strokeWidth={2.2} />
                    </button>
                    <button
                      onClick={() => deleteScenario(scenario.id)}
                      className="p-1 rounded-md text-slate-300 hover:text-red-500 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" strokeWidth={2.2} />
                    </button>
                  </div>
                </div>

                {/* Mini weight bar */}
                <div className="flex gap-0.5 mt-1.5 h-1 rounded-full overflow-hidden bg-slate-100">
                  {criteria
                    .filter((c) => (scenario.weights[c.id] ?? 0) > 0.01)
                    .map((c) => (
                      <div
                        key={c.id}
                        className="h-full rounded-full"
                        style={{
                          width: `${(scenario.weights[c.id] ?? 0) * 100}%`,
                          backgroundColor: isCompared ? color : isVisible ? MUTED_COLOR : c.color,
                          opacity: isCompared ? 0.7 : isVisible ? 0.4 : 0.6,
                        }}
                      />
                    ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
