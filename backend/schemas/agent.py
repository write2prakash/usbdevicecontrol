from pydantic import BaseModel
from typing import Optional

class AgentRegisterRequest(BaseModel):
    install_token: str
    hostname: str
    os_version: Optional[str]
    cpu: Optional[str]
    ram: Optional[str]
    mac_address: Optional[str]
    ip_address: Optional[str]
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
    device_serial: Optional[str]
    vendor_id: Optional[str]
    product_id: Optional[str]

class AgentUsbEventStatusResponse(BaseModel):
    id: int
    status: str
