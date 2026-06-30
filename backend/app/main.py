from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, alerts, guardians, sos, profile, contacts, journeys, places
from app.core.config import settings
from app.db.client import get_supabase_client
from contextlib import asynccontextmanager
import sys
import logging

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("--- Starting FastAPI Application ---")
    logger.info(f"Python Version: {sys.version}")
    logger.info(f"Loaded SUPABASE_URL: {settings.SUPABASE_URL}")
    
    try:
        supabase = get_supabase_client()
        logger.info("[+] Supabase client initialized successfully.")
    except Exception as e:
        logger.error(f"[-] Supabase client initialization failed: {str(e)}")
        
    yield
    logger.info("--- Shutting Down FastAPI Application ---")

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

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For demo purposes
    allow_credentials=True,
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

@app.get("/")
async def root():
    return {"message": "SafeHer API is running. Stage A Checkpoint."}

@app.get("/health")
async def health():
    return {"status": "ok", "message": "Backend is healthy"}
