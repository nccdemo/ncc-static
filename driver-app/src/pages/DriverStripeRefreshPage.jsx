import { Link } from 'react-router-dom'

export default function DriverStripeRefreshPage() {
  return (
    <div className="mobile-page" style={{ padding: '1.5rem' }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Stripe</h1>
      <p className="muted" style={{ marginBottom: '1rem' }}>
        Il link di onboarding è scaduto. Torna al lavoro e premi di nuovo &quot;Connect Stripe&quot; (o
        &quot;Continua onboarding&quot;).
      </p>
      <Link to="/driver/today" className="btn btn-primary">
        Torna al lavoro
      </Link>
    </div>
  )
}
