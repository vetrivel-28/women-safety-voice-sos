import asyncio
import logging
from datetime import datetime, timezone, timedelta
from app.db.client import get_service_role_client
from app.services.notification_service import notification_service

logger = logging.getLogger(__name__)

async def sos_escalation_loop():
    logger.info("Started SOS escalation worker loop")
    while True:
        try:
            await asyncio.sleep(10)
            service_client = get_service_role_client()
            
            # Fetch active alerts
            alerts_res = service_client.table("sos_alerts").select("id").eq("status", "ACTIVE").execute()
            active_alert_ids = [a["id"] for a in (alerts_res.data or [])]
            
            if not active_alert_ids:
                continue
                
            for alert_id in active_alert_ids:
                # Get pending targets sorted by priority
                targets_res = service_client.table("sos_escalation_targets")\
                    .select("*")\
                    .eq("sos_alert_id", alert_id)\
                    .is_("acknowledged_at", "null")\
                    .order("priority_order")\
                    .execute()
                    
                targets = targets_res.data or []
                if not targets:
                    continue
                    
                # Find the current active target (the one that should be notified next or is waiting)
                current_target = None
                for t in targets:
                    if t.get("notified_at") is None:
                        current_target = t
                        break
                    
                    # If notified, check if timeout exceeded
                    notified_time_str = t["notified_at"]
                    if notified_time_str.endswith("Z"):
                        notified_time_str = notified_time_str[:-1] + "+00:00"
                    notified_time = datetime.fromisoformat(notified_time_str)
                    
                    if datetime.now(timezone.utc) > notified_time + timedelta(seconds=90):
                        continue # Time expired for this target, move to next
                    else:
                        current_target = None # Still waiting for this target
                        break
                        
                if current_target and current_target.get("notified_at") is None:
                    # Notify this target
                    logger.info(f"Escalating SOS {alert_id} to {current_target['target_ref']} (Priority: {current_target['priority_order']})")
                    
                    # Mark as notified immediately to prevent duplicate sends if worker loops again
                    service_client.table("sos_escalation_targets")\
                        .update({"notified_at": datetime.now(timezone.utc).isoformat()})\
                        .eq("id", current_target["id"])\
                        .execute()
                        
                    # Trigger actual SMS
                    notification_service._send_sms(current_target["target_ref"], f"SafeHer SOS ALERT! Reply 'OK' to acknowledge.")
                    
        except asyncio.CancelledError:
            logger.info("SOS escalation worker loop cancelled")
            break
        except Exception as e:
            logger.error(f"Error in SOS escalation loop: {e}")
            await asyncio.sleep(10)
