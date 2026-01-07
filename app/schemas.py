from typing import List
from datetime import date
from pydantic import BaseModel


class SieveInput(BaseModel):
    mesh_size: str
    aperture: float
    weight: float
    multiplying_factor: float


class ReportCreate(BaseModel):
    company_name: str
    report_date: date
    truck_no: str
    dry_bed_no: str
    material_type: str
    sieve_reference: str
    sieves: List[SieveInput]


class SieveResponse(SieveInput):
    product: float


class ReportResponse(BaseModel):
    id: int
    company_name: str
    report_date: date
    truck_no: str
    dry_bed_no: str
    material_type: str
    sieve_reference: str
    total_quantity: float
    total_afs: float
    sieves: List[SieveResponse]