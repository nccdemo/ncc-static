/**
 * Stripe checkout session creation failed (HTTP 500 / backend copy).
 */
export function checkoutSessionErrorMessage(err) {
  const status = err?.response?.status
  const detail = err?.response?.data?.detail
  if (status === 500 || detail === 'Pagamento non disponibile') {
    return 'Errore pagamento, riprova'
  }
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((x) => (typeof x === 'string' ? x : x?.msg ?? JSON.stringify(x)))
      .join(', ')
  }
  return err?.message ?? 'Errore pagamento, riprova'
}
