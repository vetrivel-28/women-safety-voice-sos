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
            
            import time
            service_client = get_service_role_client()
            
            # Fetch active alerts
            t0 = time.perf_counter()
            alerts_res = service_client.table("sos_alerts").select("id").eq("status", "ACTIVE").execute()
            t1 = time.perf_counter()
            logger.info(f"[TIMING] Active SOS alerts query: {(t1-t0)*1000:.1f}ms")

            active_alerts = alerts_res.data or []
            if not active_alerts:
                continue

            # 2. Batch-fetch targets for all active alerts to avoid N+1 queries
            t2 = time.perf_counter()
            alert_ids = [alert["id"] for alert in active_alerts]
            targets_res = service_client.table("sos_escalation_targets")\
                .select("*")\
                .in_("sos_alert_id", alert_ids)\
                .is_("acknowledged_at", "null")\
                .order("priority_order")\
                .execute()
            
            all_targets = targets_res.data or []
            t3 = time.perf_counter()
            logger.info(f"[TIMING] Batch sos_escalation_targets query for {len(alert_ids)} alerts: {(t3-t2)*1000:.1f}ms")

            # Group targets by alert_id
            from collections import defaultdict
            targets_by_alert = defaultdict(list)
            for t in all_targets:
                targets_by_alert[t["sos_alert_id"]].append(t)

            for alert in active_alerts:
                alert_id = alert["id"]
                targets = targets_by_alert[alert_id]
                
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
