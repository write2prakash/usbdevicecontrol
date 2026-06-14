from sqlalchemy import Column, Integer, ForeignKey, String, DateTime, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.core.db import Base
import enum

class InstallStatus(str, enum.Enum):
    pending = "pending"
    installed = "installed"
    blocked = "blocked"

class AgentInstall(Base):
    __tablename__ = "agent_installs"

    id = Column(Integer, primary_key=True, index=True)
    endpoint_id = Column(Integer, ForeignKey("endpoints.id"), nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    install_token = Column(String(255), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    installed_at = Column(DateTime(timezone=True), nullable=True)
    version = Column(String(50), nullable=True)
    status = Column(Enum(InstallStatus), default=InstallStatus.pending)

    endpoint = relationship("Endpoint")
    company = relationship("Company")
