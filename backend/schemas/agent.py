from pydantic import BaseModel
from typing import Optional, List

class AgentRegisterRequest(BaseModel):
    install_token: str
    hostname: str
    os_version: Optional[str]
    cpu: Optional[str]
    ram: Optional[str]
    mac_address: Optional[str]
    ip_address: Optional[str]
    machine_id: Optional[str]
    version: Optional[str]

class AgentRegisterResponse(BaseModel):
    endpoint_id: int
    installed_at: str
    status: str

class AgentHeartbeatRequest(BaseModel):
    endpoint_id: int

class AgentUsbEventRequest(BaseModel):
    endpoint_id: int
    device_name: str
    device_serial: Optional[str] = None
    vendor_id: Optional[str] = None
    product_id: Optional[str] = None

class AgentUsbEventStatusResponse(BaseModel):
    id: int
    status: str

class AuditFileEntry(BaseModel):
    name: str
    size: int

class AuditSubmitRequest(BaseModel):
    files: List[AuditFileEntry]
