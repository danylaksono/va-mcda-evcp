import * as duckdb from '@duckdb/duckdb-wasm'

let db: duckdb.AsyncDuckDB | null = null
let conn: duckdb.AsyncDuckDBConnection | null = null
let initPromise: Promise<void> | null = null

/**
 * Initializes DuckDB WASM with the bundled worker.
 * Uses singleton pattern — only one instance across the app.
 */
async function initDuckDB(): Promise<void> {
  if (db) return

  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles()
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES)

  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], {
      type: 'text/javascript',
    })
  )

  const worker = new Worker(worker_url)
  const logger = new duckdb.ConsoleLogger()
  db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  URL.revokeObjectURL(worker_url)

  conn = await db.connect()

  try {
    await conn.query(`INSTALL h3 FROM community; LOAD h3;`)
  } catch {
    console.warn('H3 extension not available — resolution rollup will use JS-based aggregation')
  }
}

/**
 * Returns the singleton DuckDB connection, initializing if needed.
 */
export async function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!initPromise) {
    initPromise = initDuckDB()
  }
  await initPromise
  if (!conn) throw new Error('DuckDB connection not available')
  return conn
}

/**
 * Returns the singleton DuckDB instance.
 */
export async function getDB(): Promise<duckdb.AsyncDuckDB> {
  if (!initPromise) {
    initPromise = initDuckDB()
  }
  await initPromise
  if (!db) throw new Error('DuckDB instance not available')
  return db
}

/**
 * Executes a SQL query and returns results as an array of objects.
 */
export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const connection = await getConnection()
  const result = await connection.query(sql)
  return result.toArray().map((row) => {
    const obj: Record<string, unknown> = {}
    for (const field of result.schema.fields) {
      const val = row[field.name]
      obj[field.name] = typeof val === 'bigint' ? val.toString() : val
    }
    return obj as T
  })
}

/**
 * Executes a SQL statement without returning results.
 */
export async function execute(sql: string): Promise<void> {
  const connection = await getConnection()
  await connection.query(sql)
}
