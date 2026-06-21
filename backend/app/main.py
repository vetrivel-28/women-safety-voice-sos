from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth
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

@app.get("/")
async def root():
    return {"message": "SafeHer API is running. Stage A Checkpoint."}
