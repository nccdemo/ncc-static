import { useState } from 'react'
import { Link } from 'react-router-dom'
import { registerDriver } from '../api'
import { persistAuth, redirectAfterAuth } from '../session'

const initial = {
  email: '',
  password: '',
  name: '',
  phone: '',
  plate_number: '',
  vehicle_type: '',
  seats: '',
  driver_license_number: '',
  ncc_license_number: '',
  insurance_number: '',
}

export default function RegisterDriverPage() {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function setField(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const body = {
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim(),
        phone: form.phone.trim(),
        plate_number: form.plate_number.trim() || null,
        vehicle_type: form.vehicle_type.trim() || null,
        seats: form.seats === '' ? null : Number(form.seats),
        driver_license_number: form.driver_license_number.trim() || null,
        ncc_license_number: form.ncc_license_number.trim() || null,
        insurance_number: form.insurance_number.trim() || null,
      }
      const data = await registerDriver(body)
      persistAuth({
        access_token: data.access_token,
        role: data.role,
        referral_code: data.referral_code,
      })
      redirectAfterAuth(data.role, data.access_token)
    } catch (err) {
      setError(err.message || 'Registrazione non riuscita')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="form-card" style={{ maxWidth: '520px' }}>
      <h1>Registrazione autista</h1>
      <p className="form-sub">
        Crea un utente con ruolo <strong>driver</strong> e il profilo autista collegato. Minimo 8
        caratteri per la password.
      </p>
      {error ? <div className="form-error">{error}</div> : null}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="rd-email">Email</label>
          <input id="rd-email" type="email" value={form.email} onChange={setField('email')} required />
        </div>
        <div className="field">
          <label htmlFor="rd-password">Password</label>
          <input
            id="rd-password"
            type="password"
            minLength={8}
            value={form.password}
            onChange={setField('password')}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="rd-name">Nome e cognome</label>
          <input id="rd-name" value={form.name} onChange={setField('name')} required />
        </div>
        <div className="field">
          <label htmlFor="rd-phone">Telefono</label>
          <input id="rd-phone" type="tel" value={form.phone} onChange={setField('phone')} required />
        </div>
        <div className="field">
          <label htmlFor="rd-plate">Targa (opzionale)</label>
          <input id="rd-plate" value={form.plate_number} onChange={setField('plate_number')} />
        </div>
        <div className="field">
          <label htmlFor="rd-vtype">Tipo veicolo (opzionale)</label>
          <input id="rd-vtype" value={form.vehicle_type} onChange={setField('vehicle_type')} />
        </div>
        <div className="field">
          <label htmlFor="rd-seats">Posti (opzionale)</label>
          <input
            id="rd-seats"
            type="number"
            min={1}
            max={60}
            value={form.seats}
            onChange={setField('seats')}
          />
        </div>
        <div className="field">
          <label htmlFor="rd-patente">Patente (opzionale)</label>
          <input
            id="rd-patente"
            value={form.driver_license_number}
            onChange={setField('driver_license_number')}
          />
        </div>
        <div className="field">
          <label htmlFor="rd-ncc">Licenza NCC (opzionale)</label>
          <input
            id="rd-ncc"
            value={form.ncc_license_number}
            onChange={setField('ncc_license_number')}
          />
        </div>
        <div className="field">
          <label htmlFor="rd-ins">Assicurazione (opzionale)</label>
          <input
            id="rd-ins"
            value={form.insurance_number}
            onChange={setField('insurance_number')}
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Registrazione…' : 'Registrati e continua'}
          </button>
          <Link to="/login" className="btn btn-ghost">
            Ho già un account
          </Link>
        </div>
      </form>
    </div>
  )
}
