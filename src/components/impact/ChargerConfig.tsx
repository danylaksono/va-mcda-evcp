import React, { useEffect, useState } from 'react'
import { useScenarioStore } from '@/store/scenario-store'
import { CHARGER_SPECS } from '@/analysis/types'
import type { ChargerType } from '@/analysis/types'
import { formatCurrency } from '@/utils/format'

const addressCache = new Map<string, string>()

function getCacheKey(lat: number, lng: number) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`
}

interface ChargerConfigProps {
  h3Cell: string
  location: { lat: number; lng: number }
  onClose: () => void
}

export function ChargerConfig({ h3Cell, location, onClose }: ChargerConfigProps) {
  const [chargerType, setChargerType] = useState<ChargerType>('fast')
  const [chargerCount, setChargerCount] = useState(4)
  const [address, setAddress] = useState<string | null>(null)
  const [addressLoading, setAddressLoading] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)
  const addPlacement = useScenarioStore((s) => s.addPlacement)

  const spec = CHARGER_SPECS[chargerType]
  const totalCost = spec.costGBP * chargerCount

  useEffect(() => {
    const controller = new AbortController()
    const cacheKey = getCacheKey(location.lat, location.lng)

    const cachedAddress = addressCache.get(cacheKey)
    if (cachedAddress) {
      setAddress(cachedAddress)
      setAddressError(null)
      setAddressLoading(false)
      return () => {
        controller.abort()
      }
    }

    async function reverseGeocode() {
      try {
        setAddressLoading(true)
        setAddressError(null)
        setAddress(null)

        const params = new URLSearchParams({
          format: 'jsonv2',
          lat: location.lat.toString(),
          lon: location.lng.toString(),
          zoom: '18',
          addressdetails: '1',
          'accept-language': 'en',
        })

        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error(`Reverse geocoding failed (${response.status})`)
        }

        const data = (await response.json()) as { display_name?: string }
        if (typeof data.display_name === 'string' && data.display_name.trim().length > 0) {
          addressCache.set(cacheKey, data.display_name)
          setAddress(data.display_name)
        } else {
          setAddressError('Address unavailable for this location')
        }
      } catch (error) {
        if (controller.signal.aborted) return
        setAddressError(error instanceof Error ? error.message : 'Unable to resolve address')
      } finally {
        if (!controller.signal.aborted) {
          setAddressLoading(false)
        }
      }
    }

    reverseGeocode()

    return () => {
      controller.abort()
    }
  }, [location.lat, location.lng])

  function handlePlace() {
    addPlacement(h3Cell, chargerType, chargerCount)
    onClose()
  }

  return (
    <div className="panel w-72 shadow-xl">
      <div className="panel-header flex items-center justify-between">
        <h3 className="panel-title">Place EVCP</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 text-lg leading-none"
        >
          ×
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
            Selected Address
          </div>
          <div className="text-[11px] text-slate-700 bg-slate-50 px-2 py-1 rounded leading-relaxed">
            {addressLoading && 'Looking up address...'}
            {!addressLoading && address && address}
            {!addressLoading && !address && addressError && (
              <span className="text-amber-700">{addressError}</span>
            )}
            {!addressLoading && !address && !addressError && 'Address unavailable'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
            Charger Type
          </label>
          <select
            value={chargerType}
            onChange={(e) => setChargerType(e.target.value as ChargerType)}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm
                       focus:ring-2 focus:ring-brand-500 outline-none"
          >
            {Object.values(CHARGER_SPECS).map((s) => (
              <option key={s.type} value={s.type}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
            Number of Chargers
          </label>
          <input
            type="range"
            min={1}
            max={20}
            value={chargerCount}
            onChange={(e) => setChargerCount(parseInt(e.target.value))}
            className="w-full accent-brand-600"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>1</span>
            <span className="font-bold text-slate-700">{chargerCount}</span>
            <span>20</span>
          </div>
        </div>

        <div className="p-2 bg-slate-50 rounded-lg text-[11px] space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Power per unit:</span>
            <span className="font-bold">{spec.powerKW} kW</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Total capacity:</span>
            <span className="font-bold">{spec.powerKW * chargerCount} kW</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Est. cost:</span>
            <span className="font-bold text-brand-600">{formatCurrency(totalCost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Install time:</span>
            <span className="font-bold">{spec.installMonths} months</span>
          </div>
        </div>

        <button onClick={handlePlace} className="btn-primary w-full text-xs">
          Place {chargerCount} × {spec.label.split('(')[0].trim()}
        </button>
      </div>
    </div>
  )
}
