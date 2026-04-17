import { Link } from 'react-router-dom'

const HERO_BG =
  'https://images.unsplash.com/photo-1529154036614-a60975f85338?w=1600&q=80&auto=format&fit=crop'

const MOCK_TOURS = [
  {
    id: 1,
    title: 'Etna al tramonto',
    price: 89,
    image:
      'https://images.unsplash.com/photo-1547036967-23d11aaca7ff?w=800&q=80&auto=format&fit=crop',
  },
  {
    id: 2,
    title: 'Valle dei Templi & Scala dei Turchi',
    price: 75,
    image:
      'https://images.unsplash.com/photo-1539650116574-75c0c6d73a6e?w=800&q=80&auto=format&fit=crop',
  },
  {
    id: 3,
    title: 'Barocco di Noto',
    price: 65,
    image:
      'https://images.unsplash.com/photo-1555993539-1732b0258235?w=800&q=80&auto=format&fit=crop',
  },
]

function ProfileIcon({ className }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4Z"
        fill="currentColor"
      />
    </svg>
  )
}

export default function ExplorePage() {
  return (
    <div className="min-h-[100dvh] w-full bg-neutral-100 text-neutral-900 antialiased">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-neutral-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <Link to="/explore" className="text-lg font-bold tracking-tight text-neutral-900">
            Sanculino
          </Link>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-700 transition hover:bg-neutral-100"
            aria-label="Profilo"
          >
            <ProfileIcon className="h-6 w-6" />
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-md">
        {/* Hero full screen */}
        <section
          className="relative flex min-h-[calc(100dvh-3.5rem)] flex-col justify-end bg-neutral-900 bg-cover bg-center px-4 pb-10 pt-16"
          style={{ backgroundImage: `url('${HERO_BG}')` }}
        >
          <div className="absolute inset-0 bg-black/40" aria-hidden />
          <div className="relative z-10 flex flex-col items-center text-center">
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Scopri la Sicilia
            </h1>
            <p className="mt-2 max-w-xs text-base text-white/90">
              Escursioni e transfer privati
            </p>
            <div className="mt-8 w-full max-w-sm space-y-3">
              <Link
                to="/tours"
                className="flex h-14 w-full items-center justify-center rounded-xl bg-blue-600 text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 active:scale-[0.98]"
              >
                Vedi escursioni
              </Link>
              <Link
                to="/map"
                className="flex h-14 w-full items-center justify-center rounded-xl bg-neutral-900 text-base font-semibold text-white shadow-lg shadow-black/20 transition hover:bg-neutral-800 active:scale-[0.98]"
              >
                Prenota transfer
              </Link>
            </div>
          </div>
        </section>

        {/* Servizi */}
        <section className="px-4 py-10">
          <h2 className="mb-5 text-xl font-bold text-neutral-900">Scegli il tuo servizio</h2>
          <div className="flex flex-col gap-4">
            <article className="rounded-2xl bg-white p-5 shadow-md">
              <h3 className="text-lg font-semibold text-neutral-900">Transfer privati</h3>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600">
                Vai dove vuoi, quando vuoi
              </p>
              <Link
                to="/map"
                className="mt-4 flex h-11 w-full items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
              >
                Richiedi transfer
              </Link>
            </article>
            <article className="rounded-2xl bg-white p-5 shadow-md">
              <h3 className="text-lg font-semibold text-neutral-900">Escursioni</h3>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600">
                Scopri le migliori esperienze
              </p>
              <Link
                to="/tours"
                className="mt-4 flex h-11 w-full items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
              >
                Guarda escursioni
              </Link>
            </article>
          </div>
        </section>

        {/* Mock escursioni */}
        <section className="px-4 pb-12">
          <h2 className="mb-5 text-xl font-bold text-neutral-900">In evidenza</h2>
          <div className="flex flex-col gap-5">
            {MOCK_TOURS.map((t) => (
              <article
                key={t.id}
                className="overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-black/5"
              >
                <div className="aspect-[16/10] w-full overflow-hidden bg-neutral-200">
                  <img
                    src={t.image}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-semibold text-neutral-900">{t.title}</h3>
                  <p className="mt-1 text-sm font-medium text-blue-600">da €{t.price} / persona</p>
                  <Link
                    to="/tours"
                    className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700"
                  >
                    Prenota ora
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
