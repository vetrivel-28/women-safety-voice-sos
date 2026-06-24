from pydantic import BaseModel, EmailStr
from typing import Optional

class GuardianLinkRequest(BaseModel):
    guardian_email: EmailStr

class GuardianLinkResponse(BaseModel):
    id: str
    user_id: str
    guardian_id: str
    status: str
    created_at: str

class GuardianBase(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    relationship: Optional[str] = 'Emergency Contact'
    priority: Optional[int] = 1

class GuardianCreate(GuardianBase):
    pass

class GuardianUpdate(GuardianBase):
    name: Optional[str] = None
    phone: Optional[str] = None

class GuardianResponse(GuardianBase):
    id: str
    user_id: str
    created_at: str
    updated_at: str