export interface Criterion {
  id: string
  name: string
  field: string
  normalizedField: string
  weight: number
  polarity: CriterionPolarity
  active: boolean
  color: string
  category: CriterionCategory
  description: string
}

export type CriterionCategory = 'demand' | 'equity' | 'accessibility' | 'environment' | 'infrastructure' | 'coverage'
export type CriterionPolarity = 'benefit' | 'cost'

export type MCDAMethod = 'WSM' | 'WPM' | 'TOPSIS'

export interface MCDAResult {
  h3Cell: bigint | string
  score: number
  rank?: number
}

export interface AHPComparison {
  criterion1: string
  criterion2: string
  ratio: number
}

export interface AHPMetrics {
  lambdaMax: number
  consistencyIndex: number
  consistencyRatio: number
  isConsistent: boolean
  weights: Record<string, number>
}

export type ChargerType = 'slow' | 'fast' | 'rapid' | 'ultra_rapid'

export interface ChargerSpec {
  type: ChargerType
  label: string
  powerKW: number
  costGBP: number
  installMonths: number
}

export interface PlacementCellData {
  /** Raw field values keyed by criterion ID (original units from parquet) */
  raw: Record<string, number>
  /** Min-max normalized values (0–1) keyed by criterion ID */
  normalized: Record<string, number>
  /** Non-numeric attributes from DuckDB (LSOA / borough context) */
  metadata?: { lsoa21cd?: string; lsoa21nm?: string; borough_name?: string }
}

export interface EVCPPlacement {
  h3Cell: string
  chargerType: ChargerType
  chargerCount: number
  timestamp: number
  lsoaCode?: string
  /** Spatial data captured at placement time from MCDA results */
  cellData?: PlacementCellData
}

export interface ImpactEstimate {
  energyDeliveredKWh: number
  carbonSavedTonnes: number
  annualRevenue: number
  peakDemandKW: number
  headroomImpactPct: number
  populationServed: number
  deprivationScore: number
  installCostGBP: number
  utilizationFactor: number
}

export interface Scenario {
  id: string
  name: string
  description?: string
  timestamp: number
  weights: Record<string, number>
  polarities?: Record<string, CriterionPolarity>
  method: MCDAMethod
  activeCriteria?: string[]
  ahpComparisons?: AHPComparison[]
  placements: EVCPPlacement[]
  impactSummary?: ImpactEstimate
}

export const CRITERIA_CONFIG: Criterion[] = [
  {
    id: 'pop_density',
    name: 'Population Density',
    field: 'pop_density',
    normalizedField: 'pop_density_normalized',
    weight: 0.5,
    polarity: 'benefit',
    active: true,
    color: '#3b82f6',
    category: 'demand',
    description: 'Population density',
  },
  {
    id: 'car_ownership',
    name: 'Car Ownership',
    field: 'more_than_one',
    normalizedField: 'more_than_one_normalized',
    weight: 0.5,
    polarity: 'benefit',
    active: true,
    color: '#10b981',
    category: 'demand',
    description: 'Households with at least one car',
  },
  {
    id: 'deprivation',
    name: 'Deprivation',
    field: 'two_or_more',
    normalizedField: 'two_or_more_normalized',
    weight: 0.5,
    polarity: 'benefit',
    active: true,
    color: '#f59e0b',
    category: 'equity',
    description: 'Households with two or more deprivations',
  },
  {
    id: 'disabled_population',
    name: 'Disabled Population',
    field: 'disabled_pct',
    normalizedField: 'disabled_pct_normalized',
    weight: 0.5,
    polarity: 'benefit',
    active: true,
    color: '#7c3aed',
    category: 'equity',
    description: 'Share of residents reporting disability',
  },
  {
    id: 'employment_access',
    name: 'Employment Access',
    field: 'employment_30',
    normalizedField: 'employment_30_normalized',
    weight: 0.5,
    polarity: 'benefit',
    active: true,
    color: '#8b5cf6',
    category: 'accessibility',
    description: 'Employment within 30 min by public transport',
  },
  {
    id: 'supermarket_access',
    name: 'Supermarket Access',
    field: 'supermarket_30',
    normalizedField: 'supermarket_30_normalized',
    weight: 0.5,
    polarity: 'benefit',
    active: true,
    color: '#06b6d4',
    category: 'accessibility',
    description: 'Supermarkets within 30 min by public transport',
  },
  {
    id: 'transport_emission',
    name: 'CO₂ Emissions',
    field: 'road_2025',
    normalizedField: 'road_2025_normalized',
    weight: 0.5,
    polarity: 'cost',
    active: true,
    color: '#ef4444',
    category: 'environment',
    description: 'Road transport CO₂ emissions (tonnes/year)',
  },
  {
    id: 'grid_capacity',
    name: 'Grid Headroom',
    field: 'normalised_capacity',
    normalizedField: 'normalised_capacity_normalized',
    weight: 0.5,
    polarity: 'benefit',
    active: true,
    color: '#f97316',
    category: 'infrastructure',
    description: 'Available electricity demand headroom',
  },
  {
    id: 'traffic_index',
    name: 'Traffic Index',
    field: 'motorized_traffic_index',
    normalizedField: 'motorized_traffic_index_normalized',
    weight: 0.5,
    polarity: 'benefit',
    active: true,
    color: '#ec4899',
    category: 'demand',
    description: 'Observed annual motorized traffic count',
  },
  {
    id: 'evcp_distance',
    name: 'EVCP Distance',
    field: 'time_limit',
    normalizedField: 'time_limit_normalized',
    weight: 0.5,
    polarity: 'cost',
    active: true,
    color: '#14b8a6',
    category: 'coverage',
    description: 'Driving time to nearest existing public EVCP',
  },
]

export const CHARGER_SPECS: Record<ChargerType, ChargerSpec> = {
  slow: { type: 'slow', label: 'Slow (3.7 kW)', powerKW: 3.7, costGBP: 1000, installMonths: 1 },
  fast: { type: 'fast', label: 'Fast (7-22 kW)', powerKW: 22, costGBP: 5000, installMonths: 2 },
  rapid: { type: 'rapid', label: 'Rapid (50 kW)', powerKW: 50, costGBP: 40000, installMonths: 4 },
  ultra_rapid: { type: 'ultra_rapid', label: 'Ultra-Rapid (150 kW)', powerKW: 150, costGBP: 100000, installMonths: 6 },
}

export const CATEGORY_COLORS: Record<CriterionCategory, string> = {
  demand: '#3b82f6',
  equity: '#f59e0b',
  accessibility: '#8b5cf6',
  environment: '#ef4444',
  infrastructure: '#f97316',
  coverage: '#14b8a6',
}
