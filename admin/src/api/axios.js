import axios from 'axios'

import { apiBasePath } from './apiUrl.js'

const api = axios.create({
  baseURL: apiBasePath(),
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
