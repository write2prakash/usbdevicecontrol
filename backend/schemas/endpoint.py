from pydantic import BaseModel
from typing import Optional

class EndpointResponse(BaseModel):
    id: int
    hostname: str
    os_version: Optional[str]
    cpu: Optional[str]
    ram: Optional[str]
    mac_address: Optional[str]
    ip_address: Optional[str]
    machine_id: Optional[str]
    agent_installed: bool
    last_seen: Optional[str]

    class Config:
        orm_mode = True

class InstallTokenResponse(BaseModel):
    install_token: str
