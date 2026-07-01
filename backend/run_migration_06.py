import asyncio
import os
import sys
import logging

# Ensure the app module is reachable
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.client import get_service_role_client
from supabase import create_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def run_migration():
    client = get_service_role_client()
    
    with open("supabase/migrations/06_fix_ward_codes_and_notifications.sql", "r") as f:
        sql = f.read()

    # The Supabase python client doesn't have a direct raw SQL execute via the REST api.
    # But wait, earlier I used `supabase` cli to push migrations or just ran it via raw psycopg2.
    # Actually, I can use psycopg2 directly. The connection string is in `.env`
    
    from dotenv import load_dotenv
    load_dotenv()
    
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        logger.error("No SUPABASE_DB_URL found.")
        sys.exit(1)
        
    import psycopg2
    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()
        
        logger.info("Executing Migration SQL...")
        cur.execute(sql)
        logger.info("Migration SQL executed successfully.")
        
        logger.info("Resetting guardian_links...")
        cur.execute("DELETE FROM public.guardian_links;")
        
        # Validations
        cur.execute("""
        select count(*) as invalid_codes
        from public.profiles
        where guardian_code is null
        or guardian_code !~ '^[0-9]{6}$';
        """)
        invalid_codes = cur.fetchone()[0]
        logger.info(f"invalid_codes count: {invalid_codes}")
        
        cur.execute("select count(*) from public.guardian_links;")
        guardian_links_count = cur.fetchone()[0]
        logger.info(f"guardian_links_count: {guardian_links_count}")
        
        cur.execute("""
        select id, name, email, guardian_code
        from public.profiles
        order by created_at desc;
        """)
        profiles = cur.fetchall()
        logger.info("Profiles:")
        for p in profiles:
            logger.info(p)
            
        cur.close()
        conn.close()
    except Exception as e:
        logger.error(f"Error running migration: {e}")
        
if __name__ == "__main__":
    asyncio.run(run_migration())
