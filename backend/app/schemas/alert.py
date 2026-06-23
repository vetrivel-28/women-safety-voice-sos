from pydantic import BaseModel, Field
from enum import Enum
from typing import Optional

class TriggerType(str, Enum):
    MANUAL_SOS = "MANUAL_SOS"
    SILENT_SOS = "SILENT_SOS"
    MISSED_CHECK_IN = "MISSED_CHECK_IN"
    SAFE_WINDOW_MISSED = "SAFE_WINDOW_MISSED"
    ROUTE_DEVIATION = "ROUTE_DEVIATION"
    RISK_SCORE_HIGH = "RISK_SCORE_HIGH"
    JOURNEY_MISSED_CHECKIN = "JOURNEY_MISSED_CHECKIN"
    DEAD_MAN_MISSED = "DEAD_MAN_MISSED"
    GUARDIAN_NOTIFICATION_FAILED = "GUARDIAN_NOTIFICATION_FAILED"
    GUARDIAN_NOTIFICATION_SENT = "GUARDIAN_NOTIFICATION_SENT"

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
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    guardian_email: Optional[str] = None

class AlertResponse(AlertCreate):
    id: str
    user_id: str
    created_at: str
    cancelled_at: Optional[str] = None
