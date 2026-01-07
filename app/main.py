from fastapi import FastAPI, Request, Form, Depends
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from typing import List
from datetime import date

from app.database import Base, engine, get_db
from app.schemas import ReportCreate, SieveInput
from app.routers import reports
from app import models

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Silica Lab Reporting System")
templates = Jinja2Templates(directory="app/templates")

app.include_router(reports.router)


# ---------------- Lab Form ----------------
@app.get("/form")
def lab_form(request: Request):
    return templates.TemplateResponse("form.html", {"request": request})


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