import os
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class NotificationService:
    def __init__(self):
        self.provider = os.getenv("NOTIFICATION_PROVIDER", "none").lower()
        self.sms_provider = os.getenv("SMS_PROVIDER", "mock")
        
    def _log_event(self, alert_id: str, user_id: str, contact_id: str, channel: str, recipient: str, status: str, message: str, provider_response: str = None):
        try:
            from app.db.client import get_service_role_client
            service_client = get_service_role_client()
            event_data = {
                "alert_id": alert_id,
                "user_id": user_id,
                "contact_id": contact_id,
                "channel": channel,
                "recipient": recipient,
                "status": status,
                "message": message,
                "provider_response": provider_response
            }
            service_client.table("notification_events").insert(event_data).execute()
        except Exception as e:
            logger.error(f"Failed to log notification event: {e}")

    def notify_guardian(self, contact: Dict[str, Any], alert_type: str, user: Any, location: Dict[str, Any] = None, alert_id: str = None) -> str:
        """
        Attempts to notify a guardian contact via the configured provider.
        Returns the notification status: "SENT", "FAILED", "PROVIDER_NOT_CONFIGURED"
        """
        if self.provider == "none" or not contact.get("phone"):
            logger.info("Notification provider not configured or no phone provided.")
            self._log_event(alert_id, getattr(user, 'id', None), contact.get("id"), "sms", contact.get("phone"), "PROVIDER_NOT_CONFIGURED", "No provider")
            return {"sms_sent": False, "reason": "SMS_PROVIDER_NOT_CONFIGURED"}
            
        logger.info(f"Attempting to notify {contact.get('name')} via {self.provider} ({self.sms_provider})...")
        
        # Build message
        user_ident = user.email if hasattr(user, "email") else user.id
        msg = f"SafeHer Alert:\n{user_ident} triggered {alert_type}."
        
        if location and location.get("lat") and location.get("long"):
            msg += f"\nLocation: https://maps.google.com/?q={location['lat']},{location['long']}"
            
        msg += "\nPlease check immediately."
        
        if self.provider == "sms":
            status = self._send_sms(contact.get("phone"), msg)
            self._log_event(alert_id, getattr(user, 'id', None), contact.get("id"), "sms", contact.get("phone"), status, msg)
            return status
        elif self.provider == "push":
            status = self._send_push(contact.get("push_token"), msg)
            self._log_event(alert_id, getattr(user, 'id', None), contact.get("id"), "push", contact.get("push_token"), status, msg)
            return status
        else:
            self._log_event(alert_id, getattr(user, 'id', None), contact.get("id"), self.provider, contact.get("phone"), "PROVIDER_NOT_CONFIGURED", msg)
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

notification_service = NotificationService()
