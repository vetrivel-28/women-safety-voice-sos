import supabase_auth
import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.db.client import get_supabase_client
from app.core.config import settings

logger = logging.getLogger(__name__)
security = HTTPBearer()

import time

_AUTH_CACHE = {}
CACHE_TTL = 300  # 5 minutes

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    logger.info("Auth dependency called")
    
    now = time.time()
    
    # 1. Check in-memory cache to prevent rate-limiting
    if token in _AUTH_CACHE:
        user_obj, expires = _AUTH_CACHE[token]
        if now < expires:
            logger.debug(f"JWT validated from cache for user: {user_obj.id}")
            return {
                "user": user_obj,
                "token": token,
            }
        else:
            del _AUTH_CACHE[token]

    supabase = get_supabase_client()
    
    try:
        # Use official Supabase auth validation
        response = supabase.auth.get_user(token)

        if not response.user:
            logger.warning("No user found in token")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired. Please login again.",
            )

        logger.info(f"JWT validated for user: {response.user.id}")
        
        # Save to cache
        _AUTH_CACHE[token] = (response.user, now + CACHE_TTL)
        
        # Simple cleanup to prevent unbounded memory growth
        if len(_AUTH_CACHE) > 1000:
            for k in list(_AUTH_CACHE.keys()):
                if now > _AUTH_CACHE[k][1]:
                    del _AUTH_CACHE[k]

        return {
            "user": response.user,
            "token": token,
        }
    except HTTPException:
        raise
    except Exception as e:
        err_msg = str(e).lower()
        if "timeout" in err_msg:
            logger.error("Authentication timeout")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication service timeout. Please try again.",
            )
        else:
            logger.error("Authentication exception", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired. Please login again.",
            )
