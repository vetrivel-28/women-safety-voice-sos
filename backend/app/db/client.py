from supabase import create_client, Client
from app.core.config import settings

_supabase_client = None
_service_role_client = None

def get_supabase_client() -> Client:
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_ANON_KEY
        )
    return _supabase_client

def get_service_role_client() -> Client:
    global _service_role_client
    if _service_role_client is None:
        if not settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_SERVICE_ROLE_KEY == settings.SUPABASE_ANON_KEY:
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY is missing or equals ANON_KEY")
        _service_role_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY
        )
    return _service_role_client

def get_user_supabase_client(token: str) -> Client:
    """
    Creates a new Supabase client scoped to the authenticated user's JWT.
    This ensures RLS policies are applied correctly for the user.
    """
    from supabase import ClientOptions
    options = ClientOptions(headers={'Authorization': f'Bearer {token}'})
    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_ANON_KEY,
        options=options
    )
