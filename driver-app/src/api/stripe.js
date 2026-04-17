import api from './axios.js'

export async function connectStripe() {
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : undefined
  const { data } = await api.post(
    '/driver/stripe/connect',
    appOrigin ? { app_origin: appOrigin } : {},
  )
  return data
}

export async function getStripeStatus() {
  const { data } = await api.get('/driver/stripe/status')
  return data
}
