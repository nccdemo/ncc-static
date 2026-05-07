/**
 * Config invio dati fatturazione (landing statica).
 *
 * Per inviare una mail senza backend, usa un form endpoint tipo Formspree/Getform.
 * Esempio (Formspree): endpoint: "https://formspree.io/f/XXXXX"
 *
 * Se endpoint è vuoto, la pagina NON invia nulla (solo collega l'order_id a PayPal).
 */
window.INVOICE_FORM_CONFIG = {
  endpoint: "",
  /** "json" (consigliato) oppure "form" */
  mode: "json",
  /**
   * Fallback quando endpoint è vuoto:
   * - "mailto": apre il client mail precompilato verso la PEC.
   * - "none": nessuna azione (sconsigliato).
   */
  fallback: "mailto",
  /** Destinatari email per fallback "mailto". */
  mailtoToCompany: "distemanagement@pec.it",
  mailtoToPerson: "info@distemanagement.com",
};

