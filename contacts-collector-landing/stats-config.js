/**
 * Statistiche download / checkout (richiede un endpoint server — vedi cartella stats/).
 *
 * 1. Deploy del Worker Cloudflare (o tuo API compatibile POST JSON).
 * 2. Imposta qui l'URL completo dell'endpoint /track e (opzionale) secret condiviso.
 *
 * Se endpoint è vuoto, nessuna richiesta viene inviata.
 */
window.STATS_CONFIG = {
  endpoint: "",
  /** Opzionale: stesso valore di TRACK_SECRET sul Worker (header Authorization: Bearer …) */
  secret: "",
};
