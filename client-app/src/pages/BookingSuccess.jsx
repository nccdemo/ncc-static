import { Navigate, useSearchParams } from 'react-router-dom'

/** Legacy Stripe success URL: keep query and send users to the main success page. */
export default function BookingSuccess() {
  const [params] = useSearchParams()
  const q = params.toString()
  return <Navigate to={q ? `/success?${q}` : '/success'} replace />
}
