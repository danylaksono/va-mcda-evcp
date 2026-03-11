import { cellToBoundary, cellToLatLng, latLngToCell, gridDisk } from 'h3-js'
import type { Feature, FeatureCollection, Polygon } from 'geojson'

interface H3CellScore {
  h3_cell: string
  mcda_score: number
}

/**
 * Converts an H3 cell to a GeoJSON polygon feature.
 */
export function h3ToFeature(
  h3Cell: string,
  properties: Record<string, unknown> = {}
): Feature<Polygon> {
  const boundary = cellToBoundary(h3Cell, true) // [lng, lat] format
  boundary.push(boundary[0]) // close the ring

  return {
    type: 'Feature',
    properties: { h3_cell: h3Cell, ...properties },
    geometry: {
      type: 'Polygon',
      coordinates: [boundary],
    },
  }
}

/**
 * Converts an array of H3 cells with scores to a GeoJSON FeatureCollection.
 */
export function h3ScoresToGeoJSON(cells: H3CellScore[]): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: cells.map((cell) =>
      h3ToFeature(cell.h3_cell, { mcda_score: cell.mcda_score })
    ),
  }
}

/**
 * Gets the center coordinates [lat, lng] of an H3 cell.
 */
export function getH3Center(h3Cell: string): [number, number] {
  return cellToLatLng(h3Cell)
}

/**
 * Gets H3 cell at a given lat/lng and resolution.
 */
export function getH3CellAtPoint(lat: number, lng: number, resolution: number = 10): string {
  return latLngToCell(lat, lng, resolution)
}

/**
 * Gets the k-ring of neighbors around a cell.
 */
export function getH3Neighbors(h3Cell: string, k: number = 1): string[] {
  return gridDisk(h3Cell, k)
}

/**
 * Determines the appropriate H3 display resolution based on map zoom level.
 */
export function zoomToH3Resolution(zoom: number): number {
  if (zoom >= 14) return 10
  if (zoom >= 12) return 9
  if (zoom >= 10) return 8
  if (zoom >= 8) return 7
  if (zoom >= 6) return 6
  return 5
}
