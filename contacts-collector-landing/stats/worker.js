/**
 * Cloudflare Worker — contatori demo vs checkout PayPal (click «Paga con PayPal»).
 *
 * Setup:
 *   npm create cloudflare@latest -- stats-counter   # oppure wrangler init nella cartella stats/
 *   wrangler kv namespace create COUNTS
 *   Copia questo file come src/index.js e configura wrangler.toml (vedi README).
 *
 * Variabili ambiente (Wrangler secrets):
 *   ADMIN_TOKEN   — obbligatorio per GET /stats (dashboard JSON)
 *   TRACK_SECRET  — opzionale; se impostato, POST /track richiede Authorization: Bearer …
 *
 * Endpoint pubblico POST /track  — body JSON: { "event": "demo_download" | "checkout_standard" | "checkout_pro" }
 * Dashboard GET  /stats?token=TUO_ADMIN_TOKEN
 */

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "GET" && (path === "/stats" || path.endsWith("/stats"))) {
      const token = url.searchParams.get("token") || "";
      if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return json({ error: "forbidden" }, 403, corsHeaders);
      }
      const demo = await readCount(env, "demo");
      const std = await readCount(env, "checkout_standard");
      const pro = await readCount(env, "checkout_pro");
      return json(
        {
          demo_downloads: demo,
          paypal_checkout_standard: std,
          paypal_checkout_pro: pro,
          paypal_checkout_total: std + pro,
          note:
            "paypal_* conta i clic su «Paga con PayPal», non i pagamenti completati (serve webhook PayPal per quello).",
        },
        200,
        corsHeaders,
      );
    }

    if (request.method === "POST" && (path === "/track" || path.endsWith("/track"))) {
      if (env.TRACK_SECRET) {
        const auth = request.headers.get("Authorization") || "";
        if (auth !== "Bearer " + env.TRACK_SECRET) {
          return json({ error: "unauthorized" }, 401, corsHeaders);
        }
      }

      let body = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400, corsHeaders);
      }

      const map = {
        demo_download: "demo",
        checkout_standard: "checkout_standard",
        checkout_pro: "checkout_pro",
      };
      const key = map[body.event];
      if (!key) {
        return json({ error: "unknown_event", allowed: Object.keys(map) }, 400, corsHeaders);
      }

      await increment(env, key);
      return json({ ok: true }, 200, corsHeaders);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};

function json(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

async function readCount(env, logicalKey) {
  const kv = env.COUNTS;
  if (!kv || typeof kv.get !== "function") return 0;
  const v = await kv.get(logicalKey);
  return parseInt(v || "0", 10) || 0;
}

async function increment(env, logicalKey) {
  const kv = env.COUNTS;
  if (!kv || typeof kv.get !== "function") return;
  const cur = await readCount(env, logicalKey);
  await kv.put(logicalKey, String(cur + 1));
}
