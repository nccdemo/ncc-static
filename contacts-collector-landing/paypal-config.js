/**
 * Dati PayPal per i pulsanti «Acquista ora».
 *
 * Modalità consigliata (meno errori GENERIC_ERROR): crea due pulsanti nel pannello PayPal
 * (Pagamenti → Pulsanti pagamento → Crea) e incolla qui gli ID «hosted_button_id».
 * Se li lasci vuoti, si usa il metodo classico _xclick con email / importo (più fragile).
 *
 * business: email PayPal verificata O Merchant ID (Profilo → Informazioni sull’account).
 */
window.PAYPAL_CONFIG = {
  business: "massimosavi48@gmail.com",
  /** Opzionale — ID pulsante ospitato dal sito PayPal (Standard). Es. "ABCDEF123..." */
  hostedButtonStandard: "",
  /** Opzionale — ID pulsante ospitato (Pro). */
  hostedButtonPro: "",
  currency: "EUR",
  returnUrl: "",
  cancelUrl: "",
  plans: {
    standard: {
      amount: "49.00",
      itemName: "Contacts Collector — Licenza standard",
    },
    pro: {
      amount: "99.00",
      itemName: "Contacts Collector — Licenza Pro",
    },
  },
};
