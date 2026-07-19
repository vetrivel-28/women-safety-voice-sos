from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, alerts, guardians, sos, profile, contacts, journeys, places, notifications, families
from app.api import trusted_places, family_locations, safety
from app.core.config import settings
from app.db.client import get_supabase_client
from contextlib import asynccontextmanager
import sys
import logging
import asyncio

logger = logging.getLogger(__name__)

from app.services.escalation_worker import sos_escalation_loop
from app.services.safe_window_sweeper import safe_window_sweep_loop

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure a root handler exists, then explicitly enable INFO for the worker
    logging.basicConfig(level=logging.WARNING)
    logging.getLogger().setLevel(logging.INFO)  # force root level even if handlers already exist
    logging.getLogger("app.services.escalation_worker").setLevel(logging.INFO)
    logging.getLogger("app.services.safe_window_sweeper").setLevel(logging.INFO)

    logger.info("--- Starting FastAPI Application ---")
    
    # Start background workers
    escalation_task = asyncio.create_task(sos_escalation_loop())
    sweeper_task = asyncio.create_task(safe_window_sweep_loop())
    
    logger.info(f"Python Version: {sys.version}")
    logger.info(f"Loaded SUPABASE_URL: {settings.SUPABASE_URL}")
    
    try:
        supabase = get_supabase_client()
        logger.info("[+] Supabase client initialized successfully.")
    except Exception as e:
        logger.error(f"[-] Supabase client initialization failed: {str(e)}")
        
    yield
    logger.info("--- Shutting Down FastAPI Application ---")
    escalation_task.cancel()
    sweeper_task.cancel()
    try:
        await asyncio.gather(escalation_task, sweeper_task, return_exceptions=True)
    except Exception:
        pass

app = FastAPI(
    title="SafeHer API",
    description="Backend for the SafeHer Women Safety App",
    version="1.0.0",
    lifespan=lifespan
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"===> [MIDDLEWARE] INCOMING REQUEST: {request.method} {request.url}")
    try:
        response = await call_next(request)
        logger.info(f"<=== [MIDDLEWARE] OUTGOING RESPONSE: {response.status_code}")
        return response
    except Exception as e:
        logger.error(f"<=== [MIDDLEWARE] EXCEPTION: {str(e)}")
        raise

import httpx
from fastapi.responses import JSONResponse

@app.exception_handler(httpx.TimeoutException)
async def httpx_timeout_handler(request: Request, exc: httpx.TimeoutException):
    logger.error(f"Supabase Timeout: {exc}")
    return JSONResponse(
        status_code=503,
        content={"detail": "Temporary backend data service unavailable. Please retry."}
    )

@app.exception_handler(httpx.RequestError)
async def httpx_request_error_handler(request: Request, exc: httpx.RequestError):
    logger.error(f"Supabase Request Error: {exc}")
    return JSONResponse(
        status_code=503,
        content={"detail": "Temporary backend data service unavailable. Please retry."}
    )

# Configure CORS — mobile-only API; no legitimate cross-origin browser callers.
# allow_credentials=False + empty origins prevents browser credential-stealing attacks
# while still allowing simple (non-credentialed) preflight from monitoring/health-check tools.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(alerts.router)
app.include_router(guardians.router)
app.include_router(sos.router)
app.include_router(profile.router)
app.include_router(contacts.router)
app.include_router(journeys.router)
app.include_router(places.router)
app.include_router(notifications.router)
app.include_router(families.router)
app.include_router(trusted_places.router)
app.include_router(family_locations.router)
app.include_router(safety.router)

@app.get("/")
async def root():
    return {"message": "SafeHer API is running. Stage A Checkpoint."}

@app.get("/health")
async def health():
    try:
        # Perform a lightweight query to ensure the DB connection is fully warm
        client = get_supabase_client()
        client.table("profiles").select("id").limit(1).execute()
        return {"status": "ok", "message": "Backend and Database are healthy"}
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Database connection not ready")
