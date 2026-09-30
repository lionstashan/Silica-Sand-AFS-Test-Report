from fastapi import FastAPI, Request, Form, Depends, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse, FileResponse, Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import distinct, func
from sqlalchemy.orm import Session
from typing import List
from datetime import date, datetime, timedelta
import os
import secrets
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from io import BytesIO

from app.database import Base, engine, get_db
from app.schemas import ReportCreate, SieveInput
from app.routers import reports
from app import models


APPLICATIONS = {
    "glass-grade-silica-sand": {
        "name": "Glass-grade silica sand",
        "title": "Glass-grade silica sand consulting",
        "description": "Mine-to-plant technical guidance for consistent glass-grade silica sand, from deposit evaluation and beneficiation to quality control and supply planning.",
        "intro": "Glass production needs a stable mineral input, not an occasional good test result. Advisory work connects resource variability, impurity removal, particle-size control and plant discipline to the glassmaker's specification.",
        "priorities": ["SiO2 and iron-bearing impurity control", "Consistent particle-size distribution", "Moisture, contamination and stockpile discipline", "Reliable quality across changing mine faces"],
        "services": ["Deposit and raw-sand suitability review", "Beneficiation flowsheet and equipment-duty review", "Plant trials, calibration and recovery improvement", "Product qualification and supply consistency planning"],
        "outcome": "A practical operating route to repeatable glass-grade product quality at commercial scale.",
        "theme": "glass",
        "image": "/static/consulting/open-source/app-glass.webp",
        "image_alt": "Robotic handling of float glass sheets on an industrial production line",
        "image_credit": "ICAPlants, Wikimedia Commons, CC BY-SA 3.0. Cropped and converted to WebP.",
        "image_source": "https://commons.wikimedia.org/wiki/File:Float_Glass_Unloading.jpg",
        "quality": [
            {"name": "Chemistry", "detail": "SiO2 and buyer-specific limits for Fe2O3, Al2O3, TiO2 and other colour-forming impurities."},
            {"name": "Particle sizing", "detail": "Controlled top size, fines and distribution for batch melting, handling and segregation behaviour."},
            {"name": "Consistency", "detail": "Mine-face variation, lot control, moisture and contamination managed across sustained supply."},
            {"name": "Process yield", "detail": "Quality improvement balanced against recovery, water, drying load and operating cost."},
        ],
        "equipment": [
            {"stage": "Feed preparation", "items": "Grizzly or scalping screen, controlled feed hopper, log washer where required"},
            {"stage": "Liberation", "items": "Attrition scrubber selected from clay load and surface-coating testwork"},
            {"stage": "Classification", "items": "Hydrocyclones, hydraulic classifier or sizing screens with defined cut points"},
            {"stage": "Impurity reduction", "items": "Magnetic separation or other separation stages only where mineralogy supports them"},
            {"stage": "Finishing", "items": "Dewatering screen, dryer, final screen, controlled silos and clean dispatch system"},
        ],
        "approach": [
            {"title": "Lock the customer specification", "detail": "Translate the glassmaker's chemistry, size, moisture and supply limits into measurable plant controls."},
            {"title": "Map deposit variability", "detail": "Sample across mining faces and horizons so the flowsheet is not designed around one favourable sample."},
            {"title": "Build and test the mass balance", "detail": "Compare process options using recovery, impurity deportment, circulating load and water demand."},
            {"title": "Commission the quality window", "detail": "Establish operating settings, sampling frequency, stockpile rules and release criteria."},
        ],
        "process_note": "The equipment sequence is indicative. Final selection must follow representative sampling, mineralogical work and beneficiation trials."
    },
    "solar-glass-silica": {
        "name": "Solar glass silica",
        "title": "Silica consulting for solar glass",
        "description": "Technical assessment and beneficiation strategy for low-iron silica resources intended for solar and high-clarity glass applications.",
        "intro": "Solar glass places unusually tight demands on iron, colour-forming impurities and batch consistency. The first question is whether the deposit and liberation behaviour can support the target before expensive processing decisions are made.",
        "priorities": ["Low-iron resource screening", "Mineralogy and impurity association", "Attrition, classification and separation strategy", "Sampling and lot-to-lot quality control"],
        "services": ["Resource potential and variability assessment", "Testwork programme definition and interpretation", "Beneficiation concept and capital-risk review", "Scale-up, quality protocol and customer-trial support"],
        "outcome": "A technically grounded go/no-go and development pathway for high-purity silica opportunities.",
        "theme": "solar",
        "image": "/static/consulting/open-source/app-solar.webp",
        "image_alt": "Solar module manufacturing line showing glass-fronted photovoltaic modules",
        "image_credit": "Dennis Schroeder / U.S. Department of Energy, public domain. Cropped and converted to WebP.",
        "image_source": "https://commons.wikimedia.org/wiki/File:Solar_panel_submodule_packout,_Perrysburg,_Ohio,_August_2017.jpg",
        "quality": [
            {"name": "Iron mineralogy", "detail": "Total iron matters, but liberation and whether iron is surface-bound, magnetic or lattice-hosted decides treatability."},
            {"name": "Optical impurities", "detail": "Ti, Cr and other colour-forming minerals are assessed with the intended high-transmission glass target."},
            {"name": "High-purity control", "detail": "Sampling, contact materials, process water and storage must avoid recontaminating an upgraded product."},
            {"name": "Commercial viability", "detail": "Incremental purity is weighed against recovery loss, reagent use, water treatment and capital intensity."},
        ],
        "equipment": [
            {"stage": "Characterisation", "items": "Mineralogy, size-by-size chemistry and liberation studies before equipment selection"},
            {"stage": "Surface cleaning", "items": "Controlled scrubbing, attrition and desliming to remove coatings and clay-bound impurities"},
            {"stage": "Physical separation", "items": "High-intensity magnetic separation and classification configured from test results"},
            {"stage": "Advanced upgrading", "items": "Flotation or chemical treatment considered only after laboratory proof and residue planning"},
            {"stage": "Clean finishing", "items": "Low-contamination dewatering, drying, storage, sampling and protected dispatch"},
        ],
        "approach": [
            {"title": "Set a staged purity target", "detail": "Separate the customer's required specification from an uneconomic pursuit of maximum purity."},
            {"title": "Identify where impurities reside", "detail": "Use mineralogy and size fractions to determine whether impurities can actually be liberated."},
            {"title": "Prove each separation step", "detail": "Test incremental quality gain and recovery before adding another unit operation."},
            {"title": "Design contamination control", "detail": "Carry purity through plant materials, water circuits, drying, storage and logistics."},
        ],
        "process_note": "Low total iron alone does not prove solar-glass suitability. Mineral association, optical requirements and customer trials remain decisive."
    },
    "foundry-silica-sand": {
        "name": "Foundry silica sand",
        "title": "Foundry silica sand process consulting",
        "description": "Silica sand processing and quality guidance for foundry moulding applications, including grading, AFS control, clay, moisture and consistency.",
        "intro": "Foundry performance depends on more than chemistry. Grain distribution, fines, clay, moisture and repeatability influence mould behaviour, finish and operating stability.",
        "priorities": ["AFS/GFN and sieve distribution", "Fines, clay and loss-on-ignition control", "Moisture and drying consistency", "Product segregation and dispatch quality"],
        "services": ["Raw-sand and finished-product evaluation", "Washing, classification and drying review", "Sieve-control and laboratory protocol development", "Troubleshooting quality variation and customer complaints"],
        "outcome": "A controlled foundry-sand product built around the customer's moulding system and operating window.",
        "theme": "foundry",
        "image": "/static/consulting/open-source/app-foundry.webp",
        "image_alt": "Workers pouring molten metal into sand moulds in an industrial foundry",
        "image_credit": "Joe Clark / U.S. National Archives, public domain. Cropped and converted to WebP.",
        "image_source": "https://commons.wikimedia.org/wiki/File:POURING_SAND_CASTINGS_AT_THE_FORD_FOUNDRY_IN_DEARBORN_-_NARA_-_549693.jpg",
        "quality": [
            {"name": "AFS/GFN", "detail": "Average fineness is controlled together with the full sieve distribution, not treated as a single isolated number."},
            {"name": "Grain character", "detail": "Shape, angularity and surface condition influence binder demand, permeability and mould strength."},
            {"name": "Deleterious fines", "detail": "Clay, silt, LOI and unwanted fines are managed to protect gas evolution and mould performance."},
            {"name": "Moisture & temperature", "detail": "Dryer discharge, cooling, storage and packing controls preserve consistency at the foundry."},
        ],
        "equipment": [
            {"stage": "Feed control", "items": "Scalping, washing and feed blending to stabilize incoming variability"},
            {"stage": "Scrubbing", "items": "Attrition or washing duty selected to remove adherent clay without unnecessary grain damage"},
            {"stage": "Grading", "items": "Hydraulic classification, cyclones and multi-deck screens for the required sieve envelope"},
            {"stage": "Thermal finishing", "items": "Dryer and cooler with moisture and temperature monitoring"},
            {"stage": "Final control", "items": "Screening, blending bins, dust collection, sampling and protected packing"},
        ],
        "approach": [
            {"title": "Start at the moulding line", "detail": "Understand casting size, process, binder system, defects and the foundry's accepted sand window."},
            {"title": "Build the sieve envelope", "detail": "Use retained percentages and grain shape alongside AFS/GFN to define the target product."},
            {"title": "Tune washing and classification", "detail": "Remove harmful fines while preserving useful fractions and commercial recovery."},
            {"title": "Close the feedback loop", "detail": "Link dispatch certificates and retained samples with foundry performance and complaint analysis."},
        ],
        "process_note": "The correct foundry grade is application-specific. AFS/GFN without sieve distribution, grain shape and clay data is not sufficient."
    },
    "ceramics-and-tiles": {
        "name": "Ceramics and tiles",
        "title": "Silica and industrial minerals consulting for ceramics",
        "description": "Technical guidance for silica, feldspar, ball clay and related mineral inputs used in ceramic and tile manufacturing.",
        "intro": "Ceramic bodies depend on the interaction of several minerals. Chemistry, whiteness, particle size, plasticity and firing behaviour must be considered together when qualifying a source or changing a blend.",
        "priorities": ["Mineral chemistry and firing behaviour", "Whiteness and contamination control", "Grinding and particle-size requirements", "Blend stability across supply lots"],
        "services": ["Mineral source and supplier assessment", "Beneficiation and product-development review", "Body-material troubleshooting support", "Quality protocol and commercial supply planning"],
        "outcome": "Mineral inputs selected and controlled for stable ceramic processing and finished-product quality.",
        "theme": "ceramics",
        "image": "/static/consulting/open-source/app-ceramics.webp",
        "image_alt": "Ceramic tile production facility with kilns and material preparation equipment",
        "image_credit": "Malibu Ceramic Works, public domain. Cropped and converted to WebP.",
        "image_source": "https://commons.wikimedia.org/wiki/File:Production_facility_for_making_ceramic_tile_in_Long_Beach,_CA.jpg",
        "quality": [
            {"name": "Body chemistry", "detail": "Silica, alumina, fluxes, iron and loss on ignition are interpreted as a body system rather than separate supplier values."},
            {"name": "Firing response", "detail": "Fired colour, shrinkage, absorption and defect behaviour determine practical suitability."},
            {"name": "Particle preparation", "detail": "Residue, grindability and distribution influence milling energy, slip behaviour and body packing."},
            {"name": "Blend stability", "detail": "Silica, feldspar and clay variability is managed through source control and blending rules."},
        ],
        "equipment": [
            {"stage": "Raw preparation", "items": "Crushing, screening, blunging or washing selected for the mineral and process route"},
            {"stage": "Impurity control", "items": "Magnetic separation and controlled handling for iron and foreign-material reduction"},
            {"stage": "Size reduction", "items": "Ball mill or dry grinding circuit with residue and energy targets"},
            {"stage": "Solid-liquid handling", "items": "Hydrocyclones, filter press or spray drying where the ceramic process requires them"},
            {"stage": "Blending & storage", "items": "Homogenizing bins, controlled dosing and lot-based quality release"},
        ],
        "approach": [
            {"title": "Review the complete body", "detail": "Assess how the proposed mineral changes interact with clay, feldspar, silica and additives."},
            {"title": "Compare unfired and fired behaviour", "detail": "Laboratory trials connect raw-material values to shrinkage, absorption, colour and defects."},
            {"title": "Adapt the preparation route", "detail": "Set crushing, grinding, separation and blending duties around plant constraints."},
            {"title": "Control supplier variation", "detail": "Create incoming checks, blend limits and escalation rules for stable production."},
        ],
        "process_note": "Mineral approval should follow body and firing trials. Chemistry alone cannot predict ceramic performance."
    },
    "tile-adhesive-and-dry-mix": {
        "name": "Tile adhesive and dry mix",
        "title": "Silica consulting for tile adhesive and dry-mix products",
        "description": "Mineral selection, grading and quality guidance for silica fillers and aggregates used in tile adhesive, ready-mix plaster and dry-mix formulations.",
        "intro": "In dry-mix products, grading, moisture and mineral cleanliness affect water demand, workability, packing and consistency. A reliable raw-material specification helps formulation and plant teams avoid preventable variation.",
        "priorities": ["Controlled grading and packing behaviour", "Moisture and storage stability", "Mineral cleanliness and colour", "Repeatable supply for formulation control"],
        "services": ["Silica source and grade selection", "Product sizing and specification development", "Processing and drying route review", "Supplier qualification and incoming quality plans"],
        "outcome": "A fit-for-purpose silica specification that supports stable dry-mix production.",
        "theme": "dry-mix",
        "image": "/static/consulting/open-source/app-dry-mix.webp",
        "image_alt": "Industrial dry mortar production plant with silos, dosing and mixing equipment",
        "image_credit": "Checkteam, Wikimedia Commons, CC BY-SA 3.0. Cropped and converted to WebP.",
        "image_source": "https://commons.wikimedia.org/wiki/File:Dry_mortar_production_line.jpg",
        "quality": [
            {"name": "Grading & packing", "detail": "Coarse and fine fractions are selected to support packing, workability and controlled water demand."},
            {"name": "Moisture", "detail": "Dry aggregate and filler moisture must remain compatible with cement, polymers and storage life."},
            {"name": "Cleanliness", "detail": "Clay, salts, organics and oversize contamination are screened against formulation sensitivity."},
            {"name": "Bulk handling", "detail": "Bulk density, flow and segregation behaviour influence dosing accuracy and batch repeatability."},
        ],
        "equipment": [
            {"stage": "Mineral preparation", "items": "Dryer, crusher or mill as required by feed size and incoming moisture"},
            {"stage": "Precision grading", "items": "Multi-deck screening or air classification for controlled aggregate and filler fractions"},
            {"stage": "Storage", "items": "Dedicated silos or bins designed to limit moisture pickup and cross-contamination"},
            {"stage": "Dosing & mixing", "items": "Weigh feeders, micro-dosing for additives and a suitable batch mixer"},
            {"stage": "Finishing", "items": "Dust extraction, packing, batch identification and retained-sample system"},
        ],
        "approach": [
            {"title": "Define formulation duty", "detail": "Tile adhesive, plaster and other dry mixes need different aggregate-to-filler behaviour."},
            {"title": "Build candidate gradings", "detail": "Compare source fractions and blends for packing, water demand, flow and segregation."},
            {"title": "Validate plant handling", "detail": "Confirm drying, screening, silo discharge, dosing and mixing repeatability."},
            {"title": "Verify product performance", "detail": "Connect mineral controls with workability, open time, slip, strength and field consistency."},
        ],
        "process_note": "Silica grading supports the formulation but does not replace full product testing against the applicable adhesive or dry-mix standard."
    },
}

CONTACT_EVENTS = {"phone", "whatsapp", "email"}
analytics_security = HTTPBasic(auto_error=False)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Silica Lab Reporting System")
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

app.include_router(reports.router)


# ---------------- Lab Form ----------------
@app.get("/form")
def lab_form(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="form.html",
        context={"request": request},
    )


# ---------------- Consulting Website ----------------
@app.get("/")
def consulting_home(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="consulting.html",
        context={"request": request},
    )


@app.get("/consulting")
def consulting_page():
    return RedirectResponse(url="/", status_code=301)


@app.get("/silica-applications/{slug}")
def application_page(slug: str, request: Request):
    application = APPLICATIONS.get(slug)
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return templates.TemplateResponse(
        request=request,
        name="application.html",
        context={"request": request, "application": application, "slug": slug},
    )


@app.get("/lab-report")
def lab_report():
    try:
        file_path = os.path.join(os.path.dirname(__file__), "Dashmesh/lab-report.html")
        with open(file_path, "r") as f:
            content = f.read()
        # Replace local logo path with static URL
        content = content.replace('src="logo.png"', 'src="/static/dashmesh_logo.png"')
        return HTMLResponse(content=content)
    except Exception as e:
        return HTMLResponse(content=f"<h1>Error: {str(e)}</h1>", status_code=500)


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
        request=request,
        name="reports_list.html",
        context={"request": request, "reports": reports_list},
    )


# ---------------- Portfolio ----------------
@app.get("/portfolio")
def portfolio(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="portfolio.html",
        context={"request": request},
    )


@app.post("/api/contact-events", status_code=204)
async def record_contact_event(request: Request, db: Session = Depends(get_db)):
    payload = await request.json()
    event_type = str(payload.get("event", ""))[:24]
    page = str(payload.get("page", "/"))[:160]
    session_id = str(payload.get("session_id", ""))[:64]
    if event_type not in CONTACT_EVENTS or not session_id:
        raise HTTPException(status_code=400, detail="Invalid contact event")
    db.add(models.ContactEvent(event_type=event_type, page=page, session_id=session_id))
    db.commit()
    return Response(status_code=204)


@app.get("/contact-insights")
def contact_insights(
    request: Request,
    credentials: HTTPBasicCredentials = Depends(analytics_security),
    db: Session = Depends(get_db),
):
    username = os.getenv("ANALYTICS_USERNAME", "admin")
    password = os.getenv("ANALYTICS_PASSWORD")
    if not password:
        raise HTTPException(status_code=404, detail="Analytics dashboard is not configured")
    valid = credentials and secrets.compare_digest(credentials.username, username) and secrets.compare_digest(credentials.password, password)
    if not valid:
        raise HTTPException(status_code=401, detail="Authentication required", headers={"WWW-Authenticate": "Basic"})

    since = datetime.utcnow() - timedelta(days=30)
    summary = []
    for event_type in sorted(CONTACT_EVENTS):
        total, visitors = db.query(
            func.count(models.ContactEvent.id),
            func.count(distinct(models.ContactEvent.session_id)),
        ).filter(
            models.ContactEvent.event_type == event_type,
            models.ContactEvent.created_at >= since,
        ).one()
        summary.append({"event": event_type, "total": total, "visitors": visitors})

    daily = db.query(
        func.date(models.ContactEvent.created_at).label("day"),
        models.ContactEvent.event_type,
        func.count(models.ContactEvent.id).label("total"),
        func.count(distinct(models.ContactEvent.session_id)).label("visitors"),
    ).filter(models.ContactEvent.created_at >= since).group_by(
        func.date(models.ContactEvent.created_at), models.ContactEvent.event_type
    ).order_by(func.date(models.ContactEvent.created_at).desc()).all()

    return templates.TemplateResponse(
        request=request,
        name="contact_insights.html",
        context={"request": request, "summary": summary, "daily": daily},
    )


@app.get("/robots.txt")
def robots_txt():
    return Response(
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /api/\n"
        "Disallow: /contact-insights\n"
        "Disallow: /dashmesh-report\n"
        "Disallow: /form\n"
        "Disallow: /lab-report\n"
        "Disallow: /office\n"
        "Disallow: /portfolio-v2\n"
        "Disallow: /portfolio-v3\n"
        "Disallow: /portfolio.pdf\n"
        "Disallow: /reports/\n"
        "Disallow: /submit-report\n"
        "Disallow: /test\n"
        "Sitemap: https://www.silicasand.in/sitemap.xml\n",
        media_type="text/plain",
    )


@app.get("/sitemap.xml")
def sitemap_xml():
    paths = ["", "portfolio"] + [f"silica-applications/{slug}" for slug in APPLICATIONS]
    urls = "".join(f"<url><loc>https://www.silicasand.in/{path}</loc></url>" for path in paths)
    return Response(
        f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>',
        media_type="application/xml",
    )


@app.get("/portfolio-v2")
def portfolio_v2():
    try:
        file_path = os.path.join(os.path.dirname(__file__), "../portfolio/Dharmendra_Yadav_Portfolio_v2.html")
        with open(file_path, "r") as f:
            content = f.read()
        return HTMLResponse(content=content)
    except Exception as e:
        return HTMLResponse(content=f"<h1>Error: {str(e)}</h1>", status_code=500)


@app.get("/portfolio-v3")
def portfolio_v3():
    try:
        file_path = os.path.join(os.path.dirname(__file__), "../portfolio/Dharmendra_Yadav_Portfolio_v3.html")
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
        content.append(Paragraph("Entrepreneur | Technical Adviser | Mining & Minerals Specialist", styles['Heading1']))
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
