import uuid
from fastapi import APIRouter, Depends, HTTPException, status
import logging
from app.core.auth import get_current_user
from app.core.config import settings
from supabase import create_client, ClientOptions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.get("/me")
def get_me(auth_data: dict = Depends(get_current_user)):
    """
    Returns the current user profile. Tests RLS using the user's token.
    """
    try:
        user = auth_data["user"]
        token = auth_data["token"]
        
        # Create a user-scoped client by passing the access token
        options = ClientOptions(headers={'Authorization': f'Bearer {token}'})
        user_client = create_client(
            settings.SUPABASE_URL, 
            settings.SUPABASE_ANON_KEY,
            options=options
        )
        
        # Query the profile. If RLS works, we only get our own profile.
        result = user_client.table("profiles").select("*").eq("id", user.id).execute()
        
        if not result.data:
            logger.warning(f"User {user.id} authenticated, but no profile found in database.")
            return {
                "id": user.id,
                "email": user.email,
                "profile": None,
                "message": "User authenticated, but no profile found in database"
            }
            
        logger.info(f"Successfully retrieved profile for user {user.id}")
        return {
            "id": user.id,
            "email": user.email,
            "profile": result.data[0]
        }
    except Exception as e:
        logger.error(f"Error fetching user profile: {str(e)}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve user profile.")
from pydantic import BaseModel
from app.db.client import get_service_role_client

class SignupRequest(BaseModel):
    email: str
    password: str
    full_name: str
    mobile_number: str
    signup_request_id: str

@router.post("/signup")
def signup_idempotent(req: SignupRequest):
    """
    Idempotent signup endpoint to handle Supabase auth and initial profile creation safely.
    """
    service_client = get_service_role_client()
    try:
        # Check if this signup_request_id was already processed
        res = service_client.table("signup_requests").select("*").eq("id", req.signup_request_id).execute()
        if res.data:
            return {"message": "Signup already processed", "user_id": res.data[0]["user_id"]}

        # Attempt to sign up via Supabase Admin Auth
        admin_client = get_service_role_client()
        
        auth_res = admin_client.auth.admin.create_user({
            "email": req.email,
            "password": req.password,
            "email_confirm": True,
            "user_metadata": {
                "full_name": req.full_name,
                "mobile_number": req.mobile_number
            }
        })
        user = auth_res.user

        guardian_code = uuid.uuid4().hex[:8].upper()
        service_client.table("profiles").upsert({
            "id": user.id,
            "email": req.email,
            "full_name": req.full_name,
            "phone": req.mobile_number,
            "guardian_code": guardian_code
        }, on_conflict="id").execute()

        # Log request to prevent dupes
        service_client.table("signup_requests").insert({
            "id": req.signup_request_id,
            "user_id": user.id,
            "email": req.email
        }).execute()

        return {"message": "Signup successful", "user_id": user.id}

    except Exception as e:
        logger.error(f"Signup error: {e}")
        # If it's a "User already registered" error, we can try to recover
        if "User already registered" in str(e) or "already exists" in str(e):
            return {"message": "User already exists. Please login."}
        raise HTTPException(status_code=500, detail=str(e))
