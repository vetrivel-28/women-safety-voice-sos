import json
from enum import Enum

class TriggerType(str, Enum):
    MANUAL_SOS = "MANUAL_SOS"

try:
    print(json.dumps({"type": TriggerType.MANUAL_SOS}))
except Exception as e:
    print("FAILED:", type(e), e)
