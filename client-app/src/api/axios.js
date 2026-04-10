import axios from 'axios'

/** Proxied to backend: vite → http://localhost:8000/api */
const instance = axios.create({
  baseURL: '/api',
})

export default instance
