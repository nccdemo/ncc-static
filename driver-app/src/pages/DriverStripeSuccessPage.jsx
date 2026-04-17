import { Link } from 'react-router-dom'

export default function DriverStripeSuccessPage() {
  return (
    <div className="mobile-page" style={{ padding: '1.5rem' }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Stripe</h1>
      <p className="muted" style={{ marginBottom: '1rem' }}>
        Onboarding aggiornato. Torna al lavoro per verificare lo stato e accettare pagamenti.
      </p>
      <Link to="/driver/today" className="btn btn-primary">
        Torna al lavoro
      </Link>
    </div>
  )
}
