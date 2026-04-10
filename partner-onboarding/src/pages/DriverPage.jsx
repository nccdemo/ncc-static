import { Link } from 'react-router-dom'

export default function DriverPage() {
  return (
    <>
      <h1 className="page-title">Per gli autisti NCC</h1>
      <p className="page-intro">
        La piattaforma collega autisti qualificati a tour, transfer e corse su richiesta. Dopo la
        registrazione accedi al portale operativo per gestire il lavoro quotidiano.
      </p>
      <ul className="benefits">
        <li>Profilo professionale con veicolo e documenti in un unico archivio digitale.</li>
        <li>Accesso al marketplace delle corse disponibili nella tua zona.</li>
        <li>Tracciamento stato servizio, chilometraggio e foglio servizio.</li>
        <li>Allineamento con pagamenti e wallet quando attivi sul tuo account.</li>
      </ul>
      <div className="card-actions">
        <Link to="/register-driver" className="btn btn-primary">
          Registrati come autista
        </Link>
        <Link to="/login" className="btn btn-ghost">
          Hai già un account? Accedi
        </Link>
        <Link to="/" className="btn btn-ghost">
          Torna alla home
        </Link>
      </div>
    </>
  )
}
