from pydantic import BaseModel, EmailStr

class CompanyCreate(BaseModel):
    name: str
    domain: str
    max_seats: int
    admin_name: str
    admin_email: EmailStr

class CompanyResponse(BaseModel):
    id: int
    name: str
    domain: str
    max_seats: int
    is_active: bool

    class Config:
        orm_mode = True

class CompanyCreateResponse(BaseModel):
    id: int
    name: str
    domain: str
    max_seats: int
    is_active: bool
    admin_name: str
    admin_email: EmailStr
    admin_temp_password: str

    class Config:
        orm_mode = True

class CompanyQuotaUpdate(BaseModel):
    max_seats: int
