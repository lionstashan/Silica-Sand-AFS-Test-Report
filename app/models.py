from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)

    company_name = Column(String, nullable=False)
    report_date = Column(Date, nullable=False)
    truck_no = Column(String, nullable=False)
    dry_bed_no = Column(String, nullable=False)
    material_type = Column(String, nullable=False)
    sieve_reference = Column(String, nullable=False)

    total_quantity = Column(Float, default=0)
    total_afs = Column(Float, default=0)

    sieves = relationship(
        "SieveResult",
        back_populates="report",
        cascade="all, delete-orphan"
    )


class SieveResult(Base):
    __tablename__ = "sieve_results"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)

    mesh_size = Column(String, nullable=False)
    aperture = Column(Float, nullable=False)              # ✅ FIXED
    weight = Column(Float, nullable=False)
    multiplying_factor = Column(Float, nullable=False)
    product = Column(Float, nullable=False)

    report = relationship("Report", back_populates="sieves")


class ContactEvent(Base):
    __tablename__ = "contact_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(24), nullable=False, index=True)
    page = Column(String(160), nullable=False)
    session_id = Column(String(64), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
