import { useMemo, useState } from 'react'
import { Button } from '../components/landing/Button.jsx'
import { Container } from '../components/landing/Container.jsx'
import { FeatureCard } from '../components/landing/FeatureCard.jsx'
import { PricingCard } from '../components/landing/PricingCard.jsx'
import { SectionHeading } from '../components/landing/SectionHeading.jsx'

function Nav() {
  return (
    <div className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/70 backdrop-blur">
      <Container className="flex items-center justify-between py-4">
        <a href="#" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-white/10 ring-1 ring-white/10" />
          <div className="text-sm font-semibold tracking-tight">NCC SaaS</div>
        </a>
        <div className="hidden sm:flex items-center gap-6 text-sm text-slate-300">
          <a className="hover:text-white transition" href="#features">
            Funzionalità
          </a>
          <a className="hover:text-white transition" href="#benefits">
            Benefici
          </a>
          <a className="hover:text-white transition" href="#pricing">
            Prezzi
          </a>
          <a className="hover:text-white transition" href="#driver-register">
            Diventa autista
          </a>
          <a className="hover:text-white transition" href="/tour-operator">
            Affiliazione Tour Operator
          </a>
          <a className="hover:text-white transition" href="/bnb">
            Affiliazione B&amp;B
          </a>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Button as="a" href="#cta" variant="ghost" className="hidden sm:inline-flex">
            Prova gratis
          </Button>
          <Button as="a" href="#cta">
            Richiedi demo
          </Button>
        </div>
      </Container>
    </div>
  )
}

function Hero() {
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute top-40 right-[-140px] h-[380px] w-[380px] rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="absolute bottom-[-200px] left-[-200px] h-[520px] w-[520px] rounded-full bg-sky-400/10 blur-3xl" />
      </div>

      <Container className="py-16 sm:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6">
            <div className="inline-flex items-center rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300 ring-1 ring-white/10">
              Multi-azienda • Dispatch • Pagamenti • Mappe live
            </div>

            <h1 className="mt-5 text-4xl sm:text-5xl font-semibold tracking-tight text-white">
              Gestisci la tua attività NCC senza stress
            </h1>
            <p className="mt-4 text-base sm:text-lg text-slate-300">
              Corse, autisti, clienti e pagamenti in un unico sistema
            </p>

            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <Button as="a" href="#cta" className="sm:w-auto">
                Richiedi demo
              </Button>
              <Button as="a" href="#pricing" variant="secondary" className="sm:w-auto">
                Vedi prezzi
              </Button>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-3 text-xs text-slate-300">
              <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
                <div className="text-white font-semibold">Tempo reale</div>
                <div className="mt-0.5">Status + mappa</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
                <div className="text-white font-semibold">Automazione</div>
                <div className="mt-0.5">Assegnazioni smart</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
                <div className="text-white font-semibold">Semplice</div>
                <div className="mt-0.5">Operazioni chiare</div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
              <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-white">Dashboard operativa</div>
                  <div className="text-xs text-slate-300">Live</div>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <div className="text-xs text-slate-300">Corse attive</div>
                    <div className="mt-1 text-2xl font-semibold text-white">12</div>
                    <div className="mt-2 text-xs text-slate-400">Aggiornamento in tempo reale</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <div className="text-xs text-slate-300">Autisti online</div>
                    <div className="mt-1 text-2xl font-semibold text-white">7</div>
                    <div className="mt-2 text-xs text-slate-400">Mappa live + ETA</div>
                  </div>
                  <div className="sm:col-span-2 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-slate-300">Assegnazione automatica</div>
                      <div className="text-[11px] font-semibold text-emerald-300">ATTIVA</div>
                    </div>
                    <div className="mt-2 text-sm text-slate-200">
                      Il sistema seleziona l’autista più vicino e gestisce i retry in caso di rifiuto.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}

function Features() {
  const items = useMemo(
    () => [
      { title: 'Gestione corse in tempo reale', desc: 'Stati chiari, eventi live e storico delle operazioni.' },
      { title: 'Mappa live autisti', desc: 'Posizione aggiornata e contesto operativo in un colpo d’occhio.' },
      { title: 'Assegnazione automatica', desc: 'Dispatch intelligente: priorità, retry e timeout gestiti.' },
      { title: 'Dashboard operativa', desc: 'Una vista unica per corse, autisti, ETA e criticità.' },
      { title: 'Multi azienda', desc: 'Separazione dati per compagnia e accessi protetti.' },
    ],
    [],
  )

  return (
    <div id="features" className="border-t border-white/10">
      <Container className="py-16">
        <SectionHeading
          kicker="Funzionalità"
          title="Tutto quello che serve per operare ogni giorno"
          sub="Pensato per chi gestisce molte corse e vuole controllo, velocità e affidabilità."
        />
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((f) => (
            <FeatureCard key={f.title} title={f.title} desc={f.desc} />
          ))}
        </div>
      </Container>
    </div>
  )
}

function Benefits() {
  const benefits = [
    { title: 'Risparmi tempo', desc: 'Riduci chiamate, chat e coordinamento manuale con una regia unica.' },
    { title: 'Riduci errori', desc: 'Dati consistenti e flusso operativo guidato: meno dimenticanze e incomprensioni.' },
    { title: 'Aumenti le corse', desc: 'Rispondi più veloce, assegni meglio, chiudi più servizi ogni giorno.' },
  ]

  return (
    <div id="benefits" className="border-t border-white/10">
      <Container className="py-16">
        <SectionHeading kicker="Benefici" title="Impatto immediato sul lavoro e sui margini" />
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          {benefits.map((b) => (
            <div key={b.title} className="rounded-2xl border border-white/10 bg-slate-950/40 p-6">
              <div className="text-sm font-semibold text-white">{b.title}</div>
              <div className="mt-2 text-sm text-slate-300">{b.desc}</div>
            </div>
          ))}
        </div>
      </Container>
    </div>
  )
}

const DRIVER_LOGIN_URL =
  import.meta.env.VITE_DRIVER_LOGIN_URL || 'http://localhost:5174/'

function isValidEmail(value) {
  const s = value.trim()
  if (!s.includes('@')) return false
  const [local, domain] = s.split('@')
  if (!local || !domain || !domain.includes('.')) return false
  return true
}

function DriverRegister() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [plateNumber, setPlateNumber] = useState('')
  const [vehicleType, setVehicleType] = useState('')
  const [seats, setSeats] = useState('')
  const [driverLicenseNumber, setDriverLicenseNumber] = useState('')
  const [nccLicenseNumber, setNccLicenseNumber] = useState('')
  const [insuranceNumber, setInsuranceNumber] = useState('')
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function validateClient() {
    const n = name.trim()
    const em = email.trim()
    const ph = phone.trim()
    if (!n) return 'Name is required.'
    if (!em) return 'Email is required.'
    if (!isValidEmail(em)) return 'Enter a valid email address.'
    if (!ph) return 'Phone is required.'
    if (password.length < 8) return 'Password must be at least 8 characters.'
    return ''
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    const clientErr = validateClient()
    if (clientErr) {
      setError(clientErr)
      return
    }
    setStatus('sending')
    const seatsNum = parseInt(String(seats).trim(), 10)
    const payload = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      password,
    }
    const pt = plateNumber.trim()
    if (pt) payload.plate_number = pt
    const vt = vehicleType.trim()
    if (vt) payload.vehicle_type = vt
    if (Number.isFinite(seatsNum) && seatsNum >= 1) payload.seats = seatsNum
    const dl = driverLicenseNumber.trim()
    if (dl) payload.driver_license_number = dl
    const ncc = nccLicenseNumber.trim()
    if (ncc) payload.ncc_license_number = ncc
    const ins = insuranceNumber.trim()
    if (ins) payload.insurance_number = ins
    try {
      const res = await fetch('/api/auth/driver/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const d = data.detail
        let msg = 'Registration failed'
        if (typeof d === 'string') msg = d
        else if (Array.isArray(d) && d.length) {
          msg = d.map((x) => (typeof x?.msg === 'string' ? x.msg : JSON.stringify(x))).join(' ')
        }
        setError(msg)
        setStatus('idle')
        return
      }
      setMessage(
        data.message ||
          'Registration successful. You can now login.',
      )
      setStatus('sent')
      setPassword('')

      const tokenRedirect =
        import.meta.env.VITE_DRIVER_REGISTER_TOKEN_REDIRECT === 'true'
      if (data.access_token && tokenRedirect) {
        const base = DRIVER_LOGIN_URL
        const u = new URL(base, window.location.href)
        u.searchParams.set('token', data.access_token)
        window.location.assign(u.toString())
        return
      }

      if (data.can_login_now) {
        window.setTimeout(() => {
          const join = DRIVER_LOGIN_URL.includes('?') ? '&' : '?'
          window.location.href = `${DRIVER_LOGIN_URL}${join}registered=1`
        }, 1800)
      }
    } catch {
      setError('Network error. Try again later.')
      setStatus('idle')
    }
  }

  return (
    <div id="driver-register" className="border-t border-white/10 scroll-mt-24">
      <Container className="py-16">
        <SectionHeading
          kicker="Autisti"
          title="Registrati come autista"
          sub="Compila il modulo. Il team approverà il tuo account: poi potrai accedere all’app autista con email e password."
        />
        <div className="mt-10 max-w-lg mx-auto rounded-3xl border border-white/10 bg-slate-950/40 p-6 sm:p-8">
          <form onSubmit={onSubmit} className="space-y-3">
            <input
              required
              name="name"
              placeholder="Nome e cognome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/30"
            />
            <input
              required
              type="email"
              name="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/30"
            />
            <input
              required
              name="phone"
              placeholder="Telefono"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/30"
            />
            <input
              required
              type="password"
              name="password"
              placeholder="Password (min. 8 caratteri)"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/30"
            />
            <p className="text-xs text-slate-500 pt-1">Veicolo (opzionale)</p>
            <input
              name="plate_number"
              placeholder="Targa"
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value)}
              autoComplete="off"
              className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/30"
            />
            <input
              name="vehicle_type"
              placeholder="Tipo veicolo (es. berlina, van)"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              autoComplete="off"
              className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/30"
            />
            <input
              name="seats"
              type="number"
              min={1}
              max={60}
              placeholder="Posti (numero)"
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/30"
            />
            <p className="text-xs text-slate-500 pt-1">Documenti (opzionale)</p>
            <input
              name="driver_license_number"
              placeholder="Numero patente"
              value={driverLicenseNumber}
              onChange={(e) => setDriverLicenseNumber(e.target.value)}
              autoComplete="off"
              className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/30"
            />
            <input
              name="ncc_license_number"
              placeholder="Numero licenza NCC"
              value={nccLicenseNumber}
              onChange={(e) => setNccLicenseNumber(e.target.value)}
              autoComplete="off"
              className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/30"
            />
            <input
              name="insurance_number"
              placeholder="Numero polizza assicurativa"
              value={insuranceNumber}
              onChange={(e) => setInsuranceNumber(e.target.value)}
              autoComplete="off"
              className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/30"
            />
            {error ? <div className="text-sm text-red-300">{error}</div> : null}
            {message ? <div className="text-sm text-emerald-300">{message}</div> : null}
            {status === 'sent' ? (
              <p className="text-xs text-slate-400">
                Accedi all’app autista:{' '}
                <a className="text-sky-300 underline hover:text-white" href={DRIVER_LOGIN_URL}>
                  apri login
                </a>
                .
              </p>
            ) : null}
            <Button className="w-full" type="submit" disabled={status === 'sending'}>
              {status === 'sending' ? 'Invio in corso…' : 'Invia richiesta'}
            </Button>
          </form>
        </div>
      </Container>
    </div>
  )
}

function Pricing() {
  return (
    <div id="pricing" className="border-t border-white/10">
      <Container className="py-16">
        <SectionHeading
          kicker="Prezzi"
          title="Scegli il piano giusto per la tua flotta"
          sub="Prezzi semplici. Nessuna sorpresa. Cresci quando sei pronto."
        />
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <PricingCard
            name="Starter"
            price={49}
            desc="Per chi vuole iniziare con ordine e controllo."
            items={['Dashboard operativa', 'Gestione corse', 'Supporto email']}
          />
          <PricingCard
            name="Pro"
            price={99}
            highlight
            desc="Per aziende che gestiscono corse ogni giorno."
            items={['Mappa live autisti', 'Assegnazione automatica', 'WebSocket live']}
          />
          <PricingCard
            name="Business"
            price={199}
            desc="Per team e multi-azienda con esigenze avanzate."
            items={['Multi azienda', 'Ruoli e permessi', 'Supporto prioritario']}
          />
        </div>
        <p className="mt-6 text-xs text-slate-400">
          I prezzi sono indicativi e possono variare in base a numero di autisti, corse e integrazioni.
        </p>
      </Container>
    </div>
  )
}

function FinalCTA() {
  const [status, setStatus] = useState('idle')

  function onSubmit(e) {
    e.preventDefault()
    setStatus('sent')
    setTimeout(() => setStatus('idle'), 3500)
  }

  return (
    <div id="cta" className="border-t border-white/10">
      <Container className="py-16">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7">
              <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
                Prova gratis
              </div>
              <div className="mt-3 text-sm sm:text-base text-slate-300">
                Lascia i tuoi contatti: ti mostriamo la piattaforma in 15 minuti e configuriamo la demo sulla tua operatività.
              </div>
            </div>
            <div className="lg:col-span-5">
              <form onSubmit={onSubmit} className="space-y-3">
                <input
                  required
                  name="name"
                  placeholder="Nome e cognome"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/30"
                />
                <input
                  required
                  type="email"
                  name="email"
                  placeholder="Email"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/30"
                />
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button className="w-full" type="submit">
                    Richiedi demo
                  </Button>
                  <Button as="a" href="#pricing" variant="secondary" className="w-full">
                    Vedi prezzi
                  </Button>
                </div>
                {status === 'sent' ? (
                  <div className="text-xs text-emerald-300">
                    Richiesta inviata (demo). Collegamento backend lead da aggiungere quando vuoi.
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">
                    Nessuno spam. Puoi chiedere demo o info quando vuoi.
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}

function Footer() {
  return (
    <div className="border-t border-white/10">
      <Container className="py-10 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between text-sm text-slate-400">
        <div>© {new Date().getFullYear()} NCC SaaS</div>
        <div className="flex gap-4">
          <a className="hover:text-white transition" href="#features">
            Funzionalità
          </a>
          <a className="hover:text-white transition" href="#pricing">
            Prezzi
          </a>
          <a className="hover:text-white transition" href="/dashboard">
            Dashboard
          </a>
        </div>
      </Container>
    </div>
  )
}

export function Landing() {
  return (
    <div>
      <Nav />
      <Hero />
      <Features />
      <Benefits />
      <DriverRegister />
      <Pricing />
      <FinalCTA />
      <Footer />
    </div>
  )
}

export default Landing

