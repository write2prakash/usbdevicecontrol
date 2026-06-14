from fastapi import APIRouter, Depends, HTTPException, status
from fastapi import WebSocket
from sqlalchemy.orm import Session
from backend.core.db import get_db
from backend.core.security import get_current_user, require_roles
from backend.models.user import User
from backend.models.notification import Notification
from backend.schemas import notification as notification_schemas
from backend.core.security import decode_token
from backend.core.db import SessionLocal
from backend.websocket.manager import manager

router = APIRouter()

@router.get("/", response_model=list[notification_schemas.NotificationResponse])
def get_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role.value not in ["super_admin", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient privileges")

    query = db.query(Notification)
    if current_user.role.value == "admin":
        query = query.filter(Notification.company_id == current_user.company_id)

    return query.order_by(Notification.created_at.desc()).all()

@router.post("/{notification_id}/read")
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = db.query(Notification).filter(Notification.id == notification_id, Notification.company_id == current_user.company_id).first()
    if not notification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notification.is_read = True
    db.commit()
    return {"detail": "Notification marked as read"}


@router.websocket("/ws/admin")
async def admin_notifications_ws(websocket: WebSocket, token: str):
    # token should be an access token passed as query param `?token=...`
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            await websocket.close(code=1008)
            return
        user_id = int(payload.get("sub"))
    except Exception:
        await websocket.close(code=1008)
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.is_active or user.role.value not in ["admin", "super_admin"]:
            await websocket.close(code=1008)
            return
        company_id = user.company_id
        await manager.connect_admin(company_id, websocket)
        try:
            while True:
                await websocket.receive_text()
        except Exception:
            await manager.disconnect_admin(company_id, websocket)
    finally:
        db.close()
