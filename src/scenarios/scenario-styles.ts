export type ScenarioDisplayMode = 'hidden' | 'muted' | 'highlighted'

export const SCENARIO_PALETTE = [
  '#2563eb',
  '#f97316',
  '#14b8a6',
  '#e11d48',
  '#8b5cf6',
  '#0f766e',
  '#d97706',
  '#64748b',
] as const

export const MUTED_COLOR = '#94a3b8'
export const DRAFT_COLOR = '#0f172a'

export interface ScenarioStyleTokens {
  stroke: string
  fill: string
  strokeWidth: number
  opacity: number
  labelVisible: boolean
  circleRadius: number
  dashArray?: string
}

const DRAFT_TOKENS: ScenarioStyleTokens = {
  stroke: DRAFT_COLOR,
  fill: 'rgba(15, 23, 42, 0.10)',
  strokeWidth: 3,
  opacity: 0.9,
  labelVisible: true,
  circleRadius: 7,
}

const MUTED_TOKENS: ScenarioStyleTokens = {
  stroke: MUTED_COLOR,
  fill: 'rgba(148, 163, 184, 0.06)',
  strokeWidth: 1,
  opacity: 0.2,
  labelVisible: false,
  circleRadius: 3,
}

function highlightedTokens(color: string): ScenarioStyleTokens {
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  return {
    stroke: color,
    fill: `rgba(${r}, ${g}, ${b}, 0.12)`,
    strokeWidth: 2,
    opacity: 0.55,
    labelVisible: true,
    circleRadius: 5,
  }
}

export function getScenarioDisplayMode(
  scenarioId: string,
  comparedIds: string[],
  visibleIds: Set<string>
): ScenarioDisplayMode {
  if (comparedIds.includes(scenarioId)) return 'highlighted'
  if (visibleIds.has(scenarioId)) return 'muted'
  return 'hidden'
}

export function getScenarioColor(scenarioId: string, comparedIds: string[]): string {
  const idx = comparedIds.indexOf(scenarioId)
  if (idx === -1) return MUTED_COLOR
  return SCENARIO_PALETTE[idx % SCENARIO_PALETTE.length]
}

export function getScenarioStyle(
  mode: ScenarioDisplayMode,
  color: string
): ScenarioStyleTokens {
  switch (mode) {
    case 'highlighted':
      return highlightedTokens(color)
    case 'muted':
      return { ...MUTED_TOKENS }
    case 'hidden':
      return { ...MUTED_TOKENS, opacity: 0 }
  }
}

export function getDraftStyle(): ScenarioStyleTokens {
  return { ...DRAFT_TOKENS }
}

export interface ScenarioRenderInfo {
  id: string
  mode: ScenarioDisplayMode
  color: string
  style: ScenarioStyleTokens
}

export function buildScenarioRenderList(
  scenarioIds: string[],
  comparedIds: string[],
  visibleIds: Set<string>
): ScenarioRenderInfo[] {
  const result: ScenarioRenderInfo[] = []
  for (const id of scenarioIds) {
    const mode = getScenarioDisplayMode(id, comparedIds, visibleIds)
    if (mode === 'hidden') continue
    const color = getScenarioColor(id, comparedIds)
    const style = getScenarioStyle(mode, color)
    result.push({ id, mode, color, style })
  }
  return result
}
