from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os

from app.database import get_db
from app import models
from app.schemas import ReportCreate
from app.utils_pdf import generate_report_pdf

router = APIRouter(prefix="/reports", tags=["Reports"])


# =========================================================
# INTERNAL FUNCTION (USED BY /submit-report)
# =========================================================
def create_report(report: ReportCreate, db: Session):
    total_quantity = 0.0
    total_product = 0.0

    db_report = models.Report(
        company_name=report.company_name,
        sieve_reference=report.sieve_reference,
        report_date=report.report_date,
        truck_no=report.truck_no,
        dry_bed_no=report.dry_bed_no,
        material_type=report.material_type,
    )

    db.add(db_report)
    db.flush()  # get ID before commit

    for sieve in report.sieves:
        product = sieve.weight * sieve.multiplying_factor

        total_quantity += sieve.weight
        total_product += product

        db_sieve = models.SieveResult(
            report_id=db_report.id,
            mesh_size=sieve.mesh_size,
            aperture=sieve.aperture,
            weight=sieve.weight,
            multiplying_factor=sieve.multiplying_factor,
            product=product,
        )
        db.add(db_sieve)

    db_report.total_quantity = total_quantity

    # ✅ Correct AFS formula
    db_report.total_afs = round(total_product / total_quantity, 2)

    db.commit()
    db.refresh(db_report)

    return db_report


# =========================================================
# PDF DOWNLOAD ENDPOINT (OFFICE + REDIRECT)
# =========================================================
@router.get("/{report_id}/pdf")
def get_report_pdf(report_id: int, db: Session = Depends(get_db)):
    report = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    sieves = (
        db.query(models.SieveResult)
        .filter(models.SieveResult.report_id == report_id)
        .all()
    )

    try:
        pdf_path = generate_report_pdf(report, sieves)
    except RuntimeError as e:
        # Likely WeasyPrint or its system dependencies are missing.
        raise HTTPException(
            status_code=503,
            detail=("PDF generation failed. Ensure WeasyPrint and its system dependencies (Cairo, Pango, GDK) are installed. "
                    f"Original error: {e}"),
        )

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=os.path.basename(pdf_path),
    )