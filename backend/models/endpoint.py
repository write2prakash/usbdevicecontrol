from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.core.db import Base

class Endpoint(Base):
    __tablename__ = "endpoints"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    hostname = Column(String(255), nullable=False)
    os_version = Column(String(255), nullable=True)
    cpu = Column(String(255), nullable=True)
    ram = Column(String(255), nullable=True)
    mac_address = Column(String(255), nullable=True)
    ip_address = Column(String(255), nullable=True)
    machine_id = Column(String(255), nullable=True)
    agent_installed = Column(Boolean, default=False)
    last_seen = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company")
