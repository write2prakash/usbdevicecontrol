from pydantic import BaseModel
from typing import Optional

class USBEventCreate(BaseModel):
    endpoint_id: int
    device_name: str
    device_serial: Optional[str]
    vendor_id: Optional[str]
    product_id: Optional[str]

class USBEventResponse(BaseModel):
    id: int
    endpoint_id: int
    device_name: str
    device_serial: Optional[str]
    vendor_id: Optional[str]
    product_id: Optional[str]
    status: str
    plugged_at: str

    class Config:
        orm_mode = True
