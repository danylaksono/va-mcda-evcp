import type { ChargerType, EVCPPlacement, ImpactEstimate } from './types'
import { CHARGER_SPECS } from './types'

const GRID_EMISSION_FACTOR = 0.233 // kgCO₂/kWh (UK 2024 average)
const ICE_EMISSION_FACTOR = 0.21 // kgCO₂/km
const EV_EFFICIENCY = 0.18 // kWh/km
const OPERATING_HOURS_PER_DAY = 16
const DIVERSITY_FACTOR = 0.7
const ELECTRICITY_PRICE_GBP = 0.35 // per kWh
const AVG_SESSION_KWH = 30

interface CellData {
  popDensity: number
  carOwnership: number
  deprivation: number
  gridCapacity: number
  existingEVCPDistance: number
}

/**
 * Estimates daily demand for EV charging at a given location
 * based on population density and car ownership.
 */
export function estimateDailyDemand(cellData: CellData): number {
  const evAdoptionRate = 0.15
  const dailyChargingRate = 0.3
  const estimatedPopulation = cellData.popDensity * 0.015 // H3 r10 cell ~0.015 km²
  const estimatedCars = estimatedPopulation * cellData.carOwnership * 0.4
  const evCount = estimatedCars * evAdoptionRate
  const dailySessions = evCount * dailyChargingRate

  return dailySessions * AVG_SESSION_KWH
}

/**
 * Calculates utilization factor: U = min(1, D / (N × P × H))
 */
export function calculateUtilization(
  dailyDemandKWh: number,
  chargerCount: number,
  powerKW: number,
  operatingHours: number = OPERATING_HOURS_PER_DAY
): number {
  const maxCapacity = chargerCount * powerKW * operatingHours
  if (maxCapacity === 0) return 0
  return Math.min(1, dailyDemandKWh / maxCapacity)
}

/**
 * Estimates annual energy delivered: E = N × P × H × U × 365
 */
export function estimateAnnualEnergy(
  chargerCount: number,
  powerKW: number,
  utilization: number,
  operatingHours: number = OPERATING_HOURS_PER_DAY
): number {
  return chargerCount * powerKW * operatingHours * utilization * 365
}

/**
 * Estimates annual CO₂ savings from displaced ICE vehicle trips.
 * Carbon saved = energy delivered × (ICE emissions avoided - EV grid emissions)
 */
export function estimateCarbonSaved(annualEnergyKWh: number): number {
  const kmDriven = annualEnergyKWh / EV_EFFICIENCY
  const iceEmissions = kmDriven * ICE_EMISSION_FACTOR
  const evEmissions = annualEnergyKWh * GRID_EMISSION_FACTOR / 1000
  return Math.max(0, (iceEmissions - evEmissions) / 1000) // tonnes
}

/**
 * Calculates peak demand impact on the local grid.
 */
export function calculatePeakDemand(
  chargerCount: number,
  powerKW: number,
  diversityFactor: number = DIVERSITY_FACTOR
): number {
  return chargerCount * powerKW * diversityFactor
}

/**
 * Calculates headroom impact as percentage of available capacity.
 */
export function calculateHeadroomImpact(
  peakDemandKW: number,
  gridCapacityNormalized: number
): number {
  const estimatedCapacityKW = gridCapacityNormalized * 5000 // rough estimate
  if (estimatedCapacityKW === 0) return 100
  return (peakDemandKW / estimatedCapacityKW) * 100
}

/**
 * Estimates population served within the H3 cell and neighbors.
 */
export function estimatePopulationServed(popDensity: number): number {
  const cellAreaKm2 = 0.015 // H3 r10 cell area
  const serviceAreaMultiplier = 7 // cell + 6 neighbors
  return Math.round(popDensity * cellAreaKm2 * serviceAreaMultiplier)
}

/**
 * Comprehensive impact estimation for an EVCP placement.
 */
export function estimateImpact(
  placement: EVCPPlacement,
  cellData: CellData
): ImpactEstimate {
  const spec = CHARGER_SPECS[placement.chargerType]
  const dailyDemand = estimateDailyDemand(cellData)
  const utilization = calculateUtilization(
    dailyDemand,
    placement.chargerCount,
    spec.powerKW
  )
  const annualEnergy = estimateAnnualEnergy(
    placement.chargerCount,
    spec.powerKW,
    utilization
  )
  const carbonSaved = estimateCarbonSaved(annualEnergy)
  const peakDemand = calculatePeakDemand(placement.chargerCount, spec.powerKW)
  const headroomImpact = calculateHeadroomImpact(peakDemand, cellData.gridCapacity)

  return {
    energyDeliveredKWh: annualEnergy,
    carbonSavedTonnes: carbonSaved,
    annualRevenue: annualEnergy * ELECTRICITY_PRICE_GBP,
    peakDemandKW: peakDemand,
    headroomImpactPct: headroomImpact,
    populationServed: estimatePopulationServed(cellData.popDensity),
    deprivationScore: cellData.deprivation,
    installCostGBP: spec.costGBP * placement.chargerCount,
    utilizationFactor: utilization,
  }
}

/**
 * Aggregates impact estimates across multiple placements.
 */
export function aggregateImpacts(impacts: ImpactEstimate[]): ImpactEstimate {
  if (impacts.length === 0) {
    return {
      energyDeliveredKWh: 0,
      carbonSavedTonnes: 0,
      annualRevenue: 0,
      peakDemandKW: 0,
      headroomImpactPct: 0,
      populationServed: 0,
      deprivationScore: 0,
      installCostGBP: 0,
      utilizationFactor: 0,
    }
  }

  return {
    energyDeliveredKWh: impacts.reduce((s, i) => s + i.energyDeliveredKWh, 0),
    carbonSavedTonnes: impacts.reduce((s, i) => s + i.carbonSavedTonnes, 0),
    annualRevenue: impacts.reduce((s, i) => s + i.annualRevenue, 0),
    peakDemandKW: impacts.reduce((s, i) => s + i.peakDemandKW, 0),
    headroomImpactPct: impacts.reduce((s, i) => s + i.headroomImpactPct, 0) / impacts.length,
    populationServed: impacts.reduce((s, i) => s + i.populationServed, 0),
    deprivationScore: impacts.reduce((s, i) => s + i.deprivationScore, 0) / impacts.length,
    installCostGBP: impacts.reduce((s, i) => s + i.installCostGBP, 0),
    utilizationFactor: impacts.reduce((s, i) => s + i.utilizationFactor, 0) / impacts.length,
  }
}
