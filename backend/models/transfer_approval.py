from sqlalchemy import Column, Integer, ForeignKey, String, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.core.db import Base

class TransferApproval(Base):
    __tablename__ = "transfer_approvals"

    id = Column(Integer, primary_key=True, index=True)
    usb_event_id = Column(Integer, ForeignKey("usb_events.id"), nullable=False)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String(50), nullable=False)
    actioned_at = Column(DateTime(timezone=True), server_default=func.now())
    note = Column(String(1024), nullable=True)

    usb_event = relationship("USBEvent")
    approver = relationship("User")
