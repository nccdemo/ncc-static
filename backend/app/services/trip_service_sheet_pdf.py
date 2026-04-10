"""Build a service sheet PDF for a trip (ReportLab)."""

from __future__ import annotations

from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models.booking import Booking
from app.models.driver import Driver
from app.models.trip import Trip
from app.models.vehicle import Vehicle


def _p(text: str | None, style) -> Paragraph:
    s = escape(str(text) if text is not None else "—")
    return Paragraph(s, style)


def build_service_sheet_pdf(
    trip: Trip,
    driver: Driver | None,
    vehicle: Vehicle | None,
    bookings: list[Booking],
) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        name="SheetTitle",
        parent=styles["Heading1"],
        fontSize=18,
        spaceAfter=16,
        textColor=colors.HexColor("#111827"),
    )
    label_style = ParagraphStyle(
        name="Label",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#6b7280"),
        spaceAfter=2,
    )
    value_style = ParagraphStyle(
        name="Value",
        parent=styles["Normal"],
        fontSize=11,
        spaceAfter=12,
        textColor=colors.HexColor("#111827"),
    )
    section_style = ParagraphStyle(
        name="Section",
        parent=styles["Heading2"],
        fontSize=13,
        spaceBefore=8,
        spaceAfter=10,
        textColor=colors.HexColor("#111827"),
    )

    story: list = []
    story.append(Paragraph(escape("Service Sheet"), title_style))
    story.append(Spacer(1, 0.2 * cm))

    story.append(Paragraph(escape("Trip"), label_style))
    story.append(_p(f"#{trip.id}", value_style))

    story.append(Paragraph(escape("Driver"), label_style))
    story.append(_p(driver.name if driver else None, value_style))

    story.append(Paragraph(escape("Vehicle"), label_style))
    if vehicle:
        veh = vehicle.name
        if vehicle.plate:
            veh = f"{vehicle.name} — {vehicle.plate}"
        story.append(_p(veh, value_style))
    else:
        story.append(_p(None, value_style))

    story.append(Paragraph(escape("Date"), label_style))
    date_str = trip.service_date.isoformat() if trip.service_date else None
    story.append(_p(date_str, value_style))

    story.append(Paragraph(escape("Bookings"), section_style))

    table_data = [
        [
            Paragraph(escape("Customer"), styles["Normal"]),
            Paragraph(escape("People"), styles["Normal"]),
            Paragraph(escape("Checked in"), styles["Normal"]),
        ]
    ]
    for b in sorted(bookings, key=lambda x: x.id):
        checked = "Yes" if b.checked_in else "No"
        table_data.append(
            [
                Paragraph(escape(str(getattr(b, "customer_name", None) or "—")), styles["Normal"]),
                Paragraph(escape(str(getattr(b, "people", None) or "—")), styles["Normal"]),
                Paragraph(escape(checked), styles["Normal"]),
            ]
        )

    if len(table_data) == 1:
        table_data.append(
            [
                Paragraph(escape("No bookings"), styles["Normal"]),
                Paragraph(escape("—"), styles["Normal"]),
                Paragraph(escape("—"), styles["Normal"]),
            ]
        )

    col_widths = [10 * cm, 2.5 * cm, 3 * cm]
    t = Table(table_data, colWidths=col_widths, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#111827")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 0), (1, -1), "CENTER"),
                ("ALIGN", (2, 0), (2, -1), "CENTER"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(t)

    doc.build(story)
    pdf = buffer.getvalue()
    buffer.close()
    return pdf
