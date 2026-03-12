import { useState, useEffect, useCallback, useRef } from 'react'
import { query } from '@/db/duckdb-client'
import { loadAllData, getRowCount } from '@/db/data-loader'
import { buildMCDAQuery } from '@/analysis/mcda-engine'
import { useMCDAStore } from '@/store/mcda-store'
import { useMapStore } from '@/store/map-store'
import { zoomToH3Resolution } from '@/utils/h3-utils'
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
}

/**
 * Hook to run MCDA queries at the appropriate H3 resolution based on map zoom.
 * Aggregates results to coarser resolutions for performance.
 */
export function useMCDAQuery() {
  const criteria = useMCDAStore((s) => s.criteria)
  const method = useMCDAStore((s) => s.method)
  const setComputing = useMCDAStore((s) => s.setComputing)
  const setLastComputeTime = useMCDAStore((s) => s.setLastComputeTime)
  const zoom = useMapStore((s) => s.zoom)

  const [results, setResults] = useState<MCDAQueryResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const runQuery = useCallback(async () => {
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

      const sql = extraSelect
        ? `
WITH scored AS (
  ${baseSql}
)
SELECT
  scored.h3_cell,
  scored.mcda_score,
  ${extraSelect}
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
        }
      })

      const displayResolution = zoomToH3Resolution(zoom)

      let data: MCDAQueryResult[]
      if (displayResolution < 10) {
        const groups = new Map<string, {
          sum: number
          count: number
          criterionSums: Record<string, number>
          rawSums: Record<string, number>
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
              groups.set(parentCell, { sum: row.mcda_score, count: 1, criterionSums, rawSums })
            }
          } catch {
            // skip invalid cells
          }
        }
        data = Array.from(groups.entries()).map(([cell, { sum, count, criterionSums, rawSums }]) => {
          const criterionValues: Record<string, number> = {}
          const rawValues: Record<string, number> = {}
          for (const [criterionId, value] of Object.entries(criterionSums)) {
            criterionValues[criterionId] = value / count
          }
          for (const [criterionId, value] of Object.entries(rawSums)) {
            rawValues[criterionId] = value / count
          }
          return {
            h3_cell: cell,
            mcda_score: sum / count,
            criterion_values: criterionValues,
            raw_values: rawValues,
          }
        })
      } else {
        data = rawData
      }

      const elapsed = performance.now() - start

      setResults(data)
      setLastComputeTime(elapsed)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed')
    } finally {
      setComputing(false)
    }
  }, [criteria, method, zoom, setComputing, setLastComputeTime])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(runQuery, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [runQuery])

  return { results, error }
}
