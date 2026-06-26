from pydantic import BaseModel
from typing import Optional

class ProfileBase(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    blood_group: Optional[str] = None
    medical_notes: Optional[str] = None

class ProfileCreate(ProfileBase):
    pass

class ProfileUpdate(ProfileBase):
    pass

class ProfileResponse(ProfileBase):
    user_id: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    guardian_code: Optional[str] = None

    class Config:
        from_attributes = True
