from pydantic import BaseModel, Field
from enum import Enum
from typing import Optional

class TriggerType(str, Enum):
    MANUAL_SOS = "MANUAL_SOS"
    SILENT_SOS = "SILENT_SOS"

class AlertStatus(str, Enum):
    ACTIVE = "ACTIVE"
    CANCELLED = "CANCELLED"
    SILENT_DURESS_ACTIVE = "SILENT_DURESS_ACTIVE"
    RESOLVED = "RESOLVED"

class CancelMethod(str, Enum):
    REAL_PIN = "REAL_PIN"
    DURESS_PIN = "DURESS_PIN"
    NONE = "NONE"

class AlertCreate(BaseModel):
    trigger_type: TriggerType
    status: AlertStatus
    cancel_method: Optional[CancelMethod] = CancelMethod.NONE
    visible_message: Optional[str] = None
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    map_link: Optional[str] = None

class AlertResponse(AlertCreate):
    id: str
    user_id: str
    created_at: str
    cancelled_at: Optional[str] = None
