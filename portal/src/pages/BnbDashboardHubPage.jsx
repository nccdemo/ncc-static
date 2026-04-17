import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, TrendingUp } from "lucide-react";

import { apiUrl } from "../api/apiUrl.js";
import { authFetch } from "../api/authFetch.js";

const TOURS_BASE = (import.meta.env.VITE_TOURS_PUBLIC_BASE_URL || "http://localhost:5173").replace(
  /\/$/,
  "",
);

function eur(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return `€${x.toFixed(2)}`;
}

/** Stacked bar: B&amp;B vs platform vs driver (from payment splits). */
function EarningsSplitChart({ bnb, platform, driver }) {
  const b = Math.max(0, Number(bnb) || 0);
  const p = Math.max(0, Number(platform) || 0);
  const d = Math.max(0, Number(driver) || 0);
  const sum = b + p + d;
  if (sum <= 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-500">
        Il grafico comparirà quando ci saranno pagamenti registrati sul tuo account.
      </div>
    );
  }
  const wb = (b / sum) * 100;
  const wp = (p / sum) * 100;
  const wd = (d / sum) * 100;
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ripartizione pagamenti</p>
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-200 shadow-inner ring-1 ring-slate-200/80">
        <div
          className="h-full bg-emerald-500 transition-[width] duration-500 ease-out"
          style={{ width: `${wb}%` }}
          title={`B&amp;B ${eur(b)}`}
        />
        <div
          className="h-full bg-slate-500 transition-[width] duration-500 ease-out"
          style={{ width: `${wp}%` }}
          title={`Piattaforma ${eur(p)}`}
        />
        <div
          className="h-full bg-sky-500 transition-[width] duration-500 ease-out"
          style={{ width: `${wd}%` }}
          title={`Autista ${eur(d)}`}
        />
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-600">
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
          B&amp;B <span className="font-semibold text-slate-800">{eur(b)}</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-500" aria-hidden />
          Piattaforma <span className="font-semibold text-slate-800">{eur(p)}</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500" aria-hidden />
          Autista <span className="font-semibold text-slate-800">{eur(d)}</span>
        </li>
      </ul>
    </div>
  );
}

/**
 * B&amp;B hub — ``GET /api/bnb/partner/earnings``: commissione, prenotazioni, link referral.
 */
export default function BnbDashboardHubPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(apiUrl("/api/bnb/partner/earnings"), {
        headers: { Accept: "application/json" },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = body?.detail;
        throw new Error(typeof d === "string" ? d : "Impossibile caricare i guadagni.");
      }
      setData(body);
      const rc = (body?.referral_code ?? "").trim();
      if (rc) {
        try {
          localStorage.setItem("bnb", JSON.stringify({ referral_code: rc }));
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore di caricamento");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => window.clearTimeout(copyTimer.current);
  }, []);

  const referralUrl = useMemo(() => {
    const code = (data?.referral_code ?? "").trim();
    if (!code) return "";
    return `${TOURS_BASE}/tours?ref=${encodeURIComponent(code)}`;
  }, [data]);

  const totalEarnings = Number(data?.total_bnb_earnings ?? 0);
  const bookingsCount = Number(data?.total_bookings ?? 0);
  const paymentsCount = Number(data?.payment_count ?? 0);
  const totalGross = Number(data?.total_gross ?? 0);
  const platform = Number(data?.total_platform ?? 0);
  const driver = Number(data?.total_driver ?? 0);
  const code = (data?.referral_code ?? "").trim();

  async function copyReferralLink() {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-emerald-700">
          <TrendingUp className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
          <span className="text-xs font-bold uppercase tracking-widest">Dashboard</span>
        </div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          I tuoi guadagni
        </h1>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-600">
          Commissioni da pagamenti collegati al tuo account B&amp;B e prenotazioni confermate con il tuo referral.
        </p>
      </div>

      {error ? (
        <p className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-20 shadow-sm">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600" aria-hidden />
          <p className="text-sm font-medium text-slate-500">Caricamento…</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Hero: total earnings */}
          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-emerald-50/40 to-white p-6 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.12)] sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800/80">
              Commissioni totali (B&amp;B)
            </p>
            <p className="mt-3 text-4xl font-black tabular-nums tracking-tight text-slate-900 sm:text-5xl">
              {eur(totalEarnings)}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Lordo pagamenti: <span className="font-semibold text-slate-800">{eur(totalGross)}</span>
              {" · "}
              <span className="text-slate-500">{paymentsCount} pagamenti</span>
            </p>
          </section>

          {/* Stats row */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Prenotazioni</p>
              <p className="mt-2 text-3xl font-black tabular-nums text-slate-900">{bookingsCount}</p>
              <p className="mt-1 text-xs leading-snug text-slate-500">
                Confermate collegate al tuo <span className="font-medium text-slate-700">bnb_id</span> o codice
                referral.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Pagamenti registrati</p>
              <p className="mt-2 text-3xl font-black tabular-nums text-slate-900">{paymentsCount}</p>
              <p className="mt-1 text-xs leading-snug text-slate-500">
                Righe pagate / incassate incluse nel totale commissioni.
              </p>
            </div>
          </section>

          {/* Optional chart */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <EarningsSplitChart bnb={totalEarnings} platform={platform} driver={driver} />
          </section>

          {/* Referral */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Link referral</p>
            <p className="mt-1 text-sm text-slate-600">
              Condividilo con gli ospiti: ogni prenotazione da questo link può attribuirti la commissione.
            </p>
            {code ? (
              <p className="mt-3 font-mono text-sm font-semibold text-slate-800">{code}</p>
            ) : (
              <p className="mt-3 text-sm text-amber-800">Nessun codice referral sul profilo.</p>
            )}
            {referralUrl ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-700 break-all sm:text-sm">
                  {referralUrl}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void copyReferralLink()}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-slate-800 active:scale-[0.99]"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4" aria-hidden />
                        Copiato
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" aria-hidden />
                        Copia link
                      </>
                    )}
                  </button>
                  <a
                    href={referralUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-emerald-700 underline-offset-2 hover:underline"
                  >
                    Apri tour →
                  </a>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Completa la registrazione o contatta il supporto per attivare il referral.
              </p>
            )}
          </section>

          <nav className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-200 pt-6 text-sm">
            <Link to="/bnb/earnings" className="font-semibold text-emerald-800 hover:underline">
              Dettaglio guadagni
            </Link>
            <span className="text-slate-300" aria-hidden>
              ·
            </span>
            <Link to="/bnb/referrals" className="font-semibold text-emerald-800 hover:underline">
              Referral e QR
            </Link>
            <span className="text-slate-300" aria-hidden>
              ·
            </span>
            <Link to="/bnb/profile" className="font-semibold text-slate-700 hover:underline">
              Profilo
            </Link>
          </nav>
        </div>
      )}
    </main>
  );
}
