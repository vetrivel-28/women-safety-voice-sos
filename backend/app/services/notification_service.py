import os
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class NotificationService:
    def __init__(self):
        self.provider = os.getenv("NOTIFICATION_PROVIDER", "none").lower()
        self.sms_provider = os.getenv("SMS_PROVIDER", "mock")
        
    def notify_guardian(self, contact: Dict[str, Any], alert_type: str, user: Any, location: Dict[str, Any] = None) -> str:
        """
        Attempts to notify a guardian contact via the configured provider.
        Returns the notification status: "SENT", "FAILED", "PROVIDER_NOT_CONFIGURED"
        """
        if self.provider == "none" or not contact.get("phone"):
            logger.info("Notification provider not configured or no phone provided.")
            return "PROVIDER_NOT_CONFIGURED"
            
        logger.info(f"Attempting to notify {contact.get('name')} via {self.provider} ({self.sms_provider})...")
        
        # Build message
        user_ident = user.email if hasattr(user, "email") else user.id
        msg = f"SafeHer Alert:\n{user_ident} triggered {alert_type}."
        
        if location and location.get("lat") and location.get("long"):
            msg += f"\nLocation: https://maps.google.com/?q={location['lat']},{location['long']}"
            
        msg += "\nPlease check immediately."
        
        if self.provider == "sms":
            return self._send_sms(contact.get("phone"), msg)
        elif self.provider == "push":
            return self._send_push(contact.get("push_token"), msg)
        else:
            return "PROVIDER_NOT_CONFIGURED"
            
    def _send_sms(self, phone: str, message: str) -> str:
        if self.sms_provider == "mock":
            # For testing without real API keys, pretend we sent it
            logger.info(f"[MOCK SMS] To: {phone} | Body: {message}")
            return "SENT"
        
        # TODO: Implement Twilio/AWS SNS etc. here
        logger.warning(f"Unimplemented SMS provider: {self.sms_provider}")
        return "FAILED"
        
    def _send_push(self, token: str, message: str) -> str:
        if not token:
            return "FAILED"
        logger.info(f"[MOCK PUSH] To: {token} | Body: {message}")
        return "SENT"

notification_service = NotificationService()
