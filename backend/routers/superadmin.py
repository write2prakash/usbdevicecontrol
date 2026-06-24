from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import secrets
from backend.core.db import get_db
from backend.schemas import company as company_schemas
from backend.core.security import get_current_user, require_roles, get_password_hash
from backend.models.user import User, UserRole
from backend.models.company import Company
from backend.models.endpoint import Endpoint
from backend.models.usb_event import USBEvent
from backend.models.notification import Notification
from backend.models.agent_install import AgentInstall
from backend.models.audit_log import AuditLog
from backend.models.transfer_approval import TransferApproval

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

@router.put("/companies/{company_id}", response_model=company_schemas.CompanyResponse)
def update_company(
    company_id: int,
    payload: company_schemas.CompanyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, ["super_admin"])
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if payload.name is not None:
        company.name = payload.name
    if payload.domain is not None:
        conflict = db.query(Company).filter(Company.domain == payload.domain, Company.id != company_id).first()
        if conflict:
            raise HTTPException(status_code=400, detail="Domain already in use by another company")
        company.domain = payload.domain
    if payload.max_seats is not None:
        company.max_seats = payload.max_seats
    if payload.is_active is not None:
        company.is_active = payload.is_active
    db.commit()
    db.refresh(company)
    return company

@router.delete("/companies/{company_id}")
def delete_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, ["super_admin"])
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Delete in FK-safe order
    usb_event_ids = db.query(USBEvent.id).filter(USBEvent.company_id == company_id).subquery()
    db.query(TransferApproval).filter(TransferApproval.usb_event_id.in_(usb_event_ids)).delete(synchronize_session=False)
    db.query(AuditLog).filter(AuditLog.company_id == company_id).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.company_id == company_id).delete(synchronize_session=False)
    db.query(USBEvent).filter(USBEvent.company_id == company_id).delete(synchronize_session=False)
    db.query(AgentInstall).filter(AgentInstall.company_id == company_id).delete(synchronize_session=False)
    db.query(Endpoint).filter(Endpoint.company_id == company_id).delete(synchronize_session=False)
    db.query(User).filter(User.company_id == company_id).delete(synchronize_session=False)
    db.delete(company)
    db.commit()
    return {"detail": "Company deleted"}

@router.get("/companies/{company_id}/credentials", response_model=company_schemas.CompanyAdminCredentials)
def get_company_credentials(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, ["super_admin"])
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    admin = db.query(User).filter(User.company_id == company_id, User.role == UserRole.admin).first()
    if not admin:
        raise HTTPException(status_code=404, detail="No admin user found for this company")
    return {"admin_name": admin.name, "admin_email": admin.email}

@router.post("/companies/{company_id}/reset-password", response_model=company_schemas.CompanyAdminCredentials)
def reset_admin_password(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, ["super_admin"])
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    admin = db.query(User).filter(User.company_id == company_id, User.role == UserRole.admin).first()
    if not admin:
        raise HTTPException(status_code=404, detail="No admin user found for this company")
    temp_password = secrets.token_urlsafe(12)
    admin.password_hash = get_password_hash(temp_password)
    db.commit()
    return {"admin_name": admin.name, "admin_email": admin.email, "temp_password": temp_password}

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
