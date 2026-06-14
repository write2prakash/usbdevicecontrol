from sqlalchemy import Column, Integer, String, ForeignKey, Enum, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.core.db import Base
import enum

class USBEventStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"

class USBEvent(Base):
    __tablename__ = "usb_events"

    id = Column(Integer, primary_key=True, index=True)
    endpoint_id = Column(Integer, ForeignKey("endpoints.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    device_name = Column(String(255), nullable=False)
    device_serial = Column(String(255), nullable=True)
    vendor_id = Column(String(50), nullable=True)
    product_id = Column(String(50), nullable=True)
    plugged_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(Enum(USBEventStatus), default=USBEventStatus.pending)

    endpoint = relationship("Endpoint")
    company = relationship("Company")
    user = relationship("User")
