import axios from 'axios'

import { apiBasePath } from './apiUrl.js'
import { getToken } from '../auth/token.js'

const baseURL = apiBasePath()

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
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  return config
})

export default api
