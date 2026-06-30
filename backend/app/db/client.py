from supabase import create_client, Client, ClientOptions
from app.core.config import settings

import threading

_local = threading.local()

_options = ClientOptions(postgrest_client_timeout=5.0)

def get_supabase_client() -> Client:
    if not hasattr(_local, "supabase_client"):
        _local.supabase_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_ANON_KEY,
            options=_options
        )
    return _local.supabase_client

def get_service_role_client() -> Client:
    if not hasattr(_local, "service_role_client"):
        if not settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_SERVICE_ROLE_KEY == settings.SUPABASE_ANON_KEY:
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY is missing or equals ANON_KEY")
        _local.service_role_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
            options=_options
        )
    return _local.service_role_client
