import { useState, useEffect, useCallback, useRef } from 'react'
import { query } from '@/db/duckdb-client'
import { loadAllData, getRowCount } from '@/db/data-loader'
import { buildMCDAQuery } from '@/analysis/mcda-engine'
import type { Criterion, MCDAMethod } from '@/analysis/types'
import { useMCDAStore } from '@/store/mcda-store'
import { useMapStore } from '@/store/map-store'
import { cellToParent } from 'h3-js'

interface LoadingState {
  isLoading: boolean
  progress: number
  currentLayer: string
  error: string | null
  totalRows: number
}

export function useDataLoader() {
  const [state, setState] = useState<LoadingState>({
    isLoading: true,
    progress: 0,
    currentLayer: 'Initializing DuckDB...',
    error: null,
    totalRows: 0,
  })

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        await loadAllData((loaded, total, layer) => {
          if (!mounted) return
          setState((prev) => ({
            ...prev,
            progress: (loaded / total) * 100,
            currentLayer: layer,
          }))
        })

        const rows = await getRowCount()

        if (mounted) {
          setState({
            isLoading: false,
            progress: 100,
            currentLayer: 'Complete',
            error: null,
            totalRows: rows,
          })
        }
      } catch (err) {
        if (mounted) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          }))
        }
      }
    }

    load()
    return () => { mounted = false }
  }, [])

  return state
}

interface MCDAQueryResult {
  h3_cell: string
  mcda_score: number
  criterion_values?: Record<string, number>
  raw_values?: Record<string, number>
  lsoa21cd?: string
  lsoa21nm?: string
  borough_name?: string
}

const MAX_MCDA_SCENARIO_CACHE_SIZE = 6

function getScenarioKey(method: MCDAMethod, criteria: Criterion[]): string {
  return JSON.stringify({
    method,
    criteria: criteria.map((criterion) => ({
      id: criterion.id,
      active: criterion.active,
      weight: Number(criterion.weight.toFixed(6)),
      polarity: criterion.polarity,
    })),
  })
}

function aggregateResultsByResolution(
  rawData: MCDAQueryResult[],
  displayResolution: number
): MCDAQueryResult[] {
  if (displayResolution >= 10) return rawData

  const groups = new Map<string, {
    sum: number
    count: number
    criterionSums: Record<string, number>
    rawSums: Record<string, number>
    lsoa21cd?: string
    lsoa21nm?: string
    borough_name?: string
  }>()

  for (const row of rawData) {
    try {
      const parentCell = cellToParent(row.h3_cell, displayResolution)
      const existing = groups.get(parentCell)
      if (existing) {
        existing.sum += row.mcda_score
        existing.count += 1
        if (row.criterion_values) {
          for (const [criterionId, value] of Object.entries(row.criterion_values)) {
            existing.criterionSums[criterionId] = (existing.criterionSums[criterionId] ?? 0) + value
          }
        }
        if (row.raw_values) {
          for (const [criterionId, value] of Object.entries(row.raw_values)) {
            existing.rawSums[criterionId] = (existing.rawSums[criterionId] ?? 0) + value
          }
        }
      } else {
        const criterionSums: Record<string, number> = {}
        const rawSums: Record<string, number> = {}
        if (row.criterion_values) {
          for (const [criterionId, value] of Object.entries(row.criterion_values)) {
            criterionSums[criterionId] = value
          }
        }
        if (row.raw_values) {
          for (const [criterionId, value] of Object.entries(row.raw_values)) {
            rawSums[criterionId] = value
          }
        }
        groups.set(parentCell, {
          sum: row.mcda_score,
          count: 1,
          criterionSums,
          rawSums,
          lsoa21cd: row.lsoa21cd,
          lsoa21nm: row.lsoa21nm,
          borough_name: row.borough_name,
        })
      }
    } catch {
      // skip invalid cells
    }
  }

  return Array.from(groups.entries()).map(([cell, group]) => {
    const criterionValues: Record<string, number> = {}
    const rawValues: Record<string, number> = {}
    for (const [criterionId, value] of Object.entries(group.criterionSums)) {
      criterionValues[criterionId] = value / group.count
    }
    for (const [criterionId, value] of Object.entries(group.rawSums)) {
      rawValues[criterionId] = value / group.count
    }
    return {
      h3_cell: cell,
      mcda_score: group.sum / group.count,
      criterion_values: criterionValues,
      raw_values: rawValues,
      lsoa21cd: group.lsoa21cd,
      lsoa21nm: group.lsoa21nm,
      borough_name: group.borough_name,
    }
  })
}

/**
 * Hook to score MCDA scenarios once, then reuse cached display aggregations
 * as the map crosses H3 resolution bands.
 */
export function useMCDAQuery() {
  const criteria = useMCDAStore((s) => s.criteria)
  const method = useMCDAStore((s) => s.method)
  const setComputing = useMCDAStore((s) => s.setComputing)
  const setLastComputeTime = useMCDAStore((s) => s.setLastComputeTime)
  const displayResolution = useMapStore((s) => s.displayResolution)

  const [results, setResults] = useState<MCDAQueryResult[]>([])
  const [baseResults, setBaseResults] = useState<{ key: string; data: MCDAQueryResult[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const queryRunRef = useRef(0)
  const baseCacheRef = useRef<Map<string, MCDAQueryResult[]>>(new Map())
  const displayCacheRef = useRef<Map<string, Map<number, MCDAQueryResult[]>>>(new Map())
  const scenarioKey = getScenarioKey(method, criteria)

  const runQuery = useCallback(async () => {
    const runId = queryRunRef.current + 1
    queryRunRef.current = runId

    const cached = baseCacheRef.current.get(scenarioKey)
    if (cached) {
      baseCacheRef.current.delete(scenarioKey)
      baseCacheRef.current.set(scenarioKey, cached)
      setBaseResults({ key: scenarioKey, data: cached })
      setComputing(false)
      setError(null)
      return
    }

    try {
      setComputing(true)
      const start = performance.now()

      const baseSql = buildMCDAQuery(method, criteria)
      const activeCriteria = criteria.filter((c) => c.active)
      const criterionSelect = activeCriteria
        .map((c) => {
          const orientedExpr = c.polarity === 'cost' ? `(1 - base.${c.normalizedField})` : `base.${c.normalizedField}`
          return `${orientedExpr} AS criterion_${c.id}`
        })
        .join(',\n  ')
      const rawSelect = activeCriteria
        .map((c) => `base.${c.field} AS raw_${c.id}`)
        .join(',\n  ')
      const extraSelect = [criterionSelect, rawSelect].filter(Boolean).join(',\n  ')

      const metadataSelect = 'base.lsoa21cd, base.lsoa21nm, base.borough_name'

      const sql = extraSelect
        ? `
WITH scored AS (
  ${baseSql}
)
SELECT
  scored.h3_cell,
  scored.mcda_score,
  ${extraSelect},
  ${metadataSelect}
FROM scored
JOIN mcda_base base USING (h3_cell)
ORDER BY scored.mcda_score DESC`
        : baseSql

      const rawRows = await query<Record<string, unknown>>(sql)
      const rawData: MCDAQueryResult[] = rawRows.map((row) => {
        const criterionValues: Record<string, number> = {}
        const rawValues: Record<string, number> = {}
        for (const criterion of activeCriteria) {
          const normalizedKey = `criterion_${criterion.id}`
          const normalizedValue = Number(row[normalizedKey])
          if (Number.isFinite(normalizedValue)) {
            criterionValues[criterion.id] = normalizedValue
          }

          const rawKey = `raw_${criterion.id}`
          const rawValue = Number(row[rawKey])
          if (Number.isFinite(rawValue)) {
            rawValues[criterion.id] = rawValue
          }
        }

        return {
          h3_cell: String(row.h3_cell),
          mcda_score: Number(row.mcda_score),
          criterion_values: criterionValues,
          raw_values: rawValues,
          lsoa21cd: row.lsoa21cd != null ? String(row.lsoa21cd) : undefined,
          lsoa21nm: row.lsoa21nm != null ? String(row.lsoa21nm) : undefined,
          borough_name: row.borough_name != null ? String(row.borough_name) : undefined,
        }
      })

      const elapsed = performance.now() - start
      if (queryRunRef.current !== runId) return

      baseCacheRef.current.set(scenarioKey, rawData)
      displayCacheRef.current.delete(scenarioKey)
      if (baseCacheRef.current.size > MAX_MCDA_SCENARIO_CACHE_SIZE) {
        const oldestKey = baseCacheRef.current.keys().next().value
        if (oldestKey) {
          baseCacheRef.current.delete(oldestKey)
          displayCacheRef.current.delete(oldestKey)
        }
      }
      setBaseResults({ key: scenarioKey, data: rawData })
      setLastComputeTime(elapsed)
      setError(null)
    } catch (err) {
      if (queryRunRef.current !== runId) return
      setError(err instanceof Error ? err.message : 'Query failed')
    } finally {
      if (queryRunRef.current === runId) {
        setComputing(false)
      }
    }
  }, [criteria, method, scenarioKey, setComputing, setLastComputeTime])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(runQuery, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [runQuery])

  useEffect(() => {
    if (!baseResults || baseResults.key !== scenarioKey) return

    const displayCache =
      displayCacheRef.current.get(scenarioKey) ?? new Map<number, MCDAQueryResult[]>()
    displayCacheRef.current.set(scenarioKey, displayCache)

    const cached = displayCache.get(displayResolution)
    if (cached) {
      setResults(cached)
      return
    }

    const aggregated = aggregateResultsByResolution(baseResults.data, displayResolution)
    displayCache.set(displayResolution, aggregated)
    setResults(aggregated)
  }, [baseResults, displayResolution, scenarioKey])

  return { results, error }
}
