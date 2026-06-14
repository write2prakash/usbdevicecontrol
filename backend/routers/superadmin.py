from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import secrets
from backend.core.db import get_db
from backend.schemas import company as company_schemas
from backend.core.security import get_current_user, require_roles, get_password_hash
from backend.models.user import User, UserRole
from backend.models.company import Company

router = APIRouter()

@router.post("/companies", response_model=company_schemas.CompanyCreateResponse)
def create_company(
    payload: company_schemas.CompanyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, ["super_admin"])

    if db.query(Company).filter(Company.domain == payload.domain).first():
        raise HTTPException(status_code=400, detail="Company domain already exists")
    if db.query(User).filter(User.email == payload.admin_email).first():
        raise HTTPException(status_code=400, detail="Admin email already exists")

    company = Company(
        name=payload.name,
        domain=payload.domain,
        max_seats=payload.max_seats,
    )
    db.add(company)
    db.flush()

    temp_password = secrets.token_urlsafe(12)
    admin_user = User(
        company_id=company.id,
        name=payload.admin_name,
        email=payload.admin_email,
        password_hash=get_password_hash(temp_password),
        role=UserRole.admin,
    )
    db.add(admin_user)
    db.commit()
    db.refresh(company)

    return {
        "id": company.id,
        "name": company.name,
        "domain": company.domain,
        "max_seats": company.max_seats,
        "is_active": company.is_active,
        "admin_name": admin_user.name,
        "admin_email": admin_user.email,
        "admin_temp_password": temp_password,
    }

@router.get("/companies", response_model=list[company_schemas.CompanyResponse])
def list_companies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, ["super_admin"])
    return db.query(Company).all()

@router.patch("/companies/{company_id}/quota")
def update_quota(
    company_id: int,
    payload: company_schemas.CompanyQuotaUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, ["super_admin"])
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    company.max_seats = payload.max_seats
    db.commit()
    return {"detail": "Quota updated", "max_seats": company.max_seats}
