from pydantic import BaseModel, EmailStr
from typing import Optional

class GuardianLinkRequest(BaseModel):
    guardian_email: Optional[EmailStr] = None
    guardian_code: Optional[str] = None
    guardian_user_id: Optional[str] = None

class GuardianLinkResponse(BaseModel):
    id: str
    user_id: str
    guardian_user_id: Optional[str] = None
    guardian_id: Optional[str] = None
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