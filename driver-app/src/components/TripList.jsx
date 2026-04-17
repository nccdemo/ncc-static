import { cancelTrip } from '../api/driverTrips.js'
import { formatApiDetail } from '../lib/api.js'

export default function TripList({
  trips,
  loading,
  error,
  onSelect,
  driverId,
  onTripsChanged,
}) {
  const handleCancel = async (event, trip) => {
    event.preventDefault()
    event.stopPropagation()
    if (driverId == null || trip?.driver_id == null || Number(trip.driver_id) !== Number(driverId)) {
      return
    }
    if (String(trip.trip_status || '').toLowerCase() !== 'accepted') {
      return
    }
    // eslint-disable-next-line no-alert
    if (!window.confirm('Cancel this trip? You will be unassigned and the trip will be marked cancelled.')) {
      return
    }
    try {
      await cancelTrip(trip.id)
      await onTripsChanged?.()
    } catch (e) {
      const msg =
        formatApiDetail(e?.response?.data?.detail) ||
        (typeof e?.message === 'string' ? e.message : '') ||
        'Could not cancel trip'
      // eslint-disable-next-line no-alert
      alert(msg)
    }
  }

  return (
    <div className="screen">
      <div className="screen-card">
        <div className="screen-head">
          <h1>Active trips</h1>
          <p className="muted">Assigned or on trip</p>
        </div>

        <p className="muted center-pad" style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
          Per il check-in passeggeri apri il viaggio e usa <strong>Scan QR</strong> dal foglio servizio — il codice
          deve corrispondere a una prenotazione di quel trip.
        </p>

        {loading && <p className="muted center-pad">Loading trips…</p>}
        {error && <p className="banner error">{error}</p>}

        {!loading && !error && trips.length === 0 && (
          <p className="muted center-pad">No active trips right now</p>
        )}

        <ul className="trip-cards">
          {trips.map((t) => {
            const showCancel =
              driverId != null &&
              Number(t.driver_id) === Number(driverId) &&
              String(t.trip_status || '').toLowerCase() === 'accepted'
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className="trip-card"
                  onClick={() => onSelect(t.id)}
                >
                  <div className="trip-card-top">
                    <span className="trip-id">Trip #{t.id}</span>
                    <span className={`pill status-${t.status}`}>{t.status}</span>
                  </div>
                  <div className="trip-meta">
                    {t.service_date && (
                      <span className="meta-line">Date: {t.service_date}</span>
                    )}
                    {t.vehicle && (
                      <span className="meta-line">
                        {t.vehicle.name}
                        {t.vehicle.plate ? ` · ${t.vehicle.plate}` : ''}
                      </span>
                    )}
                    {t.bookings?.length > 0 && (
                      <span className="meta-line muted-sm">
                        {t.bookings.length} booking{t.bookings.length !== 1 ? 's' : ''} ·{' '}
                        {t.bookings.filter((b) => b.checked_in).length}/{t.bookings.length} checked in
                      </span>
                    )}
                  </div>
                  {showCancel ? (
                    <div className="trip-card-actions" style={{ marginTop: '0.75rem' }}>
                      <button
                        type="button"
                        className="btn btn-outline btn-block btn-tiny"
                        onClick={(ev) => handleCancel(ev, t)}
                      >
                        Cancel trip
                      </button>
                    </div>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
