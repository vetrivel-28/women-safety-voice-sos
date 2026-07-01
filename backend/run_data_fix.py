import asyncio
import sys
import os
import logging
import random

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.db.client import get_service_role_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def generate_unique_code():
    return str(random.randint(0, 999999)).zfill(6)

async def run_data_fix():
    client = get_service_role_client()
    
    # 1. Fetch all profiles
    res = client.table("profiles").select("id, guardian_code").execute()
    profiles = res.data or []
    
    # 2. Fix invalid codes
    for p in profiles:
        code = p.get("guardian_code")
        if not code or not str(code).isdigit() or len(str(code)) != 6:
            new_code = generate_unique_code()
            logger.info(f"Fixing profile {p['id']}: replacing {code} with {new_code}")
            client.table("profiles").update({"guardian_code": new_code}).eq("id", p['id']).execute()
            
    # 3. Reset guardian links
    logger.info("Resetting guardian links...")
    links_res = client.table("guardian_links").select("id").execute()
    for link in (links_res.data or []):
        client.table("guardian_links").delete().eq("id", link["id"]).execute()
        
    # 4. Verify
    final_res = client.table("profiles").select("id, full_name, email, guardian_code").execute()
    logger.info("Current Profiles:")
    invalid_count = 0
    for p in final_res.data:
        code = p.get("guardian_code")
        logger.info(p)
        if not code or not str(code).isdigit() or len(str(code)) != 6:
            invalid_count += 1
            
    logger.info(f"Invalid codes count: {invalid_count}")
    
    final_links = client.table("guardian_links").select("id", count="exact").execute()
    logger.info(f"guardian_links_count: {final_links.count}")

if __name__ == "__main__":
    asyncio.run(run_data_fix())
