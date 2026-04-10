import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

export default function QrScanner({ onCheckIn, onBack }) {
  const [regionId] = useState(
    () => `qr-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 12)}`
  )
  const scannerRef = useRef(null)
  const onCheckInRef = useRef(onCheckIn)
  const handledRef = useRef(false)
  useEffect(() => {
    onCheckInRef.current = onCheckIn
  }, [onCheckIn])

  const [session, setSession] = useState(0)
  const [result, setResult] = useState(null)

  const stopScanner = async () => {
    const s = scannerRef.current
    scannerRef.current = null
    if (!s) return
    try {
      await s.stop()
    } catch {
      /* ignore */
    }
    try {
      s.clear()
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (result !== null) {
      return () => {}
    }

    let cancelled = false
    handledRef.current = false

    const start = async () => {
      await stopScanner()
      const el = document.getElementById(regionId)
      if (!el || cancelled) return

      const scanner = new Html5Qrcode(regionId)
      scannerRef.current = scanner
      const qrbox = Math.min(280, Math.floor(window.innerWidth - 48))

      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: qrbox, height: qrbox } },
          (decodedText) => {
            if (cancelled || handledRef.current) return
            handledRef.current = true
            try {
              scanner.pause(true)
            } catch {
              /* ignore */
            }
            Promise.resolve(onCheckInRef.current(decodedText.trim())).then((r) => {
              if (!cancelled) setResult(r)
            })
          },
          () => {}
        )
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          setResult({
            variant: 'error',
            message:
              e?.message ||
              'Camera not available. Use HTTPS or allow camera access.',
          })
        }
      }
    }

    start()

    return () => {
      cancelled = true
      stopScanner()
    }
  }, [regionId, session, result])

  const scanAgain = async () => {
    await stopScanner()
    setResult(null)
    setSession((s) => s + 1)
  }

  const close = async () => {
    await stopScanner()
    onBack()
  }

  const variantClass =
    result?.variant === 'success'
      ? 'banner success'
      : result?.variant === 'warn'
        ? 'banner warn'
        : result?.variant === 'error'
          ? 'banner error'
          : ''

  return (
    <div className="screen scanner-screen">
      <div className="toolbar">
        <button type="button" className="btn btn-ghost" onClick={close}>
          ← Close
        </button>
      </div>

      <h1 className="sheet-title">Scan QR</h1>
      <p className="muted sheet-sub">Point the camera at the passenger code</p>

      <div className="qr-wrap">
        <div id={regionId} className="qr-region" />
      </div>

      {result && (
        <div className={`scan-result ${variantClass}`} role="status">
          {result.message}
        </div>
      )}

      {result && (
        <div className="scan-actions">
          <button type="button" className="btn btn-primary btn-block" onClick={scanAgain}>
            Scan another
          </button>
        </div>
      )}
    </div>
  )
}
