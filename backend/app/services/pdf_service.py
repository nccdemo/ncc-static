import os

try:
    from weasyprint import HTML  # type: ignore

    PDF_ENABLED = True
except Exception as exc:  # pragma: no cover
    HTML = None  # type: ignore
    PDF_ENABLED = False
    _PDF_IMPORT_ERROR = exc


def generate_service_pdf(booking) -> str | None:
    """Generate professional service PDF from booking data and return local file path."""
    if not PDF_ENABLED:
        print(
            "WARNING: PDF generation is disabled because WeasyPrint is not available. "
            "Install 'weasyprint' and system dependencies to enable PDF output."
        )
        return None

    pdf_dir = os.path.abspath(os.path.join(os.getcwd(), "pdfs"))
    os.makedirs(pdf_dir, exist_ok=True)

    logo_path = os.path.abspath(os.path.join(os.getcwd(), "static", "logo.png"))
    logo_html = ""
    if os.path.exists(logo_path):
        logo_html = f'<img src="file://{logo_path}" alt="NCC Logo" class="logo" />'

    pdf_path = os.path.join(pdf_dir, f"service_{booking.id}.pdf")
    html_content = f"""
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {{
            font-family: Arial, sans-serif;
            color: #1f2937;
            margin: 30px;
            font-size: 13px;
          }}
          .top {{
            text-align: center;
            margin-bottom: 20px;
          }}
          .logo {{
            width: 150px;
            margin: 0 auto 14px auto;
            display: block;
          }}
          .title {{
            margin: 0;
            font-size: 24px;
            font-weight: 700;
          }}
          .subtitle {{
            margin: 4px 0 0 0;
            font-size: 14px;
            color: #4b5563;
          }}
          .section {{
            border: 1px solid #d1d5db;
            border-radius: 6px;
            padding: 14px;
            margin-top: 14px;
          }}
          .section-title {{
            font-size: 14px;
            font-weight: 700;
            margin: 0 0 10px 0;
            color: #111827;
          }}
          table {{
            width: 100%;
            border-collapse: collapse;
          }}
          td {{
            padding: 6px 4px;
            border-bottom: 1px solid #e5e7eb;
          }}
          td.label {{
            width: 40%;
            font-weight: 700;
            color: #374151;
          }}
          .status {{
            font-size: 16px;
            font-weight: 700;
            letter-spacing: 0.5px;
          }}
          .signature {{
            margin-top: 28px;
            font-size: 13px;
          }}
          .footer {{
            margin-top: 32px;
            font-size: 11px;
            color: #6b7280;
            text-align: center;
            border-top: 1px solid #e5e7eb;
            padding-top: 10px;
          }}
        </style>
      </head>
      <body>
        <div class="top">
          {logo_html}
          <h1 class="title">NCC DEMO SERVICE</h1>
          <p class="subtitle">Service Report</p>
        </div>

        <div class="section">
          <p class="section-title">Customer Details</p>
          <table>
            <tr><td class="label">Name</td><td>{booking.customer_name}</td></tr>
            <tr><td class="label">Email</td><td>{booking.email}</td></tr>
            <tr><td class="label">Phone</td><td>{booking.phone}</td></tr>
          </table>
        </div>

        <div class="section">
          <p class="section-title">Service Details</p>
          <table>
            <tr><td class="label">Date</td><td>{booking.date}</td></tr>
            <tr><td class="label">Time</td><td>{booking.time}</td></tr>
            <tr><td class="label">Number of people</td><td>{booking.people}</td></tr>
            <tr><td class="label">Flight number</td><td>{booking.flight_number or "N/A"}</td></tr>
          </table>
        </div>

        <div class="section">
          <p class="section-title">Status</p>
          <p class="status">{str(booking.status).upper()}</p>
        </div>

        <p class="signature">Driver Signature: _______________________</p>

        <div class="footer">Automatically generated document - NCC Demo</div>
      </body>
    </html>
    """

    HTML(string=html_content, base_url=os.getcwd()).write_pdf(pdf_path)  # type: ignore[misc]
    return pdf_path
