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

      const sql = buildMCDAQuery(method, criteria)
      const rawData = await query<MCDAQueryResult>(sql)

      const displayResolution = zoomToH3Resolution(zoom)

      let data: MCDAQueryResult[]
      if (displayResolution < 10) {
        const groups = new Map<string, { sum: number; count: number }>()
        for (const row of rawData) {
          try {
            const parentCell = cellToParent(row.h3_cell, displayResolution)
            const existing = groups.get(parentCell)
            if (existing) {
              existing.sum += row.mcda_score
              existing.count += 1
            } else {
              groups.set(parentCell, { sum: row.mcda_score, count: 1 })
            }
          } catch {
            // skip invalid cells
          }
        }
        data = Array.from(groups.entries()).map(([cell, { sum, count }]) => ({
          h3_cell: cell,
          mcda_score: sum / count,
        }))
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
