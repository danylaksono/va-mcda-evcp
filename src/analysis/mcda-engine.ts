import type { Criterion, MCDAMethod } from './types'

function orientedFieldExpression(criterion: Criterion): string {
  if (criterion.polarity === 'cost') {
    return `(1 - ${criterion.normalizedField})`
  }
  return criterion.normalizedField
}

/**
 * Builds a SQL query for weighted sum model (WSM) scoring.
 * Score = Σ(wi × Si) for all active criteria
 */
export function buildWSMQuery(criteria: Criterion[]): string {
  const active = criteria.filter((c) => c.active)
  if (active.length === 0) return 'SELECT h3_cell, 0.0 AS mcda_score FROM mcda_base LIMIT 0'

  const terms = active.map((c) => `(${c.weight} * ${orientedFieldExpression(c)})`).join(' +\n    ')

  return `
SELECT
  h3_cell,
  (${terms}) AS mcda_score
FROM mcda_base
ORDER BY mcda_score DESC`
}

/**
 * Builds a SQL query for weighted product model (WPM) scoring.
 * Score = Π(Si^wi) for all active criteria
 */
export function buildWPMQuery(criteria: Criterion[]): string {
  const active = criteria.filter((c) => c.active)
  if (active.length === 0) return 'SELECT h3_cell, 0.0 AS mcda_score FROM mcda_base LIMIT 0'

  const terms = active
    .map((c) => `POWER(GREATEST(${orientedFieldExpression(c)}, 0.001), ${c.weight})`)
    .join(' *\n    ')

  return `
SELECT
  h3_cell,
  (${terms}) AS mcda_score
FROM mcda_base
ORDER BY mcda_score DESC`
}

/**
 * Builds a SQL query for TOPSIS scoring.
 * Uses distance to positive and negative ideal solutions.
 */
export function buildTOPSISQuery(criteria: Criterion[]): string {
  const active = criteria.filter((c) => c.active)
  if (active.length === 0) return 'SELECT h3_cell, 0.0 AS mcda_score FROM mcda_base LIMIT 0'

  const weightedCols = active
    .map((c) => `(${c.weight} * ${orientedFieldExpression(c)}) AS w_${c.id}`)
    .join(',\n    ')

  const pisTerms = active.map((c) => `MAX(w_${c.id}) AS pis_${c.id}`).join(', ')
  const nisTerms = active.map((c) => `MIN(w_${c.id}) AS nis_${c.id}`).join(', ')

  const dPlusTerms = active
    .map((c) => `POWER(w.w_${c.id} - ideal.pis_${c.id}, 2)`)
    .join(' + ')
  const dMinusTerms = active
    .map((c) => `POWER(w.w_${c.id} - ideal.nis_${c.id}, 2)`)
    .join(' + ')

  return `
WITH weighted AS (
  SELECT h3_cell, ${weightedCols}
  FROM mcda_base
),
ideal AS (
  SELECT ${pisTerms}, ${nisTerms}
  FROM weighted
)
SELECT
  w.h3_cell,
  CASE
    WHEN (SQRT(${dPlusTerms}) + SQRT(${dMinusTerms})) = 0 THEN 0
    ELSE SQRT(${dMinusTerms}) / (SQRT(${dPlusTerms}) + SQRT(${dMinusTerms}))
  END AS mcda_score
FROM weighted w, ideal
ORDER BY mcda_score DESC`
}

/**
 * Returns the appropriate SQL query builder for the given MCDA method.
 */
export function buildMCDAQuery(method: MCDAMethod, criteria: Criterion[]): string {
  // Normalize mathematically for the actual query, while keeping user UI state independent
  const queryCriteria = normalizeWeights(criteria)
  switch (method) {
    case 'WSM':
      return buildWSMQuery(queryCriteria)
    case 'WPM':
      return buildWPMQuery(queryCriteria)
    case 'TOPSIS':
      return buildTOPSISQuery(queryCriteria)
  }
}

/**
 * Builds a SQL query that aggregates MCDA scores to a coarser H3 resolution.
 * Used for rendering at different zoom levels.
 */
export function buildResolutionRollupQuery(
  method: MCDAMethod,
  criteria: Criterion[],
  targetResolution: number
): string {
  const scoreQuery = buildMCDAQuery(method, criteria)

  return `
WITH scored AS (${scoreQuery})
SELECT
  h3_cell_to_parent(h3_cell, ${targetResolution}) AS h3_cell,
  AVG(mcda_score) AS mcda_score,
  COUNT(*) AS cell_count
FROM scored
GROUP BY h3_cell_to_parent(h3_cell, ${targetResolution})
ORDER BY mcda_score DESC`
}

/**
 * Builds a SQL query for viewport-based filtering.
 */
export function buildViewportQuery(
  method: MCDAMethod,
  criteria: Criterion[],
  bounds: { north: number; south: number; east: number; west: number }
): string {
  const scoreQuery = buildMCDAQuery(method, criteria)

  return `
WITH scored AS (${scoreQuery})
SELECT h3_cell, mcda_score
FROM scored
WHERE mcda_score IS NOT NULL`
}

/**
 * Normalizes weights so they sum to 1.
 */
export function normalizeWeights(criteria: Criterion[]): Criterion[] {
  const active = criteria.filter((c) => c.active)
  const sum = active.reduce((s, c) => s + c.weight, 0)

  return criteria.map((c) => {
    if (!c.active) return { ...c, weight: 0 }
    if (sum === 0) return { ...c, weight: 0 }
    return { ...c, weight: c.weight / sum }
  })
}

/**
 * Adjusts weight of one criterion without affecting others, enabling independent slider behavior.
 */
export function adjustWeight(
  criteria: Criterion[],
  criterionId: string,
  newWeight: number
): Criterion[] {
  const clampedWeight = Math.max(0, Math.min(1, newWeight))
  return criteria.map((c) =>
    c.id === criterionId ? { ...c, weight: clampedWeight } : c
  )
}
