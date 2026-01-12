from fastapi import FastAPI, Request, Form, Depends
from fastapi.responses import RedirectResponse, HTMLResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from typing import List
from datetime import date
import os
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from io import BytesIO

from app.database import Base, engine, get_db
from app.schemas import ReportCreate, SieveInput
from app.routers import reports
from app import models

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Silica Lab Reporting System")
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

app.include_router(reports.router)


# ---------------- Lab Form ----------------
@app.get("/form")
def lab_form(request: Request):
    return templates.TemplateResponse("form.html", {"request": request})


# ---------------- Root Redirect ----------------
@app.get("/")
def root_redirect():
    return RedirectResponse(url="/dashmesh-report")


# ---------------- Submit Form ----------------
@app.post("/submit-report")
def submit_report(
    company_name: str = Form(...),
    sieve_reference: str = Form(...),
    report_date: date = Form(...),
    truck_no: str = Form(...),
    dry_bed_no: str = Form(None),
    material_type: str = Form(...),

    mesh_size: List[str] = Form(...),
    aperture: List[float] = Form(...),
    weight: List[float] = Form(...),
    multiplying_factor: List[float] = Form(...),

    db: Session = Depends(get_db)
):
    sieves = []
    for i in range(len(mesh_size)):
        sieves.append(
            SieveInput(
                mesh_size=mesh_size[i],
                aperture=aperture[i],
                weight=weight[i],
                multiplying_factor=multiplying_factor[i],
            )
        )

    report = ReportCreate(
        company_name=company_name,
        sieve_reference=sieve_reference,
        report_date=report_date,
        truck_no=truck_no,
        dry_bed_no=dry_bed_no,
        material_type=material_type,
        sieves=sieves,
    )

    result = reports.create_report(report, db)

    # Redirect to office view instead of attempting immediate PDF generation.
    return RedirectResponse(
        url="/office",
        status_code=303
    )


# ---------------- Office View ----------------
@app.get("/office")
def office_reports(request: Request, db: Session = Depends(get_db)):
    reports_list = db.query(models.Report).order_by(models.Report.id.desc()).all()
    return templates.TemplateResponse(
        "reports_list.html",
        {"request": request, "reports": reports_list}
    )


# ---------------- Portfolio ----------------
@app.get("/portfolio")
def portfolio():
    try:
        file_path = os.path.join(os.path.dirname(__file__), "../portfolio/Dharmendra_Yadav_Portfolio.html")
        with open(file_path, "r") as f:
            content = f.read()
        return HTMLResponse(content=content)
    except Exception as e:
        return HTMLResponse(content=f"<h1>Error: {str(e)}</h1>", status_code=500)


@app.get("/portfolio-v2")
def portfolio_v2():
    try:
        file_path = os.path.join(os.path.dirname(__file__), "../portfolio/Dharmendra_Yadav_Portfolio_v2.html")
        with open(file_path, "r") as f:
            content = f.read()
        return HTMLResponse(content=content)
    except Exception as e:
        return HTMLResponse(content=f"<h1>Error: {str(e)}</h1>", status_code=500)


@app.get("/portfolio.pdf")
def portfolio_pdf():
    try:
        # Generate a simple PDF using ReportLab
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        
        content = []
        content.append(Paragraph("Dharmendra Yadav - Professional Portfolio", styles['Title']))
        content.append(Spacer(1, 12))
        content.append(Paragraph("Entrepreneur | Chief Technical Adviser | Mining & Minerals Specialist", styles['Heading1']))
        content.append(Spacer(1, 12))
        content.append(Paragraph("Phone: +91 9166344448 | Email: info@silicasand.in | Location: Jaipur, India", styles['Normal']))
        content.append(Spacer(1, 12))
        content.append(Paragraph("Professional Summary: Strategic entrepreneur and technical expert with over 12 years of experience in the mining, glass, and ceramics industries...", styles['Normal']))
        # Add more content as needed
        
        doc.build(content)
        pdf_bytes = buffer.getvalue()
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=Dharmendra_Yadav_Portfolio.pdf"}
        )
    except Exception as e:
        return HTMLResponse(content=f"<h1>PDF Error: {str(e)}</h1>", status_code=500)


# ---------------- Test Page ----------------
@app.get("/test")
def test_page():
    html_content = """
    <html>
    <head><title>Test Page</title></head>
    <body>
    <h1>Test Data</h1>
    <p>Name: John Doe</p>
    <p>Age: 30</p>
    <p>Occupation: Developer</p>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)


# ---------------- Dashmesh Report ----------------
@app.get("/dashmesh-report")
def dashmesh_report():
    try:
        file_path = os.path.join(os.path.dirname(__file__), "Dashmesh/Dashmesh_Minerals_AFS_Report.html")
        with open(file_path, "r") as f:
            content = f.read()
        # Replace local logo path with static URL
        content = content.replace('src="logo.png"', 'src="/static/dashmesh_logo.png"')
        return HTMLResponse(content=content)
    except Exception as e:
        return HTMLResponse(content=f"<h1>Error: {str(e)}</h1>", status_code=500)