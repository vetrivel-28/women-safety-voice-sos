import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.db.client import get_supabase_client
from app.core.config import settings

logger = logging.getLogger(__name__)
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    logger.info("Auth dependency called")
    logger.info(f"Token received: {token[:20]}...")

    supabase = get_supabase_client()
    
    try:
        # Use official Supabase auth validation
        logger.info(f"[*] Validating JWT via Supabase Auth endpoint: {settings.SUPABASE_URL}/auth/v1/user")
        logger.info("TEMPORARY LOG: About to call supabase.auth.get_user(token)")
        response = supabase.auth.get_user(token)
        if not response.user:
            logger.warning("[-] Authentication failed: No user found in token.")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
            )
        logger.info(f"[+] JWT Validated successfully for user: {response.user.id}")
        return {"user": response.user, "token": token}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[-] Authentication exception when calling Supabase: {type(e).__name__} - {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed. Could not reach Supabase.",
        )
