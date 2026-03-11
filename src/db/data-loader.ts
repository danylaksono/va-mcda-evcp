import { getDB, execute, query } from './duckdb-client'

interface DataLayer {
  filename: string
  tableName: string
  joinField: string
  fields: string[]
}

const DATA_LAYERS: DataLayer[] = [
  {
    filename: 'population_density_h3_r10.parquet',
    tableName: 'population_density',
    joinField: 'h3_cell',
    fields: ['pop_density', 'pop_density_normalized'],
  },
  {
    filename: 'car_ownership_h3_r10.parquet',
    tableName: 'car_ownership',
    joinField: 'h3_cell',
    fields: ['one_or_more', 'one_or_more_normalized'],
  },
  {
    filename: 'deprived_households_h3_r10.parquet',
    tableName: 'deprived_households',
    joinField: 'h3_cell',
    fields: ['two_or_more', 'two_or_more_normalized'],
  },
  {
    filename: 'access_employment_h3_r10.parquet',
    tableName: 'access_employment',
    joinField: 'h3_cell',
    fields: ['employment_30', 'employment_30_normalized'],
  },
  {
    filename: 'access_supermarket_h3_r10.parquet',
    tableName: 'access_supermarket',
    joinField: 'h3_cell',
    fields: ['supermarket_30', 'supermarket_30_normalized'],
  },
  {
    filename: 'transport_emission_h3_r10.parquet',
    tableName: 'transport_emission',
    joinField: 'h3_cell',
    fields: ['road_2025', 'road_2025_normalized'],
  },
  {
    filename: 'secondary_substation_h3_r10.parquet',
    tableName: 'secondary_substation',
    joinField: 'h3_cell',
    fields: ['normalised_capacity', 'normalised_capacity_normalized'],
  },
  {
    filename: 'traffic_index_h3_r10.parquet',
    tableName: 'traffic_index',
    joinField: 'h3_cell',
    fields: ['motorized_traffic_index', 'motorized_traffic_index_normalized'],
  },
  {
    filename: 'existing_evcp_h3_r10.parquet',
    tableName: 'existing_evcp',
    joinField: 'h3_cell',
    fields: ['time_limit', 'time_limit_normalized'],
  },
]

/**
 * Registers a parquet file from the data_source directory into DuckDB.
 */
async function registerParquetFile(layer: DataLayer): Promise<void> {
  const db = await getDB()
  const url = `${window.location.origin}/data_source/${layer.filename}`

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${layer.filename}: ${response.status}`)
  const buffer = await response.arrayBuffer()

  await db.registerFileBuffer(layer.filename, new Uint8Array(buffer))

  await execute(`
    CREATE TABLE IF NOT EXISTS ${layer.tableName} AS
    SELECT * FROM read_parquet('${layer.filename}')
  `)
}

/**
 * Creates the unified mcda_base view that joins all data layers.
 */
async function createMCDABaseView(): Promise<void> {
  const baseTable = DATA_LAYERS[0]
  const joinTables = DATA_LAYERS.slice(1)

  const selectFields = DATA_LAYERS.flatMap((layer) =>
    layer.fields.map((f) => `${layer.tableName}.${f}`)
  ).join(',\n  ')

  const joins = joinTables
    .map(
      (layer) =>
        `LEFT JOIN ${layer.tableName} ON ${baseTable.tableName}.${baseTable.joinField} = ${layer.tableName}.${layer.joinField}`
    )
    .join('\n')

  const sql = `
CREATE OR REPLACE VIEW mcda_base AS
SELECT
  ${baseTable.tableName}.${baseTable.joinField} AS h3_cell,
  ${selectFields}
FROM ${baseTable.tableName}
${joins}
  `

  await execute(sql)
}

/**
 * Loads all parquet data files and creates the unified MCDA base view.
 * Returns progress updates via callback.
 */
export async function loadAllData(
  onProgress?: (loaded: number, total: number, layer: string) => void
): Promise<void> {
  const total = DATA_LAYERS.length

  for (let i = 0; i < DATA_LAYERS.length; i++) {
    const layer = DATA_LAYERS[i]
    onProgress?.(i, total, layer.tableName)
    await registerParquetFile(layer)
  }

  onProgress?.(total, total, 'Creating unified view...')
  await createMCDABaseView()
}

/**
 * Returns the count of rows in the mcda_base view.
 */
export async function getRowCount(): Promise<number> {
  const result = await query<{ count: number }>('SELECT COUNT(*) AS count FROM mcda_base')
  return result[0]?.count ?? 0
}

/**
 * Returns cell data for a specific H3 cell.
 */
export async function getCellData(h3Cell: string): Promise<Record<string, number> | null> {
  const result = await query<Record<string, number>>(
    `SELECT * FROM mcda_base WHERE h3_cell = '${h3Cell}' LIMIT 1`
  )
  return result[0] ?? null
}

export { DATA_LAYERS }
