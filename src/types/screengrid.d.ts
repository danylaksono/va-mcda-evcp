declare module 'screengrid' {
  import type maplibregl from 'maplibre-gl'

  export interface ScreenGridLayerOptions<T = unknown> {
    id?: string
    data?: T[]
    getPosition?: (datum: T) => [number, number]
    getWeight?: (datum: T) => number
    cellSizePixels?: number
    glyphSize?: number
    showBackground?: boolean
    enableGlyphs?: boolean
    aggregationFunction?: string | ((cellData: unknown[]) => number)
    normalizationFunction?: string | ((grid: unknown[], value: number, index: number, context: unknown) => number)
    colorScale?: (value: number) => [number, number, number, number]
    onDrawCell?: (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      normalizedValue: number,
      cellInfo: any
    ) => void
    onHover?: (payload: { cell: any; event: maplibregl.MapMouseEvent }) => void
    onClick?: (payload: { cell: any; event: maplibregl.MapMouseEvent }) => void
  }

  export class ScreenGridLayerGL<T = unknown> {
    constructor(options?: ScreenGridLayerOptions<T>)
    readonly id: string
    readonly type: 'custom'
    readonly renderingMode: '2d'
    onAdd(map: maplibregl.Map, gl: WebGLRenderingContext): void
    prerender?(): void
    render(): void
    onRemove(): void
    setData(data: T[]): void
    setConfig(updates: Partial<ScreenGridLayerOptions<T>>): void
    getCellAt(point: { x: number; y: number }): unknown | null
  }
}
