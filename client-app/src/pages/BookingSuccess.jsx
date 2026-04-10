import { Link, useSearchParams } from 'react-router-dom'

export default function BookingSuccess() {
  const [params] = useSearchParams()
  const sessionId = params.get('session_id') || params.get('sessionId') || ''

  return (
    <div className="page-narrow">
      <h1 style={{ marginTop: 0 }}>Pagamento riuscito</h1>
      <p>
        Grazie! La prenotazione viene confermata dal nostro sistema dopo il pagamento. Riceverai i dettagli
        all&apos;indirizzo email usato al checkout.
      </p>
      {sessionId ? (
        <p className="landing-muted" style={{ textAlign: 'left', wordBreak: 'break-all' }}>
          Riferimento sessione: <code>{sessionId}</code>
        </p>
      ) : null}
      <p style={{ marginTop: '1.5rem' }}>
        <Link to="/tours">← Altri tour</Link>
        {' · '}
        <Link to="/">Home</Link>
      </p>
    </div>
  )
}
