import { apiUrl } from './apiUrl.js'
import api from './axios.js'

/** @typedef {{ id: number; title: string; description?: string; price: number; city?: string; images?: string[]; active?: boolean }} TourDto */

export function listMyTours() {
  return api.get('/driver/tours')
}

export function getMyTour(tourId) {
  return api.get(`/driver/tours/${tourId}`)
}

/**
 * @param {{ title: string; description?: string; base_price: number; city?: string }} body
 */
export function createMyTour(body) {
  return api.post('/driver/tours', body)
}

export function uploadTourImage(tourId, file) {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(`/driver/tours/${tourId}/upload-image`, fd)
}

export function listTourInstances(tourId) {
  return api.get(`/tours/${tourId}/instances`)
}

/**
 * @param {{ tour_id: number; date: string; time?: string; available_seats: number }} body
 */
export function createDriverInstance(body) {
  return api.post('/driver/tour-instances', body)
}

/** First tour image URL for <img src> (relative /uploads or absolute). */
export function tourCoverSrc(images) {
  const raw = Array.isArray(images) ? images.find(Boolean) : null
  if (!raw || typeof raw !== 'string') return ''
  const s = raw.trim()
  if (!s) return ''
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  return apiUrl(s.startsWith('/') ? s : `/${s}`)
}
