const BASE_URL = 'http://127.0.0.1:8000'

export function getImageUrl(url) {
  if (!url) return ''
  if (typeof url !== 'string') return ''
  if (url.startsWith('http')) return url
  return BASE_URL + url
}

