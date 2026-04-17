import axios from 'axios'

import { apiBasePath } from './apiUrl.js'

/** Same-origin ``/api`` with Vite proxy when ``VITE_API_URL`` is unset. */
const instance = axios.create({
  baseURL: apiBasePath(),
})

export default instance
