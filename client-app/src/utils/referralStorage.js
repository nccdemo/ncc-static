/** Key used across tour booking flow (must match B&B / portal expectations). */
export const REFERRAL_STORAGE_KEY = "referral_code";

/** Cookie mirror (same-origin). */
const REFERRAL_COOKIE_NAME = "ncc_referral_code";
const REFERRAL_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 90;

function readReferralCookie() {
  if (typeof document === "undefined") return "";
  const parts = String(document.cookie || "").split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    const k = (idx >= 0 ? part.slice(0, idx) : part).trim();
    if (k !== REFERRAL_COOKIE_NAME) continue;
    const raw = idx >= 0 ? part.slice(idx + 1).trim() : "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return "";
}

function writeReferralCookie(normalized) {
  if (typeof document === "undefined" || !normalized) return;
  const enc = encodeURIComponent(normalized);
  document.cookie = `${REFERRAL_COOKIE_NAME}=${enc}; Path=/; Max-Age=${REFERRAL_COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
}

/**
 * Referral from the first hostname label (e.g. ``rio5hx.localhost`` → ``RIO5HX``).
 */
export function getSubdomainReferral() {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;

  const parts = host.split(".");

  if (parts.length > 1 && parts[0] !== "localhost") {
    return parts[0].toUpperCase();
  }

  return null;
}

/** Persist an explicit referral code (localStorage + cookie). */
export function persistReferralCode(code) {
  if (typeof window === "undefined") return;
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return;
  try {
    localStorage.setItem(REFERRAL_STORAGE_KEY, normalized);
  } catch {
    /* ignore */
  }
  writeReferralCookie(normalized);
}

/**
 * Persist referral from subdomain (no query). Prefer calling after ``?ref=`` so URL can override.
 */
export function persistReferralFromHost() {
  if (typeof window === "undefined") return;
  const ref = getSubdomainReferral();
  if (ref) persistReferralCode(ref);
}

/**
 * Read ``?ref=`` from a query string and persist to localStorage + cookie so it survives
 * route changes without login.
 */
export function persistReferralFromUrlSearch(search) {
  if (typeof window === "undefined" || search == null) return;
  const q = String(search);
  const params = new URLSearchParams(q.startsWith("?") ? q.slice(1) : q);
  const ref = params.get("ref");
  if (!ref) return;
  const normalized = ref.trim().toUpperCase();
  if (!normalized) return;
  persistReferralCode(normalized);
}

/** Stored referral for API payloads (undefined if empty). */
export function getStoredReferralCode() {
  if (typeof window === "undefined") return undefined;
  let v = "";
  try {
    v = (localStorage.getItem(REFERRAL_STORAGE_KEY) || "").trim();
  } catch {
    v = "";
  }
  if (!v) v = readReferralCookie().trim();
  const up = v.toUpperCase();
  if (!up) return undefined;
  if (v !== up) {
    try {
      localStorage.setItem(REFERRAL_STORAGE_KEY, up);
    } catch {
      /* ignore */
    }
    writeReferralCookie(up);
  }
  return up;
}
