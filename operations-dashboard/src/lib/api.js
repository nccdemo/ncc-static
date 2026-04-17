import axios from 'axios'

const ADMIN_AUTH_KEY = 'ncc_dispatch_admin_auth'

export function readDispatchAdminSession() {
  try {
    const raw = localStorage.getItem(ADMIN_AUTH_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.token || parsed?.role !== 'admin') return null
    return parsed
  } catch {
    return null
  }
}

export function saveDispatchAdminSession(session) {
  localStorage.setItem(ADMIN_AUTH_KEY, JSON.stringify(session))
}

export function clearDispatchAdminSession() {
  localStorage.removeItem(ADMIN_AUTH_KEY)
}

export const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const s = readDispatchAdminSession()
  if (s?.token) {
    config.headers.Authorization = `Bearer ${s.token}`
  }
  return config
})
