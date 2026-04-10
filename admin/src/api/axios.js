import axios from 'axios'

const origin =
  import.meta.env.VITE_API_ORIGIN?.replace(/\/$/, '') || 'http://localhost:8000'

const api = axios.create({
  baseURL: `${origin}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

export default api
