from datetime import datetime
from pydantic import BaseModel

class NotificationResponse(BaseModel):
    id: int
    company_id: int
    user_id: int | None
    type: str
    message: str
    is_read: bool
    created_at: datetime

    class Config:
        orm_mode = True
