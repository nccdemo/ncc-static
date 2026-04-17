import { apiFetch, apiJson } from './api.js'

export function getTours() {
  return apiJson('/driver/tours')
}

export function createTour(data) {
  return apiJson('/driver/tours', { method: 'POST', body: JSON.stringify(data) })
}

async function readErrorBody(res) {
  try {
    const data = await res.json()
    if (typeof data?.detail === 'string') return data.detail
    if (Array.isArray(data?.detail)) {
      return data.detail.map((d) => d?.msg || JSON.stringify(d)).join(', ')
    }
    return res.statusText || 'Request failed'
  } catch {
    return res.statusText || 'Request failed'
  }
}

/** POST multipart ``file`` to ``/api/driver/tours/:id/upload-image`` (Bearer from storage). */
export async function uploadTourImage(tourId, file) {
  const formDataImage = new FormData()
  formDataImage.append('file', file)
  const res = await apiFetch(`/driver/tours/${tourId}/upload-image`, {
    method: 'POST',
    body: formDataImage,
  })
  if (!res.ok) throw new Error(await readErrorBody(res))
  if (res.status === 204) return null
  return res.json()
}

