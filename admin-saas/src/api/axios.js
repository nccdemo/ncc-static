import axios from 'axios'

import { redirectToLogin } from '../lib/authRedirect.js'

const baseURL =
  import.meta.env.VITE_API_ORIGIN?.replace(/\/$/, '') || 'http://localhost:8000'

const instance = axios.create({
  baseURL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
})

instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  const fullUrl = `${config.baseURL ?? ''}${config.url ?? ''}`
  console.log('[axios request]', config.method?.toUpperCase(), fullUrl, token ? '(has token)' : '(no token)')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

instance.interceptors.response.use(
  (response) => {
    console.log('[axios response]', response.status, response.config?.method?.toUpperCase(), response.config?.url)
    return response
  },
  (error) => {
    const status = error.response?.status
    const url = String(error.config?.url || '')
    console.log('[axios error]', status, url, error.response?.data)
    if (status === 401) {
      const isLoginRequest =
        url.includes('/api/login') || url.includes('/auth/login')
      if (!isLoginRequest) {
        localStorage.removeItem('token')
        if (!window.location.pathname.startsWith('/login')) {
          redirectToLogin()
        }
      }
    }
    return Promise.reject(error)
  },
)

export default instance
