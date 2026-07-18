import logging
from datetime import datetime, timezone
from app.db.client import get_service_role_client
from app.services.notification_service import notification_service
from app.api.journeys import _get_ward_name, _notify_safety_recipients

logger = logging.getLogger(__name__)

class JourneyService:
    @staticmethod
    def escalate_journey(journey_id: str, user_id: str, reason: str = "MISSED_CHECKIN"):
        """
        Escalates a Safe Window journey. Safe to call multiple times (idempotent).
        Returns a dict with success, journey, alert, and reason.
        """
        service_client = get_service_role_client()
        now = datetime.now(timezone.utc)
        now_str = now.isoformat().replace("+00:00", "Z")

        try:
            # Escalate: ACTIVE → status keeps 'active' but severity becomes HIGH + escalated_at set
            update_res = service_client.table("safe_windows").update({
                "missed_check_in_at": now_str,
                "severity": "HIGH",
                "escalated_at": now_str,
                "escalated_reason": reason,
                "last_escalation_notif_at": now_str,
                "escalation_notif_count": 1,
            }).eq("id", journey_id).eq("user_id", user_id).eq("status", "active").is_("escalated_at", "null").execute()

            if not update_res.data:
                existing = service_client.table("safe_windows").select("*").eq("id", journey_id).eq("user_id", user_id).execute()
                if not existing.data:
                    return {"success": False, "reason": "Journey not found", "safe_window": None, "alert": None}
                journey = existing.data[0]
                return {"success": True, "safe_window": journey, "alert": None,
                        "guardian_notified": False, "reason": "Already processed"}

            journey = update_res.data[0]

            # Log timeline event
            try:
                notification_service._log_event(
                    alert_id=None,
                    user_id=user_id,
                    event_type="SAFE_WINDOW_MISSED",
                    status="SUCCESS",
                    message=f"Journey check-in missed — escalated to HIGH (Reason: {reason})",
                    journey_id=journey_id,
                    metadata={"severity": "HIGH", "reason": reason},
                )
            except Exception as log_err:
                logger.warning(f"Failed to log SAFE_WINDOW_MISSED: {log_err}")

            # Prevent duplicate SOS alert
            sos_existing = service_client.table("sos_alerts").select("id") \
                .eq("safe_window_id", journey_id).eq("trigger_type", "JOURNEY_MISSED_CHECKIN").execute()

            alert_data = None
            guardian_notified = False
            result_reason = "Alert already exists"

            if not sos_existing.data:
                sos_data = {
                    "user_id": user_id,
                    "trigger_type": "JOURNEY_MISSED_CHECKIN",
                    "safe_window_id": journey_id,
                    "status": "ACTIVE",
                    "location_lat": journey.get("current_latitude") or journey.get("start_latitude"),
                    "location_long": journey.get("current_longitude") or journey.get("start_longitude"),
                    "visible_message": "Journey Mode check-in missed",
                    "cancel_method": "NONE",
                }
                try:
                    service_client.table("sos_alerts").update({
                        "status": "RESOLVED",
                        "cancel_method": "AUTO_RESOLVED",
                        "cancelled_at": now_str,
                    }).eq("user_id", user_id).eq("status", "ACTIVE").execute()
                except Exception as resolve_err:
                    logger.warning(f"Failed to auto-resolve previous alerts: {resolve_err}")

                sos_res = service_client.table("sos_alerts").insert(sos_data).execute()
                if sos_res.data:
                    alert_data = sos_res.data[0]

            # Bell notification → guardians + family with HIGH severity
            try:
                # We need a user object just for email fallback, a mock is fine for the worker
                user_mock = type('obj', (object,), {'email': None})
                ward_name = _get_ward_name(service_client, user_id, user_mock)
                dest_label = (
                    journey.get("destination_name")
                    or journey.get("destination_address")
                    or "destination"
                )
                location = None
                lat = journey.get("current_latitude") or journey.get("start_latitude")
                lon = journey.get("current_longitude") or journey.get("start_longitude")
                if lat and lon:
                    location = {"lat": lat, "long": lon}

                _notify_safety_recipients(
                    service_client,
                    ward_id=user_id,
                    ward_name=ward_name,
                    event_type="safe_window_checkin_missed",
                    title="Missed check-in ⚠️",
                    message=f"{ward_name} missed a Safe Window check-in.",
                    metadata={
                        "journey_id": journey_id,
                        "ward_id": user_id,
                        "ward_name": ward_name,
                        "severity": "HIGH",
                        "destination_name": dest_label,
                        "last_known_latitude": lat,
                        "last_known_longitude": lon,
                        "missed_at": now_str,
                        "alert_id": alert_data["id"] if alert_data else None,
                        "escalated_reason": reason,
                    },
                )
                guardian_notified = True
                result_reason = "Success"
            except Exception as notif_err:
                logger.error(f"Missed-checkin notification error: {notif_err}")
                result_reason = str(notif_err)

            # Also use existing SMS path
            if alert_data:
                try:
                    notification_service.send_sos_sms_to_emergency_contacts(
                        user_id=user_id,
                        alert_id=alert_data["id"],
                        alert_payload={"id": alert_data["id"], "trigger_type": "JOURNEY_MISSED_CHECKIN",
                                       "location": location},
                        user=user_mock,
                    )
                    notification_service.notify_all_guardians(
                        user_id=user_id,
                        alert_type="JOURNEY_MISSED_CHECKIN",
                        user=user_mock,
                        location=location,
                        alert_id=alert_data["id"],
                    )
                except Exception as sms_err:
                    logger.warning(f"SMS/guardian notify failed (non-fatal): {sms_err}")

            return {
                "success": True,
                "safe_window": journey,
                "alert": alert_data,
                "guardian_notified": guardian_notified,
                "reason": result_reason,
            }
        except Exception as e:
            logger.error(f"Error in JourneyService.escalate_journey: {str(e)}", exc_info=True)
            raise e
