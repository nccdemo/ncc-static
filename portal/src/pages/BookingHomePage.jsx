import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { persistReferralFromUrlSearch } from "../utils/referralStorage.js";
import { tourCoverSrc } from "../api/driverTours.js";
import { createTourCheckoutSession, fetchPublicTours } from "../lib/publicToursApi.js";
import Spinner from "../components/Spinner.jsx";

/**
 * Conversion-focused public homepage: hero + tours grid (mobile first).
 */
export default function BookingHomePage() {
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState("loading");
  const [tours, setTours] = useState([]);
  const [err, setErr] = useState(null);
  const [checkoutTourId, setCheckoutTourId] = useState(null);
  const [checkoutErr, setCheckoutErr] = useState(null);

  useEffect(() => {
    const raw = searchParams.toString();
    persistReferralFromUrlSearch(raw ? `?${raw}` : "");
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPhase("loading");
      setErr(null);
      try {
        const json = await fetchPublicTours();
        if (cancelled) return;
        setTours(Array.isArray(json) ? json : []);
        setPhase("ok");
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "Request failed");
        setPhase("error");
        setTours([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const scrollToTours = () => {
    document.getElementById("tours-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-dvh bg-[var(--ncc-background,#f8fafc)] text-[var(--ncc-text,#0f172a)]">
      <header className="sticky top-0 z-20 border-b border-slate-200/90 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="text-lg font-bold tracking-tight text-[var(--ncc-primary,#0b1f3a)]">
            NCC
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/explore"
              className="rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:px-3"
            >
              Explore
            </Link>
            <Link
              to="/transfer"
              className="rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:px-3"
            >
              Transfer
            </Link>
            <Link
              to="/login"
              className="rounded-lg bg-[var(--ncc-primary,#0b1f3a)] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 sm:px-4"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200/80 bg-gradient-to-b from-white via-slate-50 to-[var(--ncc-background,#f8fafc)] px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-14">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[var(--ncc-accent,#c8a96a)]/15 blur-3xl sm:h-80 sm:w-80"
          aria-hidden
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ncc-accent,#a89055)] sm:text-sm">
            Escursioni &amp; transfer
          </p>
          <h1 className="mt-3 text-balance text-3xl font-extrabold leading-tight tracking-tight text-[var(--ncc-primary,#0b1f3a)] sm:text-4xl sm:leading-tight md:text-5xl">
            Prenota la tua prossima esperienza
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-relaxed text-slate-600 sm:text-lg">
            Tour guidati dai nostri driver partner. Scegli un&apos;escursione, paga in sicurezza e ricevi la conferma
            via email.
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:justify-center">
            <button
              type="button"
              onClick={scrollToTours}
              className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-[var(--ncc-primary,#0b1f3a)] px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-slate-900/15 transition hover:opacity-95 active:scale-[0.99]"
            >
              Scegli un tour
            </button>
            <Link
              to="/transfer"
              className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border-2 border-slate-200 bg-white px-8 py-3.5 text-base font-semibold text-slate-800 transition hover:border-[var(--ncc-accent,#c8a96a)] hover:text-[var(--ncc-primary,#0b1f3a)]"
            >
              Prenota transfer
            </Link>
          </div>
        </div>
      </section>

      <section id="tours-grid" className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-6 flex flex-col gap-2 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--ncc-primary,#0b1f3a)] sm:text-3xl">
              Tour in evidenza
            </h2>
            <p className="mt-1 text-sm text-slate-600 sm:text-base">Prezzi da listino · dettagli e date al tap</p>
          </div>
        </div>

        {checkoutErr ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {checkoutErr}
          </div>
        ) : null}

        {phase === "loading" ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="rounded-2xl border border-red-200 bg-red-50/80 px-4 py-4 text-sm text-red-800">
            {err}
            <p className="mt-2 text-xs text-red-700/90">Verifica che l&apos;API sia raggiungibile (proxy Vite → backend).</p>
          </div>
        ) : null}

        {phase === "ok" && tours.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">Nessun tour disponibile al momento.</p>
        ) : null}

        {phase === "ok" && tours.length > 0 ? (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {tours.map((tour) => {
              const src = tourCoverSrc(tour.images);
              const busy = checkoutTourId === tour.id;
              const price = Number(tour.price);
              const priceLabel = Number.isFinite(price) ? `€${price.toFixed(2)}` : "—";
              return (
                <li key={tour.id}>
                  <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[var(--ncc-shadow-card,0_4px_14px_rgba(15,23,42,0.08))] transition hover:-translate-y-0.5 hover:shadow-lg">
                    <Link to={`/tours/${tour.id}`} className="block min-h-0 flex-1">
                      <div className="relative aspect-[4/3] w-full bg-slate-200">
                        {src ? (
                          <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs font-medium text-slate-400">
                            Immagine in arrivo
                          </div>
                        )}
                      </div>
                      <div className="p-4 sm:p-5">
                        <h3 className="line-clamp-2 text-lg font-bold leading-snug text-[var(--ncc-primary,#0b1f3a)]">
                          {tour.title}
                        </h3>
                        {tour.city ? <p className="mt-1 text-sm text-slate-500">{tour.city}</p> : null}
                        <p className="mt-3 text-xl font-extrabold text-[var(--ncc-accent,#9a7b45)]">{priceLabel}</p>
                      </div>
                    </Link>
                    <div className="mt-auto flex flex-col gap-2 border-t border-slate-100 p-4 pt-3 sm:p-5 sm:pt-4">
                      <button
                        type="button"
                        disabled={busy}
                        className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-center text-base font-bold text-white shadow-md transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={async () => {
                          setCheckoutErr(null);
                          setCheckoutTourId(tour.id);
                          try {
                            const checkoutUrl = await createTourCheckoutSession(tour);
                            if (checkoutUrl) {
                              window.location.assign(checkoutUrl);
                              return;
                            }
                            setCheckoutErr("Nessun URL di checkout ricevuto.");
                          } catch (e) {
                            setCheckoutErr(e instanceof Error ? e.message : "Checkout non riuscito.");
                          } finally {
                            setCheckoutTourId(null);
                          }
                        }}
                      >
                        {busy ? "Apertura…" : "Book Now"}
                      </button>
                      <Link
                        to={`/tours/${tour.id}`}
                        className="block py-1 text-center text-sm font-semibold text-slate-600 underline-offset-2 hover:text-[var(--ncc-primary,#0b1f3a)] hover:underline"
                      >
                        Dettagli tour
                      </Link>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="mt-12 rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center shadow-sm sm:mt-16 sm:px-8 sm:py-10">
          <p className="text-lg font-bold text-[var(--ncc-primary,#0b1f3a)] sm:text-xl">Pronto a partire?</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 sm:text-base">
            Sfoglia i tour sopra e usa <strong>Book Now</strong> per pagare con carta in modo sicuro.
          </p>
          <button
            type="button"
            onClick={scrollToTours}
            className="mt-6 inline-flex min-h-[48px] min-w-[200px] items-center justify-center rounded-2xl bg-emerald-600 px-8 py-3.5 text-base font-bold text-white shadow-md transition hover:bg-emerald-700"
          >
            Book Now
          </button>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-8 text-center text-xs text-slate-500 sm:py-10">
        <p className="px-4">© {new Date().getFullYear()} NCC · Transfer ed escursioni</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4">
          <Link to="/login" className="font-medium text-slate-700 hover:underline">
            Accedi driver / B&amp;B
          </Link>
          <Link to="/tours" className="font-medium text-slate-700 hover:underline">
            Lista tour (classica)
          </Link>
        </div>
      </footer>
    </div>
  );
}
