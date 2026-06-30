import os
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class NotificationService:
    def __init__(self):
        self.provider = os.getenv("NOTIFICATION_PROVIDER", "none").lower()
        self.sms_provider = os.getenv("SMS_PROVIDER", "mock")
        
    def _log_event(self, event_type: str, status: str, user_id: str, alert_id: str = None, journey_id: str = None, message: str = None, metadata: dict = None, channel: str = None, recipient_type: str = None, recipient_id: str = None, recipient_phone: str = None, guardian_user_id: str = None, destination: str = None, provider: str = None, provider_message_id: str = None, error_message: str = None):
        try:
            from app.db.client import get_service_role_client
            service_client = get_service_role_client()
            
            meta = metadata or {}
            if recipient_type:
                meta["recipient_type"] = recipient_type
            if recipient_id:
                meta["recipient_id"] = recipient_id
            if recipient_phone:
                meta["recipient_phone"] = recipient_phone
            if journey_id:
                meta["journey_id"] = journey_id
                
            event_data = {
                "event_type": event_type,
                "status": status,
                "user_id": user_id,
                "alert_id": alert_id,
                "message": message,
                "metadata": meta,
                "channel": channel,
                "guardian_user_id": guardian_user_id,
                "destination": destination,
                "provider": provider,
                "provider_message_id": provider_message_id,
                "error_message": error_message
            }
            # Remove None values so default DB logic applies
            event_data = {k: v for k, v in event_data.items() if v is not None}
            service_client.table("notification_events").insert(event_data).execute()
        except Exception as e:
            logger.error(f"Failed to log notification event: {e}")

    def notify_guardian(self, contact: Dict[str, Any], alert_type: str, user: Any, location: Dict[str, Any] = None, alert_id: str = None) -> Any:
        """
        Attempts to notify a guardian contact via the configured provider.
        Returns the notification status: "SENT", "FAILED", "PROVIDER_NOT_CONFIGURED"
        """
        user_id_val = getattr(user, 'id', None)
        if self.provider == "none" or not contact.get("phone"):
            logger.info("Notification provider not configured or no phone provided.")
            self._log_event(event_type="SMS_SENT", status="SKIPPED", user_id=user_id_val, alert_id=alert_id, message="SMS provider not configured", channel="sms", recipient_id=contact.get("id"), recipient_phone=contact.get("phone"))
            return {"sms_sent": False, "reason": "SMS_PROVIDER_NOT_CONFIGURED"}
            
        logger.info(f"Attempting to notify {contact.get('name')} via {self.provider} ({self.sms_provider})...")
        
        # Build message
        user_ident = user.email if hasattr(user, "email") else getattr(user, 'id', 'Unknown User')
        msg = f"SafeHer Alert:\n{user_ident} triggered {alert_type}."
        
        if location and location.get("lat") and location.get("long"):
            msg += f"\nLocation: https://maps.google.com/?q={location['lat']},{location['long']}"
            
        msg += "\nPlease check immediately."
        
        if self.provider == "sms":
            status = self._send_sms(contact.get("phone"), msg)
            self._log_event(event_type="SMS_SENT", status=status, user_id=user_id_val, alert_id=alert_id, message=msg, channel="sms", recipient_id=contact.get("id"), recipient_phone=contact.get("phone"))
            return status
        elif self.provider == "push":
            status = self._send_push(contact.get("push_token"), msg)
            self._log_event(event_type="PUSH_SENT", status=status, user_id=user_id_val, alert_id=alert_id, message=msg, channel="push", recipient_id=contact.get("id"))
            return status
        else:
            self._log_event(event_type="SMS_SENT", status="SKIPPED", user_id=user_id_val, alert_id=alert_id, message="SMS provider not configured", channel=self.provider, recipient_id=contact.get("id"), recipient_phone=contact.get("phone"))
            return {"sms_sent": False, "reason": "SMS_PROVIDER_NOT_CONFIGURED"}
            
    def _send_sms(self, phone: str, message: str) -> Any:
        try:
            if self.sms_provider == "mock" or self.sms_provider == "none" or not self.sms_provider:
                logger.info(f"[MOCK SMS] To: {phone} | Body: {message}")
                return {"sms_sent": False, "reason": "SMS_PROVIDER_NOT_CONFIGURED"}
            
            logger.warning(f"Unimplemented SMS provider: {self.sms_provider}")
            return {"sms_sent": False, "reason": "SMS_PROVIDER_NOT_CONFIGURED"}
        except Exception as e:
            logger.error(f"SMS Provider Crash Prevented: {e}")
            return {"sms_sent": False, "reason": "PROVIDER_CRASH_PREVENTED"}
        
    def _send_push(self, token: str, message: str) -> str:
        if not token:
            return "FAILED"
        logger.info(f"[MOCK PUSH] To: {token} | Body: {message}")
        return "SENT"

    def notify_all_guardians(self, user_id: str, alert_type: str, user: Any, location: Dict[str, Any] = None) -> list:
        try:
            from app.db.client import get_service_role_client
            service_client = get_service_role_client()
            res = service_client.table("emergency_contacts").select("*").eq("user_id", user_id).execute()
            contacts = res.data or []
        except Exception as e:
            logger.error(f"Failed to fetch contacts for notification: {e}")
            contacts = []
            
        results = []
        for contact in contacts:
            # Avoid duplicate primary notifications if we handled it in the route
            # But here we just notify everyone found in DB
            res = self.notify_guardian(contact, alert_type, user, location)
            results.append(res)
            
        return results

    def notify_family_members(self, user_id: str, alert_type: str, user: Any, location: Dict[str, Any] = None, alert_id: str = None) -> list:
        try:
            from app.db.client import get_service_role_client
            service_client = get_service_role_client()
            # Find the active family the user belongs to
            membership_res = service_client.table("family_members").select("family_id").eq("user_id", user_id).eq("status", "active").execute()
            if not membership_res.data:
                return []
                
            family_id = membership_res.data[0]["family_id"]
            
            # Find all other active members in the same family
            members_res = service_client.table("family_members").select("user_id").eq("family_id", family_id).eq("status", "active").neq("user_id", user_id).execute()
            other_member_ids = [m["user_id"] for m in (members_res.data or [])]
            
            if not other_member_ids:
                return []

            # Queue offline notifications in family_notification_events
            results = []
            for member_id in other_member_ids:
                event_data = {
                    "family_id": family_id,
                    "user_id": member_id,
                    "type": "FAMILY_SOS",
                    "payload": {
                        "trigger_type": alert_type,
                        "triggered_by_user_id": user_id,
                        "location": location,
                        "alert_id": alert_id
                    },
                    "status": "queued"
                }
                service_client.table("family_notification_events").insert(event_data).execute()
                results.append({"user_id": member_id, "status": "queued"})
                
            return results
        except Exception as e:
            logger.error(f"Failed to notify family members: {e}")
            return []


    def send_sos_sms_to_emergency_contacts(self, user_id: str, alert_id: str, alert_payload: Dict[str, Any] = None, user: Any = None) -> Dict[str, Any]:
        result = {"sent_count": 0, "failed_count": 0, "errors": [], "sms_status": "failed"}
        if alert_payload is None:
            alert_payload = {}
        try:
            from app.db.client import get_service_role_client
            service_client = get_service_role_client()
            res = service_client.table("emergency_contacts").select("*").eq("user_id", user_id).execute()
            contacts = res.data or []
            self._log_event(event_type="EMERGENCY_CONTACTS_FETCHED", status="SUCCESS", user_id=user_id, alert_id=alert_id, message="Fetched emergency contacts", metadata={"count": len(contacts)})
        except Exception as e:
            logger.error(f"Failed to fetch contacts: {e}")
            contacts = []
            
        alert_type = alert_payload.get("trigger_type", "SOS")
        location = alert_payload.get("location", None)
        
        for contact in contacts:
            try:
                res = self.notify_guardian(contact, alert_type, user, location, alert_id=alert_id)
                if isinstance(res, dict) and not res.get("sms_sent", True):
                    result["failed_count"] += 1
                elif res == "SENT":
                    result["sent_count"] += 1
                else:
                    result["failed_count"] += 1
            except Exception as e:
                result["failed_count"] += 1
                result["errors"].append(str(e))
                
        if result["sent_count"] > 0:
            result["sms_status"] = "sent" if result["failed_count"] == 0 else "partial"
            
        return result

notification_service = NotificationService()
