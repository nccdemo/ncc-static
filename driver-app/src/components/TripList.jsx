export default function TripList({ trips, loading, error, onSelect, onOpenScan }) {
  return (
    <div className="screen">
      <div className="screen-card">
        <div className="screen-head">
          <h1>Active trips</h1>
          <p className="muted">Assigned or on trip</p>
        </div>

        <button type="button" className="btn btn-primary btn-scan-top" onClick={onOpenScan}>
          Scan boarding QR
        </button>

        {loading && <p className="muted center-pad">Loading trips…</p>}
        {error && <p className="banner error">{error}</p>}

        {!loading && !error && trips.length === 0 && (
          <p className="muted center-pad">No active trips right now</p>
        )}

        <ul className="trip-cards">
          {trips.map((t) => (
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
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
