import os
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from reportlab.lib.units import inch


BASE_DIR = os.path.dirname(os.path.dirname(__file__))

PDF_DIR = os.path.join(BASE_DIR, "reports_pdfs")

os.makedirs(PDF_DIR, exist_ok=True)


def generate_report_pdf(report, sieves):
    """
    Generates a professional PDF report using ReportLab
    Returns full PDF file path
    """

    filename = f"silica_report_{report.id}.pdf"
    pdf_path = os.path.join(PDF_DIR, filename)

    doc = SimpleDocTemplate(pdf_path, pagesize=letter)
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'Title',
        parent=styles['Title'],
        fontSize=24,
        spaceAfter=30,
        alignment=1,  # Center
        textColor=colors.darkblue
    )

    heading_style = ParagraphStyle(
        'Heading',
        parent=styles['Heading1'],
        fontSize=16,
        spaceAfter=20,
        textColor=colors.darkblue
    )

    normal_style = styles['Normal']

    # Content
    content = []

    # Title
    content.append(Paragraph("Silica Lab AFS Test Report", title_style))
    content.append(Spacer(1, 0.5 * inch))

    # Report Details
    content.append(Paragraph("Report Details", heading_style))

    details_data = [
        ["Report ID:", str(report.id)],
        ["Company Name:", report.company_name],
        ["Report Date:", report.report_date.strftime('%Y-%m-%d')],
        ["Truck No:", report.truck_no],
        ["Dry Bed No:", report.dry_bed_no],
        ["Material Type:", report.material_type],
        ["Sieve Reference:", report.sieve_reference],
        ["Total Quantity:", f"{report.total_quantity:.2f} g"],
        ["Total AFS:", f"{report.total_afs:.2f}"],
    ]

    details_table = Table(details_data, colWidths=[2 * inch, 4 * inch])
    details_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
    ]))
    content.append(details_table)
    content.append(Spacer(1, 0.5 * inch))

    # Sieve Results
    content.append(Paragraph("Sieve Analysis Results", heading_style))

    sieve_data = [["Mesh Size", "Aperture (MIC)", "Weight (g)", "Multiplying Factor", "Product"]]
    for sieve in sieves:
        sieve_data.append([
            str(sieve.mesh_size),
            f"{sieve.aperture:.2f}",
            f"{sieve.weight:.2f}",
            f"{sieve.multiplying_factor:.2f}",
            f"{sieve.product:.2f}"
        ])

    sieve_table = Table(sieve_data, colWidths=[1.5 * inch, 1.5 * inch, 1.5 * inch, 1.5 * inch, 1.5 * inch])
    sieve_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
    ]))
    content.append(sieve_table)

    # Build PDF
    doc.build(content)

    return pdf_path