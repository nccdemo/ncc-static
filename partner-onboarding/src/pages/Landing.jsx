import { Link } from 'react-router-dom'

export default function Landing() {
  return (
    <>
      <section className="hero">
        <span className="hero-badge">Rete NCC</span>
        <h1>Entra nella piattaforma come partner</h1>
        <p className="hero-lead">
          Gestisci corse, referral e pagamenti in un unico ecosistema. Scegli il percorso adatto a te:
          autisti NCC o strutture ricettive che vogliono offrire transfer ai propri ospiti.
        </p>
      </section>

      <div className="card-grid">
        <article className="card">
          <span className="pill pill-driver">Autisti</span>
          <h2>Più corse, meno burocrazia</h2>
          <p>
            Registrati, completa il profilo veicolo e accedi al portale autista: marketplace corse,
            agenda e rendicontazione in un solo posto.
          </p>
          <div className="card-actions">
            <Link to="/driver" className="btn btn-driver">
              Scopri i vantaggi
            </Link>
            <Link to="/register-driver" className="btn btn-ghost">
              Crea account
            </Link>
          </div>
        </article>

        <article className="card">
          <span className="pill pill-bnb">B&amp;B &amp; hospitality</span>
          <h2>Referral e commissioni trasparenti</h2>
          <p>
            Ottieni un codice referral univoco, traccia le prenotazioni generate dai tuoi ospiti e
            monitora i guadagni dalla dashboard partner.
          </p>
          <div className="card-actions">
            <Link to="/bnb" className="btn btn-bnb">
              Scopri i vantaggi
            </Link>
            <Link to="/register-bnb" className="btn btn-ghost">
              Crea account
            </Link>
          </div>
        </article>
      </div>

      <p className="footer-note">
        Hai già un account?{' '}
        <Link to="/login">Accedi</Link> — configura <code style={{ color: 'var(--text-muted)' }}>VITE_API_URL</code>{' '}
        oppure usa il proxy Vite su <code style={{ color: 'var(--text-muted)' }}>/api</code> (
        <code style={{ color: 'var(--text-muted)' }}>VITE_DEV_PROXY_TARGET</code> nel dev server).
      </p>
    </>
  )
}
