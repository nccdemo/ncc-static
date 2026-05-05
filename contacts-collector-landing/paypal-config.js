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
  business: "ballestrinofrancisco@gmail.com",
  /** Opzionale — ID pulsante ospitato dal sito PayPal (1 PC / 1 anno). */
  hostedButtonStandard: "",
  /** Opzionale — ID pulsante ospitato (fino a 3 PC / 1 anno). */
  hostedButtonPro: "",
  currency: "EUR",
  /** IVA applicata ai prezzi (es. Italia 22%). */
  vatRate: 0.22,
  returnUrl: "",
  cancelUrl: "",
  plans: {
    standard: {
      netAmount: "49.00",
      itemName: "Palermo Business Agent — Licenza 1 PC / 1 anno",
    },
    pro: {
      netAmount: "99.00",
      itemName: "Palermo Business Agent — Licenza fino a 3 PC / 1 anno",
    },
  },
};
