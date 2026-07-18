import asyncio
import logging
from datetime import datetime, timezone
from app.db.client import get_service_role_client
from app.services.journey_service import JourneyService

logger = logging.getLogger(__name__)

async def safe_window_sweep_loop():
    logger.info("Started Safe Window sweeper loop")
    while True:
        try:
            await asyncio.sleep(45) # Sweep every 45 seconds
            
            service_client = get_service_role_client()
            now_str = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            
            # 7. Performance: Do not scan entire table. Use specific conditions.
            # We want journeys that are active, and their check_in_due_at has passed.
            # We also verify ends_at to catch any that missed check-in deadline.
            res = service_client.table("safe_windows").select("id, user_id, check_in_due_at, ends_at") \
                .eq("status", "active") \
                .lt("check_in_due_at", now_str) \
                .is_("escalated_at", "null") \
                .execute()
                
            active_expired_journeys = res.data or []
            
            if not active_expired_journeys:
                continue
                
            logger.info(f"[SWEEPER] Found {len(active_expired_journeys)} expired active journeys.")
            
            # 6. Error Handling: Catch exceptions per journey to avoid stopping the loop.
            for journey in active_expired_journeys:
                journey_id = journey["id"]
                user_id = journey["user_id"]
                
                try:
                    # 5. Logging: Log every automatic escalation
                    logger.info(
                        f"[SWEEPER] Auto-escalating journey {journey_id} for user {user_id}. "
                        f"Previous status: active (due: {journey.get('check_in_due_at')}). "
                        f"New status: HIGH severity. Reason: AUTO_SWEEP"
                    )
                    
                    # Call shared service (idempotent)
                    result = JourneyService.escalate_journey(journey_id, user_id, reason="AUTO_SWEEP")
                    
                    if not result.get("success"):
                        logger.warning(f"[SWEEPER] Failed to escalate journey {journey_id}: {result.get('reason')}")
                        
                except Exception as e:
                    logger.error(f"[SWEEPER] Exception while processing journey {journey_id}: {e}", exc_info=True)
                    
        except asyncio.CancelledError:
            logger.info("Safe Window sweeper loop cancelled")
            break
        except Exception as e:
            logger.error(f"Error in Safe Window sweeper loop: {e}", exc_info=True)
            await asyncio.sleep(10)
