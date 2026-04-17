import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { persistReferralFromUrlSearch } from "../utils/referralStorage.js";
import { tourCoverSrc } from "../api/driverTours.js";
import Card from "../components/Card.jsx";
import Spinner from "../components/Spinner.jsx";
import { createTourCheckoutSession, fetchPublicTours } from "../lib/publicToursApi.js";

/**
 * @typedef {{ id: number; title: string; price: number; duration: number | null }} TourRow
 */

export default function ToursPage() {
  const [searchParams] = useSearchParams();
  /** @type {['loading'|'ok'|'error', TourRow[] | null, string | null]} */
  const [phase, setPhase] = useState("loading");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  /** @type {[number | null, (id: number | null) => void]} */
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
        const list = Array.isArray(json) ? json : [];
        setData(list);
        setPhase("ok");
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "Request failed");
        setPhase("error");
        setData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-md items-center gap-4 px-4 py-3">
          <Link
            to="/explore"
            className="text-sm font-semibold text-blue-600 transition hover:text-blue-800"
          >
            Back
          </Link>
          <Link to="/" className="text-sm font-semibold text-slate-600 transition hover:text-slate-900">
            Home
          </Link>
          <span className="text-sm font-medium text-neutral-500">Escursioni</span>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Tours</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Experiences created by drivers on the marketplace.
        </p>

        <div className="mt-8 flex min-h-[200px] flex-col gap-4">
          {phase === "loading" ? (
            <div className="flex flex-1 items-center justify-center py-16">
              <Spinner />
            </div>
          ) : null}

          {checkoutErr ? (
            <Card>
              <p className="text-sm text-red-600">{checkoutErr}</p>
              <p className="mt-2 text-xs text-neutral-500">
                For local dev, allow this origin: set{" "}
                <code className="rounded bg-neutral-100 px-1">PORTAL_PUBLIC_URL</code> to your portal
                URL (e.g. http://localhost:5178) or add the host to{" "}
                <code className="rounded bg-neutral-100 px-1">STRIPE_CHECKOUT_RETURN_HOSTS</code>.
              </p>
            </Card>
          ) : null}

          {phase === "error" ? (
            <Card>
              <p className="text-sm text-red-600">{err}</p>
              <p className="mt-2 text-xs text-neutral-500">
                Check that the API is running and the dev proxy targets the backend.
              </p>
            </Card>
          ) : null}

          {phase === "ok" && (!data || data.length === 0) ? (
            <p className="text-center text-sm text-neutral-500">No tours available</p>
          ) : null}

          {phase === "ok" && data && data.length > 0
            ? data.map((tour) => {
                const src = tourCoverSrc(tour.images);
                const busy = checkoutTourId === tour.id;
                return (
                  <Card
                    key={tour.id}
                    className="!p-0 overflow-hidden transition hover:shadow-lg"
                  >
                    <div className="flex flex-col sm:flex-row">
                      <Link
                        to={`/tours/${tour.id}`}
                        className="flex min-w-0 flex-1 flex-col sm:flex-row"
                      >
                        <div className="h-40 w-full shrink-0 bg-neutral-200 sm:h-auto sm:w-36">
                          {src ? (
                            <img
                              src={src}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full min-h-[10rem] items-center justify-center text-xs text-neutral-400">
                              No image
                            </div>
                          )}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-4">
                          <h2 className="text-lg font-semibold text-neutral-900">
                            {tour.title}
                          </h2>
                          {tour.city ? (
                            <p className="text-sm text-neutral-600">{tour.city}</p>
                          ) : null}
                          <p className="text-base font-semibold text-blue-600">
                            €{Number(tour.price).toFixed(2)}
                          </p>
                        </div>
                      </Link>
                      <div className="flex flex-col justify-end gap-2 border-t border-neutral-100 p-4 sm:w-44 sm:border-l sm:border-t-0 sm:shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={async () => {
                            setCheckoutErr(null);
                            setCheckoutTourId(tour.id);
                            try {
                              const checkoutUrl = await createTourCheckoutSession(tour, "/tours");
                              if (checkoutUrl) {
                                window.location.assign(checkoutUrl);
                                return;
                              }
                              setCheckoutErr("No checkout URL returned");
                            } catch (e) {
                              setCheckoutErr(
                                e instanceof Error ? e.message : "Checkout failed",
                              );
                            } finally {
                              setCheckoutTourId(null);
                            }
                          }}
                        >
                          {busy ? "Opening…" : "Book Now"}
                        </button>
                        <Link
                          to={`/tours/${tour.id}`}
                          className="text-center text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          View details
                        </Link>
                      </div>
                    </div>
                  </Card>
                );
              })
            : null}
        </div>
      </main>
    </div>
  );
}
