from pydantic import BaseModel, EmailStr

class GuardianLinkRequest(BaseModel):
    guardian_email: EmailStr


class GuardianLinkResponse(BaseModel):
    id: str
    user_id: str
    guardian_id: str
    status: str
    created_at: str