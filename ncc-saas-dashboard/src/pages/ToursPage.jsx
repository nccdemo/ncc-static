import { useEffect, useMemo, useRef, useState } from 'react'

import { api, createTour, deleteTour, getTours, updateTour } from '../lib/api.js'
import { DeleteTourDialog } from '../components/tours/DeleteTourDialog.jsx'
import { TourDialog } from '../components/tours/TourDialog.jsx'
import { Button } from '../components/ui/button.jsx'
import { Badge } from '../components/ui/badge.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table.jsx'

import { getImageUrl } from '../lib/media.js'

function resolveTourImageUrl(url) {
  const resolved = getImageUrl(url)
  return resolved || null
}

function getTourImages(tour) {
  const imgs = Array.isArray(tour?.images) ? tour.images.filter(Boolean) : []
  return imgs
}

export function ToursPage() {
  const fileInputRef = useRef(null)
  const uploadTourIdRef = useRef(null)

  const [tours, setTours] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [actionLoadingId, setActionLoadingId] = useState(null)
  const [uploadingId, setUploadingId] = useState(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState('create') // create | edit
  const [editing, setEditing] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const hasTours = useMemo(() => tours.length > 0, [tours.length])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await getTours()
      const next = Array.isArray(res?.data) ? res.data : []
      setTours(next || [])
    } catch (e) {
      console.error('Tours error:', e)
      setError(e?.message ?? 'Errore caricamento')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function setSuccess(msg) {
    setNotice({ type: 'success', message: msg })
    setTimeout(() => setNotice(null), 2500)
  }

  function setFailure(msg) {
    setNotice({ type: 'error', message: msg })
    setTimeout(() => setNotice(null), 3500)
  }

  function openCreate() {
    setDialogMode('create')
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(tour) {
    setDialogMode('edit')
    setEditing(tour)
    setDialogOpen(true)
  }

  async function handleSubmit(payload) {
    setSubmitting(true)
    setError(null)
    setNotice(null)
    try {
      if (dialogMode === 'edit' && editing?.id) {
        const res = await updateTour(editing.id, payload)
        const updated = res?.data
        if (updated) {
          setTours((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
        }
        setSuccess('Tour updated')
      } else {
        const res = await createTour(payload)
        const created = res?.data
        if (created) {
          setTours((prev) => [created, ...prev])
        }
        setSuccess('Tour created')
      }
      setDialogOpen(false)
    } catch (e) {
      setFailure(e?.response?.data?.detail ?? e?.message ?? 'Errore salvataggio')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id) {
    setActionLoadingId(id)
    setNotice(null)
    try {
      await deleteTour(id)
      setTours((prev) => prev.filter((t) => t.id !== id))
      setSuccess('Tour deleted')
    } catch (e) {
      setFailure(e?.response?.data?.detail ?? e?.message ?? 'Errore delete')
    } finally {
      setActionLoadingId(null)
    }
  }

  async function handleUploadImage(tourId, file) {
    if (!file) return
    setUploadingId(tourId)
    setNotice(null)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await api.post(`/api/tours/${tourId}/upload-image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data', 'X-Role': 'admin' },
      })
      setSuccess('Image uploaded')
      console.log('Upload success', tourId)
      await load()
    } catch (e) {
      setFailure(e?.response?.data?.detail ?? e?.message ?? 'Upload failed')
    } finally {
      setUploadingId(null)
    }
  }

  function openFilePickerForTour(tourId) {
    uploadTourIdRef.current = tourId
    if (fileInputRef.current) fileInputRef.current.click()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Tours</div>
          <div className="text-sm text-muted-foreground">
            Dati reali da API: <span className="font-mono">GET /api/tours</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? 'Aggiorno...' : 'Aggiorna'}
          </Button>
          <Button onClick={openCreate} disabled={loading}>
            Create Tour
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catalogo tour</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? <div className="text-sm text-red-300">{error}</div> : null}
          {notice ? (
            <div
              className={[
                'text-sm rounded-md border px-3 py-2',
                notice.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-red-500/30 bg-red-500/10 text-red-200',
              ].join(' ')}
            >
              {notice.message}
            </div>
          ) : null}

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading tours...</div>
          ) : !tours || tours.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nessun tour disponibile</div>
          ) : null}

          {!tours || tours.length === 0 ? null : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Image</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tours.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">#{t.id}</TableCell>
                  <TableCell>
                    {(() => {
                      const imgs = getTourImages(t)
                      if (imgs.length === 0) {
                        return (
                          <div className="h-[100px] w-[140px] rounded-lg bg-muted/40 ring-1 ring-border flex items-center justify-center">
                            <div className="text-xs text-muted-foreground">No images</div>
                          </div>
                        )
                      }

                      const count = Math.min(5, imgs.length)
                      return (
                        <div className="space-y-2">
                          <div className="grid grid-cols-5 gap-1 w-[140px]">
                            {Array.from({ length: 5 }).map((_, idx) => {
                              const url = imgs[idx]
                              const src = url ? resolveTourImageUrl(url) : null
                              return src ? (
                                <img
                                  key={idx}
                                  src={src}
                                  alt={t.title ?? t.name ?? `Tour #${t.id}`}
                                  className="h-6 w-6 rounded-md object-cover ring-1 ring-border"
                                  loading="lazy"
                                />
                              ) : (
                                <div
                                  key={idx}
                                  className="h-6 w-6 rounded-md bg-muted/40 ring-1 ring-border"
                                />
                              )
                            })}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {count}/5 images
                          </div>
                        </div>
                      )
                    })()}
                  </TableCell>
                  <TableCell className="flex items-center gap-2">
                    <span>{t.title ?? t.name ?? '—'}</span>
                    {t.active === false ? <Badge variant="outline">INACTIVE</Badge> : null}
                  </TableCell>
                  <TableCell>{typeof t.price === 'number' ? `${t.price}€` : '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{t.duration ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex flex-wrap items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loading || actionLoadingId === t.id || uploadingId === t.id}
                        onClick={() => openEdit(t)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          loading ||
                          actionLoadingId === t.id ||
                          uploadingId === t.id ||
                          getTourImages(t).length >= 5
                        }
                        type="button"
                        onClick={() => openFilePickerForTour(t.id)}
                      >
                        {uploadingId === t.id
                          ? 'Uploading...'
                          : getTourImages(t).length >= 5
                            ? 'Max images'
                            : 'Upload Image'}
                      </Button>
                      <DeleteTourDialog
                        disabled={loading || actionLoadingId === t.id || uploadingId === t.id}
                        onConfirm={() => handleDelete(t.id)}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={loading || actionLoadingId === t.id || uploadingId === t.id}
                        >
                          Delete
                        </Button>
                      </DeleteTourDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>

      <TourDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        initialTour={editing}
        onSubmit={handleSubmit}
        submitting={submitting}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          const tourId = uploadTourIdRef.current
          if (!tourId || files.length === 0) return

          const tour = tours.find((x) => x.id === tourId)
          const remaining = Math.max(0, 5 - getTourImages(tour).length)
          const toUpload = files.slice(0, remaining)
          if (toUpload.length === 0) return

          ;(async () => {
            for (const f of toUpload) {
              await handleUploadImage(tourId, f)
            }
          })()
        }}
      />
    </div>
  )
}

