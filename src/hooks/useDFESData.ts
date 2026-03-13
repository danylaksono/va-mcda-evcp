import { useEffect } from 'react'
import { useDFESStore, type DFESRecord, type DFESSeries, type DFESMetric } from '@/store/dfes-store'

const API_KEY = import.meta.env.VITE_DFES_API_KEY || '7fe348e85bd7f26ab10a115c33d44bb5f3e79946d54886f900782042'
const BASE_URL = 'https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/ukpn-dfes-by-local-authorities/records'

export interface DFESScope {
  level: 'network' | 'lsoa' | 'borough'
  code?: string | null
}

const metricKey: Record<DFESMetric, string> = {
  electric_cars: 'number_of_electric_cars_hybrid_and_full_electric',
  electric_vans: 'number_of_electric_vans_hybrid_and_full_electric',
  heat_pumps: 'number_of_domestic_heat_pumps',
  batteries: 'number_of_domestic_batteries_kw',
}

export function useDFESData(scope: DFESScope) {
  const setError = useDFESStore((s) => s.setError)
  const setIsLoading = useDFESStore((s) => s.setIsLoading)
  const setAvailablePathways = useDFESStore((s) => s.setAvailablePathways)
  const setSeries = useDFESStore((s) => s.setSeries)
  const selectedMetric = useDFESStore((s) => s.selectedMetric)
  const setSelectedPathway = useDFESStore((s) => s.setSelectedPathway)

  useEffect(() => {
    if (!API_KEY) return

    const fetchDFESData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        if (scope.level === 'lsoa' && scope.code) {
          const pageSize = 100
          const collected: DFESRecord[] = []
          let offset = 0
          const scopeCode = String(scope.code)

          const buildParams = (useWhere: boolean) => new URLSearchParams({
            ...(useWhere ? { where: `lsoa21cd='${scopeCode}'` } : { 'refine.lsoa21cd': scopeCode }),
            limit: String(pageSize),
            offset: String(offset),
            apikey: API_KEY,
          })

          // First try where; if first page 400s, retry using refine
          let useWhere = true
          for (; ;) {
            const params = buildParams(useWhere)
            const response = await fetch(`${BASE_URL}?${params}`)

            if (!response.ok && response.status === 400 && useWhere) {
              // Switch strategy and restart from offset 0 using refine
              useWhere = false
              offset = 0
              collected.length = 0
              continue
            }

            if (!response.ok) {
              throw new Error(`API Error: ${response.status} ${response.statusText}`)
            }

            const json = await response.json()
            const results: DFESRecord[] = json.results || []
            collected.push(...results)

            if (results.length < pageSize) break
            offset += pageSize
          }

          const records = collected

          const grouped = new Map<string, DFESSeries['points']>()
          records.forEach((record) => {
            const pathway = record.pathway
            const points = grouped.get(pathway) || []
            points.push({
              year: parseInt(record.year),
              value: (record[metricKey[selectedMetric]] as number) || 0,
            })
            grouped.set(pathway, points)
          })

          const series = Array.from(grouped.entries()).map(([pathway, points]) => ({
            pathway,
            points: points.sort((a, b) => a.year - b.year),
          }))

          const pathways = series.map((s) => s.pathway).sort()
          setAvailablePathways(pathways)
          setSeries(series)

          // Only auto-select first pathway if CURRENTLY null AND we haven't explicitly set null
          // Actually, it's better to allow null (All Pathways) to persist.
          // Let's only set it if there's no selection and we want to default to something.
          const store = useDFESStore.getState()
          if (!store.selectedPathway && pathways.length > 0 && scope.level !== 'lsoa') {
            // Default logic removed to allow 'All Pathways' to persist
          }
        } else if (scope.level === 'borough' && scope.code) {
          const field = metricKey[selectedMetric]
          const boroughName = String(scope.code)
          const params = new URLSearchParams({
            select: `year,pathway,sum(${field}) as total`,
            where: `lad22nm='${boroughName}'`,
            group_by: 'year,pathway',
            order_by: 'year',
            limit: '500',
            apikey: API_KEY,
          })

          const response = await fetch(`${BASE_URL}?${params}`)
          if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`)
          }

          const json = await response.json()
          const results = json.results || []

          const grouped = new Map<string, DFESSeries['points']>()
          results.forEach((row: any) => {
            const pathway = row.pathway as string
            const points = grouped.get(pathway) || []
            points.push({
              year: parseInt(row.year),
              value: Number(row.total) || 0,
            })
            grouped.set(pathway, points)
          })

          const boroughSeries = Array.from(grouped.entries()).map(([pathway, points]) => ({
            pathway,
            points: points.sort((a, b) => a.year - b.year),
          }))

          const pathways = boroughSeries.map((s) => s.pathway).sort()
          setAvailablePathways(pathways)
          setSeries(boroughSeries)
        } else {
          const field = metricKey[selectedMetric]
          const params = new URLSearchParams({
            select: `year,pathway,sum(${field}) as total`,
            group_by: 'year,pathway',
            order_by: 'year',
            limit: '500',
            apikey: API_KEY,
          })

          const response = await fetch(`${BASE_URL}?${params}`)
          if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`)
          }

          const json = await response.json()
          const results = json.results || []

          const grouped = new Map<string, DFESSeries['points']>()
          results.forEach((row: any) => {
            const pathway = row.pathway as string
            const points = grouped.get(pathway) || []
            points.push({
              year: parseInt(row.year),
              value: Number(row.total) || 0,
            })
            grouped.set(pathway, points)
          })

          const series = Array.from(grouped.entries()).map(([pathway, points]) => ({
            pathway,
            points: points.sort((a, b) => a.year - b.year),
          }))

          const pathways = series.map((s) => s.pathway).sort()
          setAvailablePathways(pathways)
          setSeries(series)
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch DFES data'
        setError(errorMessage)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDFESData()
  }, [scope.level, scope.code, selectedMetric, setIsLoading, setError, setAvailablePathways, setSeries, setSelectedPathway])
}
