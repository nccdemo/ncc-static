import { Link } from 'react-router-dom'

export default function BnbPage() {
  return (
    <>
      <section className="hero">
        <span className="hero-badge pill pill-bnb">Partner B&amp;B</span>
        <h1>Guadagna con ogni prenotazione dei tuoi ospiti</h1>
        <p className="hero-lead">
          Condividi il tuo <strong>codice referral</strong> e ricevi una quota sulle prenotazioni
          confermate. Un modo semplice e trasparente per monetizzare i transfer, senza cambiare le
          tue abitudini di accoglienza.
        </p>
        <div className="card-actions" style={{ justifyContent: 'center' }}>
          <Link to="/register-bnb" className="btn btn-primary">
            Register now
          </Link>
          <Link to="/login" className="btn btn-ghost">
            Hai già un account? Accedi
          </Link>
        </div>
      </section>

      <section className="card-grid" aria-label="Perché conviene">
        <article className="card">
          <h2>Codice dedicato</h2>
          <p>
            Alla registrazione ottieni un codice univoco (es. <strong>AB12CD</strong>) da inserire
            nei link che condividi con gli ospiti.
          </p>
        </article>
        <article className="card">
          <h2>Ricavi chiari</h2>
          <p>
            Tracciamento e conteggio automatico delle prenotazioni collegate al tuo referral, con
            una dashboard separata e pulita.
          </p>
        </article>
        <article className="card">
          <h2>Esperienza travel</h2>
          <p>
            Un servizio affidabile per i tuoi ospiti: prenotazione rapida, pagamento sicuro e
            conferma immediata.
          </p>
        </article>
      </section>

      <div className="card-actions" style={{ marginTop: '2rem' }}>
        <Link to="/" className="btn btn-ghost">
          Torna alla home
        </Link>
      </div>
    </>
  )
}
