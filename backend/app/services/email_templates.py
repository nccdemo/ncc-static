import html as html_lib

from app.config import API_PUBLIC_URL


def _safe(v) -> str:
    return "" if v is None else str(v)


def _h(text) -> str:
    return html_lib.escape(_safe(text), quote=False)


def _hattr(text) -> str:
    return html_lib.escape(_safe(text), quote=True)


def _logo_url() -> str:
    return f"{API_PUBLIC_URL}/static/logo.png"


def _quote_banner_tag() -> str:
    """Header image; falls back to logo when ``quote-banner.png`` is missing."""
    banner_src = f"{API_PUBLIC_URL}/static/quote-banner.png"
    logo = _logo_url()
    return (
        f'<img src="{_hattr(banner_src)}" width="100%" '
        f'style="display:block;width:100%;max-width:100%;height:auto;border:0;outline:none;" alt="" '
        f"onerror=\"this.onerror=null;this.src='{logo}'\" />"
    )


def _pay_cta_block(quote_url: str) -> str:
    """Primary button + plain link fallback (Italian copy)."""
    href = _hattr(quote_url)
    return f"""
      <div style="margin-top:28px; text-align:center;">
        <a href="{href}" style="display:inline-block;padding:14px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Conferma e paga ora</a>
      </div>
      <div style="margin-top:20px; font-size:13px; color:rgba(255,255,255,0.55); line-height:1.55; text-align:center;">
        Se il pulsante non funziona copia questo link:<br/>
        <span style="word-break:break-all; color:rgba(255,255,255,0.78);">{_h(quote_url)}</span>
      </div>
""".strip()


def build_custom_ride_quote_email_html(quote, quote_url: str) -> str:
    """
    HTML email for quote-only custom rides (preventivo): banner, trip box, price, CTA.
    Inline styles for client compatibility.
    """
    pickup = _h(getattr(quote, "pickup", "—"))
    destination = _h(getattr(quote, "destination", "—"))
    date = _h(getattr(quote, "date", "—"))
    time = _h(getattr(quote, "time", "—"))
    people = _h(getattr(quote, "people", 1))
    try:
        price_val = float(getattr(quote, "price", 0) or 0)
        price_display = f"{price_val:.2f}"
    except (TypeError, ValueError):
        price_display = _h(getattr(quote, "price", "—"))

    banner = _quote_banner_tag()
    cta = _pay_cta_block(quote_url)

    return f"""
<html>
  <body style="margin:0; background:#0b0f1a; padding:24px 16px; font-family:ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
    <div style="max-width:560px; margin:0 auto; background:#111827; border-radius:16px; overflow:hidden; color:#ffffff; border:1px solid rgba(255,255,255,0.10);">
      {banner}
      <div style="padding:28px 24px 32px;">
        <div style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase; color:rgba(255,255,255,0.55);">Preventivo NCC</div>
        <div style="margin-top:10px; font-size:22px; font-weight:700; letter-spacing:-0.02em; line-height:1.25;">Il tuo transfer è pronto</div>
        <div style="margin-top:14px; color:rgba(255,255,255,0.82); font-size:15px; line-height:1.6;">
          Controlla il riepilogo qui sotto e completa il pagamento in sicurezza.
        </div>

        <div style="margin-top:24px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:18px 18px 20px;">
          <div style="font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:rgba(255,255,255,0.50);">Dettagli viaggio</div>
          <div style="margin-top:14px; font-size:14px; color:rgba(255,255,255,0.94); line-height:1.65;">
            <div style="margin:8px 0; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.06);">
              <span style="color:rgba(255,255,255,0.58); display:block; font-size:12px; margin-bottom:4px;">Partenza</span>
              {pickup}
            </div>
            <div style="margin:8px 0; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.06);">
              <span style="color:rgba(255,255,255,0.58); display:block; font-size:12px; margin-bottom:4px;">Destinazione</span>
              {destination}
            </div>
            <div style="margin:8px 0; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.06);">
              <span style="color:rgba(255,255,255,0.58); display:block; font-size:12px; margin-bottom:4px;">Data e ora</span>
              {date} · {time}
            </div>
            <div style="margin:8px 0 0;">
              <span style="color:rgba(255,255,255,0.58); display:block; font-size:12px; margin-bottom:4px;">Passeggeri</span>
              {people}
            </div>
          </div>
        </div>

        <div style="margin-top:22px; background:linear-gradient(145deg, rgba(37,99,235,0.28), rgba(37,99,235,0.06)); border:1px solid rgba(59,130,246,0.45); border-radius:14px; padding:20px 18px; text-align:center;">
          <div style="font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:rgba(255,255,255,0.55);">Importo</div>
          <div style="margin-top:10px; font-size:32px; font-weight:800; color:#ffffff; letter-spacing:-0.03em;">€ {price_display}</div>
        </div>

        {cta}

        <div style="margin-top:28px; padding-top:22px; border-top:1px solid rgba(255,255,255,0.08); font-size:12px; color:rgba(255,255,255,0.45); line-height:1.5; text-align:center;">
          Grazie per aver scelto il nostro servizio.
        </div>
      </div>
    </div>
  </body>
</html>
""".strip()


def build_booking_email(booking, quote_url: str) -> str:
    """
    Branded HTML email for custom ride bookings.
    Uses inline styles for maximum email client compatibility.
    """

    pickup = _h(getattr(booking, "pickup", ""))
    destination = _h(getattr(booking, "destination", ""))
    date = _h(getattr(booking, "date", ""))
    time = _h(getattr(booking, "time", ""))
    price = _h(getattr(booking, "price", ""))
    banner = _quote_banner_tag()
    cta = _pay_cta_block(quote_url)

    return f"""
<html>
  <body style="margin:0; background:#0b0f1a; padding:24px 16px; font-family:ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
    <div style="max-width:560px; margin:0 auto; background:#111827; border-radius:16px; overflow:hidden; color:#ffffff; border:1px solid rgba(255,255,255,0.10);">
      {banner}
      <div style="padding:28px 24px 32px;">
        <div style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase; color:rgba(255,255,255,0.55);">NCC</div>
        <div style="margin-top:10px; font-size:22px; font-weight:700; letter-spacing:-0.02em;">Your ride is ready</div>

        <div style="margin-top:16px; color:rgba(255,255,255,0.84); font-size:15px; line-height:1.6;">
          Review the details below, then confirm and pay securely.
        </div>

        <div style="margin-top:22px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:18px;">
          <div style="font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:rgba(255,255,255,0.50);">Trip details</div>
          <div style="margin-top:12px; font-size:14px; color:rgba(255,255,255,0.94); line-height:1.65;">
            <div style="margin:8px 0;"><span style="color:rgba(255,255,255,0.58);">Pickup:</span> {pickup}</div>
            <div style="margin:8px 0;"><span style="color:rgba(255,255,255,0.58);">Destination:</span> {destination}</div>
            <div style="margin:8px 0;"><span style="color:rgba(255,255,255,0.58);">Date:</span> {date}</div>
            <div style="margin:8px 0;"><span style="color:rgba(255,255,255,0.58);">Time:</span> {time}</div>
          </div>
        </div>

        <div style="margin-top:20px; background:linear-gradient(145deg, rgba(37,99,235,0.28), rgba(37,99,235,0.06)); border:1px solid rgba(59,130,246,0.45); border-radius:14px; padding:20px 18px; text-align:center;">
          <div style="font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:rgba(255,255,255,0.55);">Total</div>
          <div style="margin-top:10px; font-size:28px; font-weight:800; color:#ffffff;">€ {price}</div>
        </div>

        {cta}
      </div>
    </div>
  </body>
</html>
""".strip()

