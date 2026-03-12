const fs = require('fs');
let code = fs.readFileSync('src/analysis/mcda-engine.ts', 'utf8');

code = code.replace(/export function adjustWeight\([\s\S]*?\}\n/m, `export function adjustWeight(
  criteria: Criterion[],
  criterionId: string,
  newWeight: number
): Criterion[] {
  const clampedWeight = Math.max(0, Math.min(1, newWeight))
  return criteria.map((c) =>
    c.id === criterionId ? { ...c, weight: clampedWeight } : c
  )
}
`);

code = code.replace(/export function buildMCDAQuery\(method: MCDAMethod, criteria: Criterion\[\]\): string \{/g, `export function buildMCDAQuery(method: MCDAMethod, criteria: Criterion[]): string {
  // Normalize mathematically for the actual query, while keeping user UI state independent
  const queryCriteria = normalizeWeights(criteria)`);

code = code.replace(/case 'WSM':\n      return buildWSMQuery\(criteria\)/g, `case 'WSM':\n      return buildWSMQuery(queryCriteria)`);
code = code.replace(/case 'WPM':\n      return buildWPMQuery\(criteria\)/g, `case 'WPM':\n      return buildWPMQuery(queryCriteria)`);
code = code.replace(/case 'TOPSIS':\n      return buildTOPSISQuery\(criteria\)/g, `case 'TOPSIS':\n      return buildTOPSISQuery(queryCriteria)`);

fs.writeFileSync('src/analysis/mcda-engine.ts', code);
