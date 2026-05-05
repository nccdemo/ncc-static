# Statistiche download (landing statica)

La pagina HTML **non può contare da sola** quanti file sono stati scaricati: serve un piccolo **backend** che riceve un segnale dal browser.

Questo progetto propone:

| Evento | Cosa misura |
|--------|-------------|
| `demo_download` | Clic sul pulsante «Scarica demo» (proxy del tentativo di download). |
| `checkout_standard` / `checkout_pro` | Clic su «Paga con PayPal» per quel piano — **non** è il pagamento completato (per quello servono notifiche IPN/webhook PayPal). |

## 1. Configura la landing

In `stats-config.js`:

- `endpoint`: URL completo del Worker + path `/track`, es. `https://contacts-stats.tuoaccount.workers.dev/track`
- `secret`: opzionale, se sul Worker imposti `TRACK_SECRET` (consigliato in produzione).

Aggiungi gli script in `index.html` (già predisposti se hai aggiornato il repo):

- `stats-config.js`
- `stats-track.js`

## 2. Deploy Worker (Cloudflare)

1. Installa [Wrangler](https://developers.cloudflare.com/workers/wrangler/install/) e accedi con `wrangler login`.
2. Crea un KV namespace:  
   `wrangler kv namespace create COUNTS`
3. Copia `worker.js` in un progetto Workers e associa il binding `COUNTS` al namespace creato.

Esempio `wrangler.toml`:

```toml
name = "contacts-collector-stats"
main = "worker.js"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "COUNTS"
id = "IL_TUO_KV_NAMESPACE_ID"

[vars]
# TRACK_SECRET = "..."   # meglio come secret: wrangler secret put TRACK_SECRET
# ADMIN_TOKEN = "..."    # wrangler secret put ADMIN_TOKEN
```

Imposta i secret:

```bash
wrangler secret put ADMIN_TOKEN    # token lungo casuale per leggere /stats
wrangler secret put TRACK_SECRET   # opzionale ma consigliato
```

Deploy:

```bash
wrangler deploy
```

URL pubblico sarà tipo `https://contacts-collector-stats.<subdomain>.workers.dev`.

Imposta in `stats-config.js`:

```js
endpoint: "https://contacts-collector-stats.<subdomain>.workers.dev/track",
secret: "STESSO_TRACK_SECRET",
```

## 3. Leggere i numeri

Apri nel browser (solo tu, con il token):

`https://...workers.dev/stats?token=TUO_ADMIN_TOKEN`

Risposta JSON esempio:

```json
{
  "demo_downloads": 42,
  "paypal_checkout_standard": 7,
  "paypal_checkout_pro": 3,
  "paypal_checkout_total": 10,
  "note": "..."
}
```

## Alternative

- **Analytics** (Plausible, Umami, GA4): conta eventi lato analytics invece di KV.
- **Hosting con log**: alcuni CDN mostrano hit sul file zip (non distinguono bene demo vs PayPal).
