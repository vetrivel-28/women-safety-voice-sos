from pydantic import BaseModel, Field
from enum import Enum
from typing import Optional

class TriggerType(str, Enum):
    MANUAL_SOS = "MANUAL_SOS"
    SILENT_SOS = "SILENT_SOS"

class AlertStatus(str, Enum):
    ACTIVE = "ACTIVE"
    CANCELLED = "CANCELLED"

class CancelMethod(str, Enum):
    REAL_PIN = "REAL_PIN"
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

data = {
    'id': '58909c7c-4458-4d72-821f-a51cdf0d60e0', 
    'user_id': 'b2f80fdf-6faa-46f0-9f26-47c0f83d5185', 
    'trigger_type': 'MANUAL_SOS', 
    'status': 'ACTIVE', 
    'visible_message': 'SOS Test', 
    'cancel_method': 'NONE', 
    'cancelled_at': None, 
    'location_lat': 12.3, 
    'location_long': 45.6, 
    'location_accuracy': None, 
    'location_map_link': 'http://map', 
    'location_captured_at': None, 
    'location_permission_denied': False, 
    'created_at': '2026-06-23T10:11:15'
}

try:
    resp = AlertResponse(**data)
    print("SUCCESS", resp.model_dump())
except Exception as e:
    print("FAILED", str(e))
