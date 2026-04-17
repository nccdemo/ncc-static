import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Input from '../components/Input.jsx'
import { createMyTour, uploadTourImage } from '../api/driverTours.js'

export default function CreateTourPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [city, setCity] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setErr('')
    const p = Number(price)
    if (!title.trim() || !Number.isFinite(p) || p <= 0) {
      setErr('Name and a valid price are required.')
      return
    }
    setBusy(true)
    try {
      const { data: tour } = await createMyTour({
        title: title.trim(),
        description: description.trim() || undefined,
        base_price: p,
        city: city.trim() || undefined,
      })
      const id = tour?.id
      if (id == null) throw new Error('Invalid response')
      if (file && file.size > 0) {
        await uploadTourImage(id, file)
      }
      navigate(`/driver/tours/${id}`, { replace: true })
    } catch (e) {
      const d = e?.response?.data?.detail
      setErr(typeof d === 'string' ? d : e?.message || 'Could not create tour')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[60vh] bg-neutral-50 px-4 py-6">
      <div className="mx-auto max-w-md">
        <button
          type="button"
          onClick={() => navigate('/driver/tours')}
          className="mb-4 text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          Back to tours
        </button>
        <h1 className="text-xl font-bold text-neutral-900">New tour</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Create an experience. Add a cover photo after saving (upload runs with create).
        </p>

        <Card className="mt-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Input
              label="Tour name"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <div className="w-full">
              <label htmlFor="desc" className="mb-1.5 block text-sm font-medium text-neutral-700">
                Description
              </label>
              <textarea
                id="desc"
                name="description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
              />
            </div>
            <Input
              label="Price (EUR)"
              name="price"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
            <Input
              label="Location"
              name="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City or area"
            />
            <div className="w-full">
              <label htmlFor="photo" className="mb-1.5 block text-sm font-medium text-neutral-700">
                Cover image
              </label>
              <input
                id="photo"
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700"
              />
            </div>
            {err ? <p className="text-sm text-red-600">{err}</p> : null}
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Create tour'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
