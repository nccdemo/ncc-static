import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createTour } from '../api/client.js'

export default function TourCreate() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [basePrice, setBasePrice] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErr('')
    const price = parseFloat(basePrice.replace(',', '.'))
    if (Number.isNaN(price) || price <= 0) {
      setErr('Inserisci un prezzo base valido')
      return
    }
    setLoading(true)
    try {
      await createTour({
        title: title.trim(),
        description: description.trim() || null,
        base_price: price,
      })
      navigate('/tours')
    } catch (ex) {
      setErr(ex.message || 'Creazione non riuscita')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <header className="page-head">
        <h1>Nuovo tour</h1>
        <p>Titolo, descrizione e prezzo base (€).</p>
      </header>
      <div className="card">
        {err ? <div className="err">{err}</div> : null}
        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="tc-title">Titolo</label>
            <input
              id="tc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={500}
            />
          </div>
          <div className="field">
            <label htmlFor="tc-desc">Descrizione</label>
            <textarea id="tc-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="tc-price">Prezzo base (€)</label>
            <input
              id="tc-price"
              type="text"
              inputMode="decimal"
              placeholder="es. 49.90"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              required
            />
          </div>
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Salvataggio…' : 'Crea tour'}
            </button>
            <Link to="/tours" className="btn btn-ghost">
              Annulla
            </Link>
          </div>
        </form>
      </div>
    </>
  )
}
