import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Html5QrcodeScanner } from 'html5-qrcode'

import { api } from '../lib/api.js'

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function DriverCheckinPage() {
  const scannerRef = useRef(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [scanningLocked, setScanningLocked] = useState(false)

  const scannerConfig = useMemo(
    () => ({
      fps: 5,
      qrbox: 250,
      rememberLastUsedCamera: true,
      supportedScanTypes: [Html5QrcodeScanner.SCAN_TYPE_CAMERA],
    }),
    [],
  )

  useEffect(() => {
    const scanner = new Html5QrcodeScanner('reader', scannerConfig, false)
    scannerRef.current = scanner

    scanner.render(
      async (decodedText) => {
        if (scanningLocked) return
        setScanningLocked(true)

        try {
          const data = safeJsonParse(decodedText)
          const bookingId = data?.booking_id
          if (!bookingId || typeof bookingId !== 'number') {
            throw new Error('Invalid QR')
          }

          const res = await api.post(`/api/checkin`, { booking_id: bookingId })
          setResult(res?.data ?? null)
          setError(null)
        } catch (e) {
          setError(e?.response?.data?.detail ?? (e?.message === 'Invalid QR' ? 'Invalid QR' : 'Invalid QR'))
          setResult(null)
        } finally {
          setTimeout(() => setScanningLocked(false), 2000)
        }
      },
      () => {},
    )

    return () => {
      scanner
        .clear()
        .catch(() => {})
        .finally(() => {
          scannerRef.current = null
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerConfig, scanningLocked])

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/public/tours" className="text-sm font-semibold tracking-tight hover:text-white">
            NCC Demo
          </Link>
          <div className="text-xs sm:text-sm text-slate-300">Driver check-in</div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-sm sm:p-8">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-center">
            Driver Check-in
          </h1>
          <p className="mt-2 text-center text-sm text-slate-300">
            Point your camera at the QR code to check in a booking.
          </p>

          <div className="mt-6">
            <div
              id="reader"
              className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/40"
            />
          </div>

          {result ? (
            <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-emerald-100">
              <div className="text-sm font-semibold">Check-in OK</div>
              <div className="mt-2 space-y-1 text-sm">
                <div>
                  <span className="text-emerald-100/80">Name:</span> {result.name}
                </div>
                <div>
                  <span className="text-emerald-100/80">Passengers:</span> {result.passengers}
                </div>
                <div>
                  <span className="text-emerald-100/80">Seats:</span> {result.occupied}/{result.capacity}
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-200">
              <div className="text-sm font-semibold">Check-in failed</div>
              <div className="mt-2 text-sm">{error}</div>
            </div>
          ) : null}

          <div className="mt-8 flex justify-center">
            <Link
              to="/public/tours"
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              Back to Tours
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

