import { useEffect, useRef, useState } from 'react'

import { api } from '../lib/api.js'
import { Input } from './ui/input.jsx'

const DEBOUNCE_MS = 320
const MIN_QUERY_LEN = 2

/**
 * Address autocomplete via backend proxy to Nominatim (`GET /api/geocoding/search`).
 */
export function PlacesAddressField({
  value,
  onChange,
  onPlaceResolved,
  disabled,
  className,
  inputClassName,
  required,
  ...rest
}) {
  const rootRef = useRef(null)
  const debounceRef = useRef(null)
  const requestIdRef = useRef(0)

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])

  useEffect(() => {
    function onDocDown(ev) {
      const el = rootRef.current
      if (!el || el.contains(ev.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function scheduleSearch(q) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = String(q || '').trim()
    if (trimmed.length < MIN_QUERY_LEN) {
      setItems([])
      setLoading(false)
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(() => runSearch(trimmed), DEBOUNCE_MS)
  }

  async function runSearch(q) {
    const id = ++requestIdRef.current
    setLoading(true)
    setOpen(true)
    try {
      const { data } = await api.get('/api/geocoding/search', { params: { q } })
      if (id !== requestIdRef.current) return
      const list = Array.isArray(data) ? data : []
      setItems(list)
    } catch {
      if (id !== requestIdRef.current) return
      setItems([])
    } finally {
      if (id === requestIdRef.current) setLoading(false)
    }
  }

  function pickSuggestion(item) {
    setOpen(false)
    setItems([])
    const label = item?.label != null ? String(item.label) : ''
    const lat = item?.lat
    const lng = item?.lng
    onChange(label)
    onPlaceResolved?.({
      address: label,
      lat: lat != null && Number.isFinite(Number(lat)) ? Number(lat) : null,
      lng: lng != null && Number.isFinite(Number(lng)) ? Number(lng) : null,
    })
  }

  return (
    <div ref={rootRef} className={`relative ${className || ''}`}>
      <Input
        value={value}
        disabled={disabled}
        required={required}
        className={inputClassName}
        autoComplete="off"
        onChange={(e) => {
          const v = e.target.value
          onChange(v)
          onPlaceResolved?.(null)
          scheduleSearch(v)
        }}
        onFocus={() => {
          if (items.length > 0) setOpen(true)
        }}
        {...rest}
      />
      {open && (loading || items.length > 0) ? (
        <ul
          className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-white/10 bg-slate-950 py-1 text-sm shadow-lg"
          role="listbox"
        >
          {loading && items.length === 0 ? (
            <li className="px-3 py-2 text-slate-400">Ricerca…</li>
          ) : null}
          {items.map((it, idx) => (
            <li
              key={`${it.lat},${it.lng},${idx}`}
              className="border-b border-white/5 last:border-0"
            >
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-slate-100 hover:bg-white/10"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickSuggestion(it)}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
