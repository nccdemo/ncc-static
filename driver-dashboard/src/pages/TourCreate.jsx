import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createTour, uploadTourImage } from '../services/tours.js'

const MAX_IMAGES = 5

export default function TourCreate() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [basePrice, setBasePrice] = useState('')
  const [images, setImages] = useState([])
  const [previewUrls, setPreviewUrls] = useState([])
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const imageInputRef = useRef(null)

  useEffect(() => {
    if (images.length === 0) {
      setPreviewUrls([])
      return
    }
    const urls = images.map((f) => URL.createObjectURL(f))
    setPreviewUrls(urls)
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [images])

  function handleFilesChange(e) {
    const picked = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'))
    if (picked.length === 0) return
    setImages((prev) => {
      const room = MAX_IMAGES - prev.length
      if (room <= 0) {
        setErr(`Massimo ${MAX_IMAGES} immagini. Rimuovine una per aggiungerne altre.`)
        return prev
      }
      const next = [...prev, ...picked.slice(0, room)]
      if (picked.length > room) {
        setErr(
          `Sono state aggiunte solo ${room} immagine/i (massimo ${MAX_IMAGES} complessive).`,
        )
      }
      return next
    })
    e.target.value = ''
  }

  function removeImageAt(index) {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErr('')
    setSuccess('')
    const price = parseFloat(basePrice.replace(',', '.'))
    if (Number.isNaN(price) || price <= 0) {
      setErr('Inserisci un prezzo base valido')
      return
    }
    setIsSubmitting(true)
    try {
      const tour = await createTour({
        title: title.trim(),
        description: description.trim() || null,
        base_price: price,
      })
      if (images.length > 0 && tour?.id != null) {
        try {
          for (const file of images) {
            await uploadTourImage(tour.id, file)
          }
        } catch (uploadEx) {
          setErr(uploadEx.message || 'Caricamento immagini non riuscito')
          setSuccess('Tour creato; puoi aggiungere le immagini più tardi dalla lista tour.')
          setTitle('')
          setDescription('')
          setBasePrice('')
          setImages([])
          if (imageInputRef.current) imageInputRef.current.value = ''
          window.setTimeout(() => navigate('/tours'), 1200)
          return
        }
      }
      setSuccess('Tour creato con successo')
      setTitle('')
      setDescription('')
      setBasePrice('')
      setImages([])
      if (imageInputRef.current) imageInputRef.current.value = ''
      window.setTimeout(() => {
        navigate('/tours')
      }, 400)
    } catch (ex) {
      setErr(ex.message || 'Creazione non riuscita')
    } finally {
      setIsSubmitting(false)
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
        {success ? <div className="ok">{success}</div> : null}
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
          <div className="field">
            <label htmlFor="tc-images">
              Immagini tour (opzionale, max {MAX_IMAGES})
            </label>
            <input
              ref={imageInputRef}
              id="tc-images"
              type="file"
              multiple
              accept="image/*"
              onChange={handleFilesChange}
            />
            <p className="muted" style={{ marginTop: 6, fontSize: '0.9em' }}>
              {images.length}/{MAX_IMAGES} selezionate
            </p>
            {previewUrls.length > 0 ? (
              <div
                style={{
                  marginTop: 12,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                  gap: 10,
                  maxWidth: '100%',
                }}
              >
                {previewUrls.map((url, i) => (
                  <div
                    key={`${url}-${i}`}
                    style={{
                      position: 'relative',
                      borderRadius: 8,
                      overflow: 'hidden',
                      aspectRatio: '1',
                      border: '1px solid var(--border, #ddd)',
                    }}
                  >
                    <img
                      src={url}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        padding: '2px 8px',
                        fontSize: 12,
                        minHeight: 0,
                        background: 'rgba(0,0,0,0.55)',
                        color: '#fff',
                        border: 'none',
                      }}
                      onClick={() => removeImageAt(i)}
                      aria-label="Rimuovi immagine"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Salvataggio…' : 'Crea tour'}
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
