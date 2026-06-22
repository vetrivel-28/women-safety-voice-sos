from pydantic import BaseModel, EmailStr
from typing import Optional

class GuardianLinkRequest(BaseModel):
    guardian_email: EmailStr
    is_primary: Optional[bool] = False

class GuardianLinkResponse(BaseModel):
    id: str
    user_id: str
    guardian_id: str
    is_primary: bool
    created_at: str
