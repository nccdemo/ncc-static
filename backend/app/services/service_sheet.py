from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime

from sqlalchemy.orm import Session, joinedload

from app.models.trip import Trip


@dataclass(frozen=True)
class ServiceSheetData:
    trip_id: int
    company: str
    driver: str
    vehicle: str
    plate: str
    date: str
    service_start_time: datetime | None
    service_end_time: datetime | None
    customer: str
    passengers: int
    pickup: str
    destination: str
    start_km: float | None
    end_km: float | None
    notes: str

    def to_dict(self) -> dict:
        return asdict(self)


def _iso_date(v: date | None) -> str:
    if v is None:
        return ""
    return v.isoformat()


def _it_date(v: date | None) -> str:
    if v is None:
        return ""
    return v.strftime("%d/%m/%Y")


def _hhmm(v: datetime | None) -> str:
    if v is None:
        return ""
    return v.strftime("%H:%M")


def _fmt_km(v: float | int | None) -> str:
    if v is None:
        return ""
    try:
        n = float(v)
        # Keep integers clean, floats with one decimal.
        return str(int(n)) if n.is_integer() else f"{n:.1f}"
    except Exception:
        return str(v)


def build_service_sheet_data(db: Session, trip_id: int) -> ServiceSheetData | None:
    trip = (
        db.query(Trip)
        .options(joinedload(Trip.driver), joinedload(Trip.vehicle), joinedload(Trip.bookings))
        .filter(Trip.id == trip_id)
        .first()
    )
    if trip is None:
        return None

    company_name = "NCC"

    booking = trip.booking
    customer = (getattr(booking, "customer_name", None) if booking else None) or "—"

    passengers = getattr(trip, "passengers", None)
    if passengers is None or int(passengers) < 1:
        passengers = int(getattr(booking, "people", 1) or 1) if booking else 1

    service_date = getattr(trip, "service_date", None) or (getattr(booking, "date", None) if booking else None)

    pickup = getattr(trip, "pickup", None) or (getattr(booking, "pickup", None) if booking else None) or "—"
    destination = getattr(trip, "destination", None) or (getattr(booking, "destination", None) if booking else None) or "—"

    driver_name = (getattr(trip.driver, "name", None) if trip.driver else None) or "—"
    vehicle_name = (getattr(trip.vehicle, "name", None) if trip.vehicle else None) or "—"
    plate = (getattr(trip.vehicle, "plate", None) if trip.vehicle else None) or "—"

    return ServiceSheetData(
        trip_id=int(trip.id),
        company=company_name,
        driver=driver_name,
        vehicle=vehicle_name,
        plate=plate,
        date=_it_date(service_date),
        service_start_time=getattr(trip, "service_start_time", None) or getattr(trip, "started_at", None),
        service_end_time=getattr(trip, "service_end_time", None) or getattr(trip, "completed_at", None),
        customer=customer,
        passengers=int(passengers),
        pickup=pickup,
        destination=destination,
        start_km=getattr(trip, "start_km", None),
        end_km=getattr(trip, "end_km", None),
        notes=str(getattr(trip, "notes", None) or ""),
    )


def generate_service_sheet_pdf_bytes(data: dict) -> bytes:
    """
    Generate a robust ReportLab PDF for the service sheet.
    All values should be safe strings (or will be stringified).
    """

    from io import BytesIO

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    def safe(val) -> str:
        if val is None:
            return ""
        try:
            iso = getattr(val, "isoformat", None)
            if callable(iso):
                return str(iso())
        except Exception:
            pass
        return str(val)

    raw = data or {}
    d = {k: safe(v) for k, v in raw.items()}

    def val(key: str, fallback: str = "—") -> str:
        v = d.get(key, "")
        return v if str(v).strip() else fallback

    def hhmm_key(key: str) -> str:
        v = raw.get(key)
        return _hhmm(v) if isinstance(v, datetime) else (val(key, "")[:5] if val(key, "") else "")

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.8 * cm,
    )
    styles = getSampleStyleSheet()

    title = ParagraphStyle(
        name="TitleIt",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.black,
        spaceAfter=10,
    )
    subtitle = ParagraphStyle(
        name="SubtitleIt",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.black,
        spaceAfter=16,
    )
    section = ParagraphStyle(
        name="SectionIt",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11,
        textColor=colors.black,
        spaceBefore=8,
        spaceAfter=6,
    )
    label = ParagraphStyle(
        name="LabelIt",
        parent=styles["Normal"],
        fontSize=9,
        textColor=colors.black,
    )
    value_style = ParagraphStyle(
        name="ValueIt",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.black,
    )

    def kv_table(rows: list[list[str]]) -> Table:
        t = Table(rows, colWidths=[4.2 * cm, 11.6 * cm])
        t.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.black),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        return t

    elements: list = []
    elements.append(Paragraph("FOGLIO DI SERVIZIO NCC", title))
    elements.append(
        Paragraph(
            f"{val('company', 'NCC – Azienda')} · Data: {val('date', '—')}",
            subtitle,
        )
    )

    elements.append(Paragraph("DATI SERVIZIO", section))
    elements.append(
        kv_table(
            [
                [Paragraph("Trip ID", label), Paragraph(val("trip_id"), value_style)],
                [Paragraph("Cliente", label), Paragraph(val("customer"), value_style)],
                [Paragraph("Autista", label), Paragraph(val("driver"), value_style)],
                [
                    Paragraph("Veicolo", label),
                    Paragraph(f"{val('vehicle')} · {val('plate')}", value_style),
                ],
            ]
        )
    )

    elements.append(Spacer(1, 10))
    elements.append(Paragraph("PERCORSO", section))
    elements.append(
        kv_table(
            [
                [Paragraph("Partenza", label), Paragraph(val("pickup"), value_style)],
                [Paragraph("Destinazione", label), Paragraph(val("destination"), value_style)],
            ]
        )
    )

    elements.append(Spacer(1, 10))
    elements.append(Paragraph("ORARI", section))
    start_hhmm = hhmm_key("service_start_time")
    end_hhmm = hhmm_key("service_end_time")
    elements.append(
        kv_table(
            [
                [Paragraph("Inizio servizio", label), Paragraph(start_hhmm or "—", value_style)],
                [Paragraph("Fine servizio", label), Paragraph(end_hhmm or "—", value_style)],
            ]
        )
    )

    start_km_raw = raw.get("start_km")
    end_km_raw = raw.get("end_km")
    total_km = None
    try:
        if start_km_raw is not None and end_km_raw is not None:
            total_km = float(end_km_raw) - float(start_km_raw)
    except Exception:
        total_km = None

    elements.append(Spacer(1, 10))
    elements.append(Paragraph("CHILOMETRAGGIO", section))
    elements.append(
        kv_table(
            [
                [Paragraph("KM iniziali", label), Paragraph(_fmt_km(start_km_raw) or "—", value_style)],
                [Paragraph("KM finali", label), Paragraph(_fmt_km(end_km_raw) or "—", value_style)],
                [
                    Paragraph("Totale KM", label),
                    Paragraph(_fmt_km(total_km) if total_km is not None else "—", value_style),
                ],
            ]
        )
    )

    elements.append(Spacer(1, 16))
    elements.append(Paragraph("NOTE", section))
    notes = val("notes", "—")
    elements.append(Paragraph(notes, value_style))

    elements.append(Spacer(1, 22))
    sign = Table(
        [[Paragraph("Firma autista", label), ""]],
        colWidths=[4.2 * cm, 11.6 * cm],
    )
    sign.setStyle(
        TableStyle(
            [
                ("LINEBELOW", (1, 0), (1, 0), 0.7, colors.black),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
            ]
        )
    )
    elements.append(sign)

    doc.build(elements)
    return buffer.getvalue()


def render_service_sheet_html(data: dict) -> str:
    """
    Render a printable HTML document for the service sheet using inline CSS.
    """

    def row(label: str, value: str) -> str:
        return f"""
          <div style="display:flex; justify-content:space-between; gap:16px; padding:8px 0; border-bottom:1px solid #e5e7eb;">
            <div style="color:#6b7280; font-size:12px; text-transform:uppercase; letter-spacing:0.08em;">{label}</div>
            <div style="color:#111827; font-size:14px; font-weight:600; text-align:right;">{value}</div>
          </div>
        """.strip()

    html = f"""
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Service Sheet</title>
  </head>
  <body style="margin:0; padding:24px; background:#f9fafb; font-family:ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
    <div style="max-width:800px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:16px; padding:24px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">
        <div>
          <div style="font-size:20px; font-weight:800; color:#111827;">Foglio di Servizio</div>
          <div style="margin-top:4px; font-size:13px; color:#6b7280;">Generated by NCC platform</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px; color:#6b7280;">Company</div>
          <div style="font-size:14px; font-weight:700; color:#111827;">{data.get("company") or "—"}</div>
        </div>
      </div>

      <div style="margin-top:20px;">
        <div style="font-size:13px; font-weight:700; color:#111827; margin-bottom:8px;">Operative</div>
        {row("Driver", str(data.get("driver") or "—"))}
        {row("Vehicle", str(data.get("vehicle") or "—"))}
        {row("Plate", str(data.get("plate") or "—"))}
      </div>

      <div style="margin-top:20px;">
        <div style="font-size:13px; font-weight:700; color:#111827; margin-bottom:8px;">Timing</div>
        {row("Date", str(data.get("date") or "—"))}
        {row("Start time", str(data.get("start_time") or "—"))}
        {row("End time", str(data.get("end_time") or "—"))}
      </div>

      <div style="margin-top:20px;">
        <div style="font-size:13px; font-weight:700; color:#111827; margin-bottom:8px;">Customer</div>
        {row("Customer", str(data.get("customer") or "—"))}
        {row("Passengers", str(data.get("passengers") or "—"))}
      </div>

      <div style="margin-top:20px;">
        <div style="font-size:13px; font-weight:700; color:#111827; margin-bottom:8px;">Route</div>
        {row("Pickup", str(data.get("pickup") or "—"))}
        {row("Destination", str(data.get("destination") or "—"))}
      </div>

      <div style="margin-top:20px;">
        <div style="font-size:13px; font-weight:700; color:#111827; margin-bottom:8px;">KM</div>
        {row("Start KM", str(data.get("start_km") if data.get("start_km") is not None else "—"))}
        {row("End KM", str(data.get("end_km") if data.get("end_km") is not None else "—"))}
      </div>
    </div>
  </body>
</html>
    """.strip()

    return html

