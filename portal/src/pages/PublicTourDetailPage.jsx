import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiUrl } from "../api/apiUrl.js";
import { tourCoverSrc } from "../api/driverTours.js";
import { checkoutUrlForInstance } from "../lib/clientCheckout.js";
import Card from "../components/Card.jsx";
import Spinner from "../components/Spinner.jsx";

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

function parseDay(iso) {
  if (!iso) return null;
  const s = String(iso);
  const day = s.length >= 10 ? s.slice(0, 10) : null;
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatDateLabel(iso) {
  const dt = parseDay(iso);
  if (!dt) return "—";
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Future (local midnight) and not cancelled; used to decide empty state. */
function isFutureNotCancelled(row) {
  const st = String(row.status || "").toLowerCase();
  if (st === "cancelled") return false;
  const dt = parseDay(row.date);
  if (!dt) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dt.setHours(0, 0, 0, 0);
  return dt >= today;
}

export default function PublicTourDetailPage() {
  const { tourId } = useParams();
  const id = Number(tourId);
  const [phase, setPhase] = useState("loading");
  const [tour, setTour] = useState(null);
  const [instances, setInstances] = useState([]);
  const [err, setErr] = useState("");

  const tourUrl = useMemo(() => {
    if (!Number.isFinite(id)) return "";
    const b = apiUrl("/api/tours");
    const base = b.endsWith("/") ? b.slice(0, -1) : b;
    return `${base}/${id}`;
  }, [id]);

  const instancesUrl = useMemo(() => {
    if (!Number.isFinite(id)) return "";
    const b = apiUrl("/api/tours");
    const base = b.endsWith("/") ? b.slice(0, -1) : b;
    return `${base}/${id}/instances`;
  }, [id]);

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setPhase("error");
      setErr("Invalid tour");
      return;
    }
    let cancelled = false;
    (async () => {
      setPhase("loading");
      setErr("");
      try {
        const [t, inst] = await Promise.all([
          fetchJson(tourUrl),
          fetchJson(instancesUrl),
        ]);
        if (cancelled) return;
        setTour(t);
        setInstances(Array.isArray(inst) ? inst : []);
        setPhase("ok");
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "Failed to load");
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, tourUrl, instancesUrl]);

  const cover = tour ? tourCoverSrc(tour.images) : "";
  const futureInstances = useMemo(
    () => instances.filter(isFutureNotCancelled),
    [instances],
  );

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-md items-center gap-4 px-4 py-3">
          <Link
            to="/tours"
            className="text-sm font-semibold text-blue-600 transition hover:text-blue-800"
          >
            Back
          </Link>
          <span className="text-sm font-medium text-neutral-500">Tour</span>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-6">
        {phase === "loading" ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : null}

        {phase === "error" ? (
          <Card>
            <p className="text-sm text-red-600">{err}</p>
          </Card>
        ) : null}

        {phase === "ok" && tour ? (
          <>
            <div className="overflow-hidden rounded-2xl bg-neutral-200 shadow-md ring-1 ring-black/5">
              {cover ? (
                <img
                  src={cover}
                  alt=""
                  className="aspect-[16/10] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[16/10] items-center justify-center text-sm text-neutral-500">
                  No image
                </div>
              )}
            </div>
            <h1 className="mt-5 text-2xl font-bold tracking-tight">{tour.title}</h1>
            {tour.city ? (
              <p className="mt-1 text-sm text-neutral-600">{tour.city}</p>
            ) : null}
            <p className="mt-2 text-lg font-semibold text-blue-600">
              €{Number(tour.price).toFixed(2)}
            </p>
            {tour.description ? (
              <p className="mt-4 text-sm leading-relaxed text-neutral-700">
                {tour.description}
              </p>
            ) : null}

            <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Available dates
            </h2>

            {futureInstances.length === 0 ? (
              <Card>
                <p className="text-center text-sm text-neutral-600">
                  No available dates
                </p>
              </Card>
            ) : (
              <ul className="flex flex-col gap-3">
                {futureInstances.map((row) => {
                  const avail = Number(row.available ?? row.available_seats ?? 0);
                  const canBook = avail > 0;
                  const timeLabel = row.start_time
                    ? String(row.start_time).slice(0, 5)
                    : "—";
                  return (
                    <li key={row.id}>
                      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-neutral-900">
                            {formatDateLabel(row.date)}
                          </p>
                          <p className="mt-0.5 text-xs text-neutral-500">
                            Time: {timeLabel}
                          </p>
                          <p className="mt-1 text-sm text-neutral-600">
                            {avail} seat{avail === 1 ? "" : "s"} available
                          </p>
                        </div>
                        {canBook ? (
                          <a
                            href={checkoutUrlForInstance(row.id)}
                            className="block w-full rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] hover:bg-blue-700 hover:shadow-md active:scale-[0.98] sm:w-auto sm:min-w-[140px]"
                          >
                            Book now
                          </a>
                        ) : (
                          <span className="text-xs font-semibold uppercase text-neutral-400">
                            Sold out
                          </span>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
