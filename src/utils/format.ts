/**
 * Formats a number with SI suffixes (k, M, B).
 */
export function formatCompact(value: number, decimals: number = 1): string {
  if (Math.abs(value) >= 1e9) return (value / 1e9).toFixed(decimals) + 'B'
  if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(decimals) + 'M'
  if (Math.abs(value) >= 1e3) return (value / 1e3).toFixed(decimals) + 'k'
  return value.toFixed(decimals)
}

/**
 * Formats a number as currency (GBP).
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Formats a percentage value.
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`
}

/**
 * Formats energy values with appropriate units.
 */
export function formatEnergy(kwh: number): string {
  if (kwh >= 1e6) return `${(kwh / 1e6).toFixed(1)} GWh`
  if (kwh >= 1e3) return `${(kwh / 1e3).toFixed(1)} MWh`
  return `${kwh.toFixed(0)} kWh`
}

/**
 * Formats CO2 values.
 */
export function formatCO2(tonnes: number): string {
  if (tonnes >= 1e3) return `${(tonnes / 1e3).toFixed(1)}k tCO₂`
  return `${tonnes.toFixed(1)} tCO₂`
}

/**
 * Formats a timestamp to a readable date string.
 */
export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}
