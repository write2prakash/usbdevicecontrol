import os
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, WebSocket, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from backend.core.db import get_db
from backend.core.config import settings
from backend.schemas import agent as agent_schemas
from backend.models.agent_install import AgentInstall, InstallStatus
from backend.models.endpoint import Endpoint
from backend.models.company import Company
from backend.models.usb_event import USBEvent, USBEventStatus
from backend.models.notification import Notification
from backend.websocket.manager import manager

router = APIRouter()

AGENT_EXE_PATH = os.environ.get("AGENT_EXE_PATH", "/app/agent-binary/UsbControlAgent.exe")

@router.get("/download")
def download_agent():
    if not os.path.exists(AGENT_EXE_PATH):
        raise HTTPException(status_code=404, detail="Agent binary not yet available on this server")
    return FileResponse(
        AGENT_EXE_PATH,
        media_type="application/octet-stream",
        filename="UsbControlAgent.exe",
    )

@router.post("/register", response_model=agent_schemas.AgentRegisterResponse)
def register_agent(payload: agent_schemas.AgentRegisterRequest, db: Session = Depends(get_db)):
    install_token = db.query(AgentInstall).filter(AgentInstall.install_token == payload.install_token).first()
    if not install_token or install_token.status != InstallStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired install token")

    expiry = install_token.created_at + timedelta(hours=settings.install_token_expire_hours)
    if datetime.utcnow() > expiry:
        install_token.status = InstallStatus.blocked
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Install token expired")

    company = db.query(Company).filter(Company.id == install_token.company_id).first()
    if not company:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Associated company not found")

    active_install_count = db.query(Endpoint).filter(Endpoint.company_id == company.id, Endpoint.agent_installed == True).count()
    if active_install_count >= company.max_seats:
        install_token.status = InstallStatus.blocked
        notification = Notification(
            company_id=company.id,
            user_id=None,
            type="quota_breach",
            message=f"Company {company.name} exceeded quota ({active_install_count}/{company.max_seats})",
        )
        db.add(notification)
        db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company quota exceeded")

    endpoint = Endpoint(
        company_id=company.id,
        hostname=payload.hostname,
        os_version=payload.os_version,
        cpu=payload.cpu,
        ram=payload.ram,
        mac_address=payload.mac_address,
        ip_address=payload.ip_address,
        machine_id=payload.machine_id,
        agent_installed=True,
        last_seen=datetime.utcnow(),
    )
    db.add(endpoint)
    db.flush()

    install_token.endpoint_id = endpoint.id
    install_token.installed_at = datetime.utcnow()
    install_token.version = payload.version
    install_token.status = InstallStatus.installed
    db.commit()
    db.refresh(endpoint)

    return agent_schemas.AgentRegisterResponse(
        endpoint_id=endpoint.id,
        installed_at=install_token.installed_at.isoformat(),
        status=install_token.status.value,
    )

@router.post("/heartbeat")
def heartbeat(payload: agent_schemas.AgentHeartbeatRequest, db: Session = Depends(get_db)):
    endpoint = db.query(Endpoint).filter(Endpoint.id == payload.endpoint_id).first()
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found")
    endpoint.last_seen = datetime.utcnow()
    db.commit()
    return {"detail": "Heartbeat received"}

@router.post("/usb-event")
async def usb_event(payload: agent_schemas.AgentUsbEventRequest, db: Session = Depends(get_db)):
    endpoint = db.query(Endpoint).filter(Endpoint.id == payload.endpoint_id).first()
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found")

    event = USBEvent(
        endpoint_id=endpoint.id,
        company_id=endpoint.company_id,
        user_id=None,
        device_name=payload.device_name,
        device_serial=payload.device_serial,
        vendor_id=payload.vendor_id,
        product_id=payload.product_id,
        status=USBEventStatus.pending,
    )
    db.add(event)
    db.flush()

    notif = Notification(
        company_id=endpoint.company_id,
        user_id=None,
        type="usb_event_detected",
        message=f"USB device '{payload.device_name}' connected to {endpoint.hostname} — awaiting approval",
    )
    db.add(notif)
    db.commit()
    db.refresh(event)

    await manager.send_company_json(endpoint.company_id, {
        "type": "notification",
        "notification_id": notif.id,
        "message": notif.message,
    })
    return {"id": event.id, "status": event.status.value}

@router.get("/usb-event/{event_id}/status", response_model=agent_schemas.AgentUsbEventStatusResponse)
def usb_event_status(event_id: int, db: Session = Depends(get_db)):
    event = db.query(USBEvent).filter(USBEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="USB event not found")
    return agent_schemas.AgentUsbEventStatusResponse(id=event.id, status=event.status.value)

@router.websocket("/ws/{endpoint_id}")
async def websocket_endpoint(websocket: WebSocket, endpoint_id: int):
    await manager.connect(endpoint_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except Exception:
        await manager.disconnect(endpoint_id)
