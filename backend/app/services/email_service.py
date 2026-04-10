import logging
import os
import smtplib
from email.message import EmailMessage
from io import BytesIO
from pathlib import Path

from app.config import FRONTEND_URL, public_tracking_url
from app.services.email_templates import build_custom_ride_quote_email_html
from app.services.qr_service import generate_booking_qr

logger = logging.getLogger(__name__)

def build_quote_email_body(*, quote_url: str) -> str:
    return "\n".join(
        [
            "Hello,",
            "",
            "Your ride quote is ready.",
            "",
            "Click here to confirm and pay:",
            quote_url,
            "",
            "Thank you.",
        ]
    )


def send_quote_email(to_email: str, quote_url: str) -> dict:
    """
    Send the customer a quote link for custom rides.
    ``quote_url`` must be absolute; build with ``FRONTEND_URL`` from ``app.config`` (e.g. ``f"{FRONTEND_URL}/quote/<id>"``).

    Env: SMTP_HOST or SMTP_SERVER, SMTP_PORT, SMTP_USER or EMAIL_USER,
    SMTP_PASSWORD or EMAIL_PASS, SMTP_FROM (optional; falls back to user/company).
    Port 465 uses SSL; other ports use STARTTLS (e.g. Gmail 587).
    """

    subject = "Your Ride Quote"
    body = build_quote_email_body(quote_url=quote_url)

    smtp_host = os.getenv("SMTP_HOST") or os.getenv("SMTP_SERVER", "smtps.aruba.it")
    smtp_port = int(os.getenv("SMTP_PORT", "465"))
    smtp_user = os.getenv("SMTP_USER") or os.getenv("EMAIL_USER")
    smtp_pass = os.getenv("SMTP_PASSWORD") or os.getenv("EMAIL_PASS")
    from_addr = os.getenv("SMTP_FROM") or smtp_user or os.getenv("COMPANY_EMAIL") or ""

    if not smtp_user or not smtp_pass or not from_addr:
        logger.warning("send_quote_email: missing SMTP_USER/EMAIL_USER, password, or SMTP_FROM")
        return {"sent": False, "reason": "missing_credentials"}

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = from_addr
    message["To"] = to_email
    message["Reply-To"] = os.getenv("COMPANY_EMAIL", from_addr)
    message.set_content(body)

    try:
        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port) as smtp:
                smtp.login(smtp_user, smtp_pass)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(smtp_host, smtp_port) as smtp:
                smtp.starttls()
                smtp.login(smtp_user, smtp_pass)
                smtp.send_message(message)
        logger.info("Quote email sent to %s", to_email)
        return {"sent": True, "to": to_email}
    except Exception as e:
        logger.error("send_quote_email failed: %s", e)
        return {"sent": False, "error": str(e), "to": to_email}


def build_custom_ride_quote_body(*, quote, quote_url: str) -> str:
    price = float(getattr(quote, "price", 0) or 0)
    return "\n".join(
        [
            "Ciao,",
            "",
            "Ecco il riepilogo del tuo transfer:",
            "",
            f"Partenza: {getattr(quote, 'pickup', '—')}",
            f"Destinazione: {getattr(quote, 'destination', '—')}",
            f"Data: {getattr(quote, 'date', '—')}",
            f"Ora: {getattr(quote, 'time', '—')}",
            f"Passeggeri: {getattr(quote, 'people', 1)}",
            f"Prezzo: € {price:.2f}",
            "",
            "Per confermare e pagare (carta) apri questo link:",
            quote_url,
            "",
            "Grazie.",
        ]
    )


def send_custom_ride_quote_email(*, to_email: str, quote, quote_url: str) -> dict:
    """Email inviata alla creazione del solo preventivo (nessun trip / booking ancora)."""
    subject = "Preventivo transfer — link per pagare"
    body = build_custom_ride_quote_body(quote=quote, quote_url=quote_url)
    html_body = build_custom_ride_quote_email_html(quote, quote_url)
    return send_email(
        to_email=to_email,
        subject=subject,
        body=body,
        html_body=html_body,
    )


def send_trip_confirmed_email(*, to_email: str, booking, trip) -> dict:
    """
    Dopo pagamento: trip creato, cliente riceve conferma con QR e link tracciamento.
    """
    booking_id = int(getattr(booking, "id"))
    customer_name = str(getattr(booking, "customer_name", "") or "Cliente")
    track_url = public_tracking_url(getattr(trip, "tracking_token", None))

    subject = "Trip confermato"
    body = (
        f"Ciao {customer_name},\n\n"
        f"Il tuo transfer è confermato.\n\n"
        f"Prenotazione: #{booking_id}\n"
        f"Partenza: {getattr(booking, 'pickup', '—')}\n"
        f"Destinazione: {getattr(booking, 'destination', '—')}\n"
        f"Data: {getattr(booking, 'date', '—')} Ora: {getattr(booking, 'time', '—')}\n"
        f"Passeggeri: {getattr(booking, 'people', '—')}\n\n"
        f"Segui il veicolo: {track_url}\n\n"
        f"In allegato il QR per il check-in a bordo.\n\n"
        f"Grazie.\n"
    )

    smtp_host = os.getenv("SMTP_HOST") or os.getenv("SMTP_SERVER", "smtps.aruba.it")
    smtp_port = int(os.getenv("SMTP_PORT", "465"))
    smtp_user = os.getenv("SMTP_USER") or os.getenv("EMAIL_USER")
    smtp_pass = os.getenv("SMTP_PASSWORD") or os.getenv("EMAIL_PASS")
    from_addr = os.getenv("SMTP_FROM") or smtp_user or os.getenv("COMPANY_EMAIL") or ""

    if not smtp_user or not smtp_pass or not from_addr:
        logger.warning("send_trip_confirmed_email: missing SMTP credentials")
        return {"sent": False, "reason": "missing_credentials"}

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = from_addr
    message["To"] = to_email
    message["Reply-To"] = os.getenv("COMPANY_EMAIL", from_addr)
    message.set_content(body)

    try:
        qr_code, qr_path = generate_booking_qr(booking_id)
        try:
            if getattr(booking, "qr_code", None) in (None, ""):
                setattr(booking, "qr_code", qr_code)
        except Exception:
            pass
        qr_bytes = Path(qr_path).read_bytes()
        message.add_attachment(
            qr_bytes,
            maintype="image",
            subtype="png",
            filename=Path(qr_path).name,
        )
    except Exception as e:
        logger.warning("send_trip_confirmed_email: QR attach failed: %s", e)

    try:
        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port) as smtp:
                smtp.login(smtp_user, smtp_pass)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(smtp_host, smtp_port) as smtp:
                smtp.starttls()
                smtp.login(smtp_user, smtp_pass)
                smtp.send_message(message)
        logger.info("Trip confermato email sent to %s booking_id=%s", to_email, booking_id)
        return {"sent": True, "to": to_email, "booking_id": booking_id}
    except Exception as e:
        logger.error("send_trip_confirmed_email failed: %s", e)
        return {"sent": False, "error": str(e), "to": to_email}


def send_booking_email(
    to_email: str,
    customer_name: str,
    tour_name: str,
    date: str,
    passengers: int,
    booking_id: int,
) -> dict:
    """
    Customer confirmation after Stripe payment (tour instance checkout).
    Env: SMTP_HOST or SMTP_SERVER, SMTP_PORT, SMTP_USER or EMAIL_USER,
    SMTP_PASSWORD or EMAIL_PASS, SMTP_FROM (optional; falls back to user/company).
    Port 465 uses SSL; other ports use STARTTLS (e.g. Gmail 587).
    """
    subject = "Booking confirmation"
    body = (
        f"Hello {customer_name},\n\n"
        f"Your booking is confirmed.\n\n"
        f"Booking Reference: #{booking_id}\n\n"
        f"Tour: {tour_name}\n"
        f"Date: {date}\n"
        f"Passengers: {passengers}\n\n"
        f"Your check-in QR code is attached to this email.\n\n"
        f"Thank you for your purchase!\n"
    )

    smtp_host = os.getenv("SMTP_HOST") or os.getenv("SMTP_SERVER", "smtps.aruba.it")
    smtp_port = int(os.getenv("SMTP_PORT", "465"))
    smtp_user = os.getenv("SMTP_USER") or os.getenv("EMAIL_USER")
    smtp_pass = os.getenv("SMTP_PASSWORD") or os.getenv("EMAIL_PASS")
    from_addr = os.getenv("SMTP_FROM") or smtp_user or os.getenv("COMPANY_EMAIL") or ""

    if not smtp_user or not smtp_pass or not from_addr:
        logger.warning("send_booking_email: missing SMTP_USER/EMAIL_USER, password, or SMTP_FROM")
        return {"sent": False, "reason": "missing_credentials"}

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = from_addr
    message["To"] = to_email
    message["Reply-To"] = os.getenv("COMPANY_EMAIL", from_addr)
    message.set_content(body)

    try:
        _, qr_ref = generate_booking_qr(booking_id)
        if isinstance(qr_ref, BytesIO):
            qr_bytes = qr_ref.getvalue()
            qr_filename = f"booking_{booking_id}_qr.png"
        else:
            qr_path = Path(qr_ref)
            qr_bytes = qr_path.read_bytes()
            qr_filename = qr_path.name
        message.add_attachment(
            qr_bytes,
            maintype="image",
            subtype="png",
            filename=qr_filename,
        )
    except Exception as e:
        logger.warning("send_booking_email: could not attach QR for booking %s: %s", booking_id, e)

    try:
        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port) as smtp:
                smtp.login(smtp_user, smtp_pass)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(smtp_host, smtp_port) as smtp:
                smtp.starttls()
                smtp.login(smtp_user, smtp_pass)
                smtp.send_message(message)
        logger.info("Booking confirmation email sent to %s (booking_id=%s)", to_email, booking_id)
        return {"sent": True, "to": to_email, "booking_id": booking_id}
    except Exception as e:
        logger.error("send_booking_email failed: %s", e)
        return {"sent": False, "error": str(e), "to": to_email}


def send_booking_refunded_email(*, to_email: str, booking) -> dict:
    """
    Simple notification when a tour booking has been refunded.
    """

    booking_id = int(getattr(booking, "id"))
    customer_name = str(getattr(booking, "customer_name", "") or "Cliente")
    amount = float(getattr(booking, "price", 0) or 0)
    created_at = getattr(booking, "created_at", None)
    payment_intent_id = getattr(booking, "payment_intent_id", None)

    # Best-effort formatting for date.
    try:
        created_str = created_at.strftime("%d/%m/%Y %H:%M") if created_at is not None else "-"
    except Exception:
        created_str = str(created_at) if created_at is not None else "-"

    subject = "Il tuo tour è stato rimborsato"
    body = (
        f"Ciao {customer_name},\n\n"
        f"abbiamo effettuato il rimborso del tuo pagamento.\n\n"
        f"Dettagli rimborso:\n"
        f"- Prenotazione: #{booking_id}\n"
        f"- Importo rimborsato: € {amount:.2f}\n"
        f"- Data operazione: {created_str}\n"
        f"- Payment Intent: {payment_intent_id or '-'}\n\n"
        f"Il riaccredito effettivo può richiedere alcuni giorni lavorativi in base alla tua banca / carta.\n\n"
        f"Se hai domande contattaci rispondendo a questa email.\n"
    )

    smtp_host = os.getenv("SMTP_HOST") or os.getenv("SMTP_SERVER", "smtps.aruba.it")
    smtp_port = int(os.getenv("SMTP_PORT", "465"))
    smtp_user = os.getenv("SMTP_USER") or os.getenv("EMAIL_USER")
    smtp_pass = os.getenv("SMTP_PASSWORD") or os.getenv("EMAIL_PASS")
    from_addr = os.getenv("SMTP_FROM") or smtp_user or os.getenv("COMPANY_EMAIL") or ""

    if not smtp_user or not smtp_pass or not from_addr:
        logger.warning("send_booking_refunded_email: missing SMTP credentials")
        return {"sent": False, "reason": "missing_credentials"}

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = from_addr
    message["To"] = to_email
    message["Reply-To"] = os.getenv("COMPANY_EMAIL", from_addr)
    message.set_content(body)

    try:
        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port) as smtp:
                smtp.login(smtp_user, smtp_pass)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(smtp_host, smtp_port) as smtp:
                smtp.starttls()
                smtp.login(smtp_user, smtp_pass)
                smtp.send_message(message)
        logger.info("Booking refunded email sent to %s (booking_id=%s)", to_email, booking_id)
        return {"sent": True, "to": to_email, "booking_id": booking_id}
    except Exception as e:
        logger.error("send_booking_refunded_email failed: %s", e)
        return {"sent": False, "error": str(e), "to": to_email, "booking_id": booking_id}

def send_confirmation_email(*, to_email: str, booking) -> dict:
    """
    Confirmation email after Stripe payment (custom rides).
    Attaches a QR code image using qr_service.generate_booking_qr().
    """

    booking_id = int(getattr(booking, "id"))
    customer_name = str(getattr(booking, "customer_name", "") or "Guest")
    subject = "Booking confirmation"
    body = (
        f"Hello {customer_name},\n\n"
        f"Your booking is confirmed.\n\n"
        f"Booking Reference: #{booking_id}\n"
        f"Pickup: {getattr(booking, 'pickup', '-')}\n"
        f"Destination: {getattr(booking, 'destination', '-')}\n"
        f"Date: {getattr(booking, 'date', '-')}\n"
        f"Time: {getattr(booking, 'time', '-')}\n"
        f"Passengers: {getattr(booking, 'people', '-')}\n"
        f"Total: € {getattr(booking, 'price', '-')}\n\n"
        f"Your check-in QR code is attached to this email.\n\n"
        f"Thank you.\n"
    )

    smtp_host = os.getenv("SMTP_HOST") or os.getenv("SMTP_SERVER", "smtps.aruba.it")
    smtp_port = int(os.getenv("SMTP_PORT", "465"))
    smtp_user = os.getenv("SMTP_USER") or os.getenv("EMAIL_USER")
    smtp_pass = os.getenv("SMTP_PASSWORD") or os.getenv("EMAIL_PASS")
    from_addr = os.getenv("SMTP_FROM") or smtp_user or os.getenv("COMPANY_EMAIL") or ""

    if not smtp_user or not smtp_pass or not from_addr:
        logger.warning("send_confirmation_email: missing SMTP_USER/EMAIL_USER, password, or SMTP_FROM")
        return {"sent": False, "reason": "missing_credentials"}

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = from_addr
    message["To"] = to_email
    message["Reply-To"] = os.getenv("COMPANY_EMAIL", from_addr)
    message.set_content(body)

    try:
        qr_code, qr_path = generate_booking_qr(booking_id)
        try:
            # Persist qr_code string on booking if field exists and not set.
            if getattr(booking, "qr_code", None) in (None, ""):
                setattr(booking, "qr_code", qr_code)
        except Exception:
            pass

        qr_bytes = Path(qr_path).read_bytes()
        message.add_attachment(
            qr_bytes,
            maintype="image",
            subtype="png",
            filename=Path(qr_path).name,
        )
    except Exception as e:
        logger.warning("send_confirmation_email: could not attach QR for booking %s: %s", booking_id, e)

    try:
        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port) as smtp:
                smtp.login(smtp_user, smtp_pass)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(smtp_host, smtp_port) as smtp:
                smtp.starttls()
                smtp.login(smtp_user, smtp_pass)
                smtp.send_message(message)
        logger.info("Confirmation email sent to %s (booking_id=%s)", to_email, booking_id)
        return {"sent": True, "to": to_email, "booking_id": booking_id}
    except Exception as e:
        logger.error("send_confirmation_email failed: %s", e)
        return {"sent": False, "error": str(e), "to": to_email, "booking_id": booking_id}


def send_email(
    to_email: str,
    subject: str,
    body: str,
    attachment_path: str | None = None,
    attachment_bytes: bytes | None = None,
    attachment_filename: str | None = None,
    html_body: str | None = None,
) -> dict:
    """
    Send an email through SMTP over SSL (Aruba: smtps.aruba.it:465).
    Failures are logged and never propagated — callers keep running.
    """
    SMTP_SERVER = os.getenv("SMTP_SERVER", "smtps.aruba.it")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
    EMAIL_USER = os.getenv("EMAIL_USER")
    EMAIL_PASS = os.getenv("EMAIL_PASS")
    company_email = os.getenv("COMPANY_EMAIL", EMAIL_USER or "")

    if not EMAIL_USER or not EMAIL_PASS:
        logger.warning("Email not sent: missing EMAIL_USER or EMAIL_PASS")
        return {
            "sent": False,
            "to": to_email,
            "subject": subject,
            "attachment": attachment_path,
            "reason": "missing_credentials",
        }

    message = EmailMessage()
    message["From"] = EMAIL_USER
    message["To"] = to_email
    message["Reply-To"] = company_email
    message["Subject"] = subject
    message.set_content(body)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    if attachment_path:
        file_path = Path(attachment_path)
        if file_path.exists() and file_path.is_file():
            with file_path.open("rb") as file:
                file_data = file.read()
            message.add_attachment(
                file_data,
                maintype="application",
                subtype="pdf",
                filename=file_path.name,
            )
    elif attachment_bytes:
        message.add_attachment(
            attachment_bytes,
            maintype="application",
            subtype="pdf",
            filename=attachment_filename or "attachment.pdf",
        )

    try:
        smtp = smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT)
        smtp.login(EMAIL_USER, EMAIL_PASS)
        smtp.send_message(message)
        smtp.quit()
        logger.info("Email sent to: %s", to_email)
        return {
            "sent": True,
            "provider": "smtp_ssl",
            "to": to_email,
            "subject": subject,
            "attachment": attachment_path or attachment_filename,
        }
    except Exception as e:
        logger.error("send_email failed: %s", e)
        return {
            "sent": False,
            "to": to_email,
            "subject": subject,
            "attachment": attachment_path or attachment_filename,
            "error": str(e),
        }


def build_booking_email_body(booking, qr_path: str | None = None) -> str:
    lines = [
        f"Booking ID: {booking.id}",
        f"Customer: {booking.customer_name}",
        f"Email: {booking.email}",
        f"Phone: {booking.phone}",
        f"Date: {booking.date}",
        f"Time: {booking.time}",
        f"Passengers: {booking.people}",
        f"Vehicle ID: {booking.vehicle_id or '-'}",
        f"Status: {booking.status}",
    ]
    if booking.qr_code:
        lines.append(f"QR Code: {booking.qr_code}")
    if qr_path:
        lines.append(f"QR Image: {qr_path}")
    return "\n".join(lines)


def build_service_started_email_body(booking, pdf_path: str) -> str:
    return "\n".join(
        [
            f"Service started for booking #{booking.id}",
            f"Customer: {booking.customer_name}",
            f"Date: {booking.date} {booking.time}",
            f"Vehicle ID: {booking.vehicle_id or '-'}",
            f"Current status: {booking.status}",
            f"Updated PDF: {pdf_path}",
        ]
    )


def build_payment_success_email_body(booking, pdf_path: str) -> str:
    return "\n".join(
        [
            f"Payment received for booking #{booking.id}",
            f"Customer: {booking.customer_name}",
            f"Service date: {booking.date} {booking.time}",
            f"Passengers: {booking.people}",
            f"Vehicle ID: {booking.vehicle_id or '-'}",
            f"Booking status: {booking.status}",
            f"Service PDF: {pdf_path}",
        ]
    )
