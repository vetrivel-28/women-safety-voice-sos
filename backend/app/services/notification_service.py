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
            if self.sms_provider == "twilio":
                sid = os.getenv("TWILIO_ACCOUNT_SID")
                token = os.getenv("TWILIO_AUTH_TOKEN")
                from_num = os.getenv("TWILIO_FROM_NUMBER")
                
                if not sid or not token or not from_num:
                    logger.error("Missing Twilio credentials in env (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)")
                    return {"sms_sent": False, "reason": "MISSING_CREDENTIALS"}
                    
                import requests
                url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
                auth = (sid, token)
                data = {"To": phone, "From": from_num, "Body": message}
                response = requests.post(url, auth=auth, data=data, timeout=10)
                if response.status_code in (200, 201):
                    logger.info(f"[TWILIO SMS] Sent to {phone}")
                    return {"sms_sent": True, "reason": "SENT_VIA_TWILIO"}
                else:
                    logger.error(f"Twilio API Error: {response.text}")
                    return {"sms_sent": False, "reason": "TWILIO_API_ERROR"}
                    
            if self.sms_provider == "mock" or self.sms_provider == "none" or not self.sms_provider:
                logger.info(f"[MOCK SMS] To: {phone} | Body: {message}")
                return {"sms_sent": False, "reason": "SMS_PROVIDER_NOT_CONFIGURED"}
            
            logger.warning(f"Unimplemented SMS provider: {self.sms_provider}")
            return {"sms_sent": False, "reason": "SMS_PROVIDER_NOT_CONFIGURED"}
        except Exception as e:
            logger.error(f"SMS Provider Crash Prevented: {e}")
            return {"sms_sent": False, "reason": "PROVIDER_CRASH_PREVENTED"}
            
    def _send_email(self, email: str, subject: str, message: str) -> Any:
        try:
            api_key = os.getenv("SENDGRID_API_KEY")
            from_email = os.getenv("SENDGRID_FROM_EMAIL")
            
            if not api_key or not from_email:
                logger.error("Missing SendGrid credentials in env (SENDGRID_API_KEY, SENDGRID_FROM_EMAIL)")
                return {"email_sent": False, "reason": "MISSING_CREDENTIALS"}
                
            import requests
            url = "https://api.sendgrid.com/v3/mail/send"
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            data = {
                "personalizations": [{"to": [{"email": email}]}],
                "from": {"email": from_email},
                "subject": subject,
                "content": [{"type": "text/plain", "value": message}]
            }
            response = requests.post(url, headers=headers, json=data, timeout=10)
            if response.status_code in (200, 201, 202):
                logger.info(f"[SENDGRID EMAIL] Sent to {email}")
                return {"email_sent": True, "reason": "SENT_VIA_SENDGRID"}
            else:
                logger.error(f"SendGrid API Error: {response.text}")
                return {"email_sent": False, "reason": "SENDGRID_API_ERROR"}
        except Exception as e:
            logger.error(f"SendGrid Email Crash Prevented: {e}")
            return {"email_sent": False, "reason": "PROVIDER_CRASH_PREVENTED"}
            
    def _send_whatsapp(self, phone: str, message: str) -> Any:
        logger.info(f"[MOCK WHATSAPP] To: {phone} | Body: {message}")
        logger.warning("WhatsApp is explicitly stubbed and not implemented for this release.")
        return {"whatsapp_sent": False, "reason": "NOT_IMPLEMENTED_THIS_RELEASE"}

    def _send_voice(self, phone: str, message: str) -> Any:
        logger.info(f"[MOCK VOICE] To: {phone} | Body: {message}")
        logger.warning("Voice calling is explicitly stubbed and not implemented for this release.")
        return {"voice_sent": False, "reason": "NOT_IMPLEMENTED_THIS_RELEASE"}
        
    def _send_push(self, token: str, message: str) -> str:
        if not token:
            return "FAILED"
        logger.info(f"[MOCK PUSH] To: {token} | Body: {message}")
        return "SENT"

    def notify_all_guardians(self, user_id: str, alert_type: str, user: Any, location: Dict[str, Any] = None, alert_id: str = None) -> list:
        """Notifies emergency contacts (SMS) AND linked app guardians (in_app_notifications)."""
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
            res = self.notify_guardian(contact, alert_type, user, location)
            results.append(res)

        # Also push in_app_notifications to linked app guardians
        self._notify_linked_guardians_in_app(
            user_id=user_id,
            alert_type=alert_type,
            user=user,
            location=location,
            alert_id=alert_id,
        )
            
        return results

    def _notify_linked_guardians_in_app(self, user_id: str, alert_type: str, user: Any,
                                         location: Dict[str, Any] = None, alert_id: str = None):
        """Insert in_app_notifications for every active guardian linked to the ward."""
        try:
            from app.db.client import get_service_role_client
            service_client = get_service_role_client()

            links_res = service_client.table("guardian_links").select("guardian_user_id").eq("user_id", user_id).eq("status", "ACTIVE").execute()
            guardian_ids = [row["guardian_user_id"] for row in (links_res.data or [])]
            if not guardian_ids:
                return

            # Resolve ward display name
            ward_name = getattr(user, 'email', None) or user_id
            try:
                wp = service_client.table("profiles").select("full_name, email").eq("id", user_id).execute()
                if wp.data:
                    ward_name = wp.data[0].get("full_name") or wp.data[0].get("email") or ward_name
            except Exception:
                pass

            action_label = {
                "MANUAL_SOS": "triggered an SOS alert",
                "SILENT_SOS": "triggered a silent SOS alert",
                "JOURNEY_MISSED_CHECKIN": "missed a journey check-in",
                "DEAD_MAN_MISSED": "missed a check-in timer",
                "SAFE_WINDOW_MISSED": "missed a safe window check-in",
            }.get(alert_type, f"triggered {alert_type}")

            for guardian_id in guardian_ids:
                try:
                    # Deduplicate: check if notification already exists for this alert and guardian
                    existing = service_client.table("in_app_notifications").select("id").eq("user_id", guardian_id).eq("alert_id", alert_id).eq("type", f"ward_{alert_type.lower()}").execute()
                    if existing.data:
                        continue
                        
                    service_client.table("in_app_notifications").insert({
                        "user_id": guardian_id,
                        "actor_user_id": user_id,
                        "alert_id": alert_id,
                        "type": f"ward_{alert_type.lower()}",
                        "title": "Ward alert",
                        "message": f"{ward_name} {action_label}.",
                        "metadata": {
                            "trigger_type": alert_type,
                            "ward_id": user_id,
                            "ward_name": ward_name,
                            "alert_id": alert_id,
                            "location": location,
                        },
                    }).execute()
                except Exception as e:
                    logger.warning(f"Failed to insert in_app_notification for guardian {guardian_id}: {e}")
        except Exception as e:
            logger.error(f"_notify_linked_guardians_in_app failed: {e}")

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

            # Resolve ward display name
            ward_name = getattr(user, 'email', None) or user_id
            try:
                wp = service_client.table("profiles").select("full_name, email").eq("id", user_id).execute()
                if wp.data:
                    ward_name = wp.data[0].get("full_name") or wp.data[0].get("email") or ward_name
            except Exception:
                pass

            action_label = {
                "MANUAL_SOS": "triggered an SOS",
                "SILENT_SOS": "triggered a silent SOS",
                "JOURNEY_MISSED_CHECKIN": "missed a journey check-in",
                "DEAD_MAN_MISSED": "missed a check-in timer",
                "SAFE_WINDOW_MISSED": "missed a safe window check-in",
            }.get(alert_type, f"triggered {alert_type}")

            # Write both family_notification_events AND in_app_notifications
            results = []
            for member_id in other_member_ids:
                # family_notification_events (offline queue)
                try:
                    event_data = {
                        "family_id": family_id,
                        "user_id": member_id,
                        "type": "FAMILY_SOS",
                        "payload": {
                            "trigger_type": alert_type,
                            "triggered_by_user_id": user_id,
                            "location": location,
                            "alert_id": alert_id,
                        },
                        "status": "queued",
                    }
                    service_client.table("family_notification_events").insert(event_data).execute()
                except Exception as e:
                    logger.warning(f"Failed to insert family_notification_events: {e}")

                # in_app_notifications (bell icon)
                try:
                    service_client.table("in_app_notifications").insert({
                        "user_id": member_id,
                        "actor_user_id": user_id,
                        "alert_id": alert_id,
                        "type": f"family_{alert_type.lower()}",
                        "title": "Family alert",
                        "message": f"{ward_name} {action_label}.",
                        "metadata": {
                            "trigger_type": alert_type,
                            "ward_id": user_id,
                            "ward_name": ward_name,
                            "family_id": family_id,
                            "alert_id": alert_id,
                            "location": location,
                        },
                    }).execute()
                except Exception as e:
                    logger.warning(f"Failed to insert in_app_notification for family member {member_id}: {e}")

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
        
        for i, contact in enumerate(contacts):
            try:
                # Add to escalation targets instead of sending immediately
                service_client.table("sos_escalation_targets").insert({
                    "sos_alert_id": alert_id,
                    "contact_type": "sms_contact",
                    "target_ref": contact.get("phone") or contact.get("email") or contact.get("id"),
                    "priority_order": i + 1
                }).execute()
            except Exception as e:
                logger.error(f"Failed to insert escalation target for contact: {e}")
                result["errors"].append(str(e))
                
        # Send SMS to priority 1 immediately here (or let the background job handle it right away)
        # We will let the background worker handle it so it's all in one place and durable.
        result["sms_status"] = "queued_for_escalation"
            
        return result

notification_service = NotificationService()
