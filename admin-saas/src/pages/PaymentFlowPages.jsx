import { Link, useSearchParams } from 'react-router-dom'

export function PaymentSuccessPage() {
  const [params] = useSearchParams()
  const bookingId = params.get('booking_id')
  const quoteId = params.get('quote_id')
  const tourInstanceId = params.get('tour_instance_id')

  let subtitle = 'Il pagamento è stato ricevuto.'
  if (bookingId) subtitle = `Prenotazione #${bookingId} — conferma in corso.`
  else if (quoteId) subtitle = `Preventivo #${quoteId} — conferma in corso.`
  else if (tourInstanceId)
    subtitle = `Tour — istanza #${tourInstanceId}. Riceverai conferma via email.`

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full rounded-3xl border border-white/10 bg-white/5 p-7 shadow-sm sm:p-10">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Pagamento riuscito</h1>
            <p className="mt-3 text-sm sm:text-base text-slate-300">{subtitle}</p>
          </div>
          <div className="mt-8 flex justify-center">
            <Link
              to="/public/tours"
              className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 active:scale-[0.98] sm:w-auto"
            >
              Torna ai tour
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PaymentCancelPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full rounded-3xl border border-white/10 bg-white/5 p-7 shadow-sm sm:p-10">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Pagamento annullato</h1>
            <p className="mt-3 text-sm sm:text-base text-slate-300">
              Non è stato addebitato alcun importo. Puoi chiudere questa pagina o riprovare.
            </p>
          </div>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/public/tours"
              className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 sm:w-auto"
            >
              Torna ai tour
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
