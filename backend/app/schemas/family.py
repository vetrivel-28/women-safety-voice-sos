from pydantic import BaseModel, constr
from typing import Optional, List
from datetime import datetime
from uuid import UUID

class FamilyCreate(BaseModel):
    family_name: constr(min_length=1, max_length=60) # type: ignore

class FamilyResponse(BaseModel):
    id: UUID
    family_name: str
    family_pin: str
    host_user_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class FamilyMemberResponse(BaseModel):
    id: UUID
    family_id: UUID
    user_id: UUID
    role: str
    status: str
    joined_at: datetime

    class Config:
        from_attributes = True

class JoinRequestCreate(BaseModel):
    family_pin: constr(min_length=6, max_length=6) # type: ignore

class JoinRequestResponse(BaseModel):
    id: UUID
    family_id: UUID
    requester_user_id: UUID
    status: str
    created_at: datetime
    responded_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class FamilyRename(BaseModel):
    family_name: constr(min_length=1, max_length=60) # type: ignore
