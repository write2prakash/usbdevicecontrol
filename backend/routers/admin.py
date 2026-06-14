import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.core.db import get_db
from backend.core.security import get_current_user, require_roles
from backend.schemas import endpoint as endpoint_schemas
from backend.schemas import usb_event as usb_event_schemas
from backend.models.user import User
from backend.models.endpoint import Endpoint
from backend.models.usb_event import USBEvent, USBEventStatus
from backend.models.agent_install import AgentInstall, InstallStatus
from backend.models.notification import Notification
from backend.websocket.manager import manager

router = APIRouter()

@router.post("/scan")
def scan_network(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, ["admin"])
    return {"detail": "Scan initiated"}

@router.get("/endpoints", response_model=list[endpoint_schemas.EndpointResponse])
def list_endpoints(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, ["admin"])
    endpoints = db.query(Endpoint).filter(Endpoint.company_id == current_user.company_id).all()
    return [
        endpoint_schemas.EndpointResponse(
            id=endpoint.id,
            hostname=endpoint.hostname,
            os_version=endpoint.os_version,
            cpu=endpoint.cpu,
            ram=endpoint.ram,
            mac_address=endpoint.mac_address,
            ip_address=endpoint.ip_address,
            agent_installed=endpoint.agent_installed,
            last_seen=endpoint.last_seen.isoformat() if endpoint.last_seen else None,
        )
        for endpoint in endpoints
    ]

@router.post("/install-token", response_model=endpoint_schemas.InstallTokenResponse)
def create_install_token(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, ["admin"])

    token = secrets.token_urlsafe(32)
    install_record = AgentInstall(
        company_id=current_user.company_id,
        install_token=token,
        status=InstallStatus.pending,
    )
    db.add(install_record)
    db.commit()
    return endpoint_schemas.InstallTokenResponse(install_token=token)

@router.get("/usb-events", response_model=list[usb_event_schemas.USBEventResponse])
def list_usb_events(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, ["admin"])
    events = (
        db.query(USBEvent)
        .filter(USBEvent.company_id == current_user.company_id)
        .order_by(USBEvent.plugged_at.desc())
        .all()
    )
    return events

@router.post("/endpoints/{endpoint_id}/install-token", response_model=endpoint_schemas.InstallTokenResponse)
def create_install_token_for_endpoint(
    endpoint_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, ["admin"])
    endpoint = db.query(Endpoint).filter(Endpoint.id == endpoint_id, Endpoint.company_id == current_user.company_id).first()
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found")

    token = secrets.token_urlsafe(32)
    install_record = AgentInstall(
        endpoint_id=endpoint.id,
        company_id=current_user.company_id,
        install_token=token,
        status=InstallStatus.pending,
    )
    db.add(install_record)
    db.commit()
    return endpoint_schemas.InstallTokenResponse(install_token=token)

@router.post("/usb-events/{event_id}/approve")
async def approve_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, ["admin"])
    event = db.query(USBEvent).filter(USBEvent.id == event_id, USBEvent.company_id == current_user.company_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="USB event not found")
    event.status = USBEventStatus.approved
    db.commit()
    # create a notification for the company/admins
    notif = Notification(
        company_id=current_user.company_id,
        user_id=current_user.id,
        type="usb_event_approved",
        message=f"USB event {event.id} approved",
    )
    db.add(notif)
    db.commit()
    # notify agent
    await manager.send_json(event.endpoint_id, {"event_id": event.id, "status": event.status.value})
    # notify company admins
    await manager.send_company_json(current_user.company_id, {"type": "notification", "notification_id": notif.id, "message": notif.message})
    return {"detail": "Approved"}

@router.post("/usb-events/{event_id}/reject")
async def reject_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, ["admin"])
    event = db.query(USBEvent).filter(USBEvent.id == event_id, USBEvent.company_id == current_user.company_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="USB event not found")
    event.status = USBEventStatus.rejected
    db.commit()
    notif = Notification(
        company_id=current_user.company_id,
        user_id=current_user.id,
        type="usb_event_rejected",
        message=f"USB event {event.id} rejected",
    )
    db.add(notif)
    db.commit()
    # notify agent
    await manager.send_json(event.endpoint_id, {"event_id": event.id, "status": event.status.value})
    # notify company admins
    await manager.send_company_json(current_user.company_id, {"type": "notification", "notification_id": notif.id, "message": notif.message})
    return {"detail": "Rejected"}
