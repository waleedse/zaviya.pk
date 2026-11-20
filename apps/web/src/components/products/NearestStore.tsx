'use client'

import { useState } from 'react'

/** Opt-in location: the browser asks only after the click, and the position never leaves the browser (docs/PRODUCT-SEARCH.md section 5). */
export function NearestStore({ branches }: { branches: { store: string; city: string; lat: number; lng: number }[] }) {
  const [msg, setMsg] = useState('')
  const [near, setNear] = useState<{ store: string; city: string; km: number }[]>([])
  if (!branches.length) return null
  const ask = () => {
    if (!navigator.geolocation) return setMsg('Your browser cannot share its location.')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const rad = (d: number) => (d * Math.PI) / 180
        const km = (a: { lat: number; lng: number }) => {
          const dLat = rad(a.lat - p.coords.latitude)
          const dLng = rad(a.lng - p.coords.longitude)
          const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(p.coords.latitude)) * Math.cos(rad(a.lat)) * Math.sin(dLng / 2) ** 2
          return 6371 * 2 * Math.asin(Math.sqrt(h))
        }
        setNear(branches.map((b) => ({ store: b.store, city: b.city, km: km(b) })).sort((a, b) => a.km - b.km).slice(0, 3))
        setMsg('')
      },
      () => setMsg('Location not shared. Nothing was stored.'),
      { timeout: 8000 },
    )
  }
  return (
    <div className="mt-4 rounded border p-3 text-sm">
      <button onClick={ask} className="font-medium text-teal-700 underline">Show the nearest store (uses your location, only in your browser)</button>
      {msg ? <p className="mt-1 text-neutral-600">{msg}</p> : null}
      {near.map((n) => (
        <p key={n.store + n.city} className="mt-1">{n.store}, {n.city}: {n.km.toFixed(1)} km</p>
      ))}
    </div>
  )
}
