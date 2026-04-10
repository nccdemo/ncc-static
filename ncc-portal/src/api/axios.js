import axios from 'axios'

import { getToken } from '../auth/token.js'

const baseURL = import.meta.env.VITE_API_BASE?.replace(/\/$/, '') || '/api'

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api
