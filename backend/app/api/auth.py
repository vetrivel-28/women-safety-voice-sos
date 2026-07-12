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
        # NOTE: This endpoint assumes 'profiles' RLS is correctly configured (auth.uid() = id).
        # If RLS blocks a legitimate self-read, this will falsely trigger the auto-repair logic below.
        result = user_client.table("profiles").select("*").eq("id", user.id).execute()
        
        if not result.data:
            logger.warning(f"User {user.id} authenticated, but no profile found in database. Attempting centralized repair...")
            service_client = get_service_role_client()
            import random
            new_code = ""
            for _ in range(50):
                candidate = f"{random.randint(0, 999999):06d}"
                collision = service_client.table("profiles").select("id").eq("guardian_code", candidate).execute()
                if not collision.data:
                    new_code = candidate
                    break
            
            if not new_code:
                return {
                    "id": user.id,
                    "email": user.email,
                    "profile": None,
                    "status": "PROFILE_REPAIR_FAILED",
                    "message": "Profile missing and code generation failed."
                }
                
            try:
                metadata = getattr(user, "user_metadata", {}) or {}
                service_client.table("profiles").insert({
                    "id": user.id,
                    "email": user.email,
                    "full_name": metadata.get("full_name", ""),
                    "phone": metadata.get("mobile_number", ""),
                    "guardian_code": new_code,
                }).execute()
                result = user_client.table("profiles").select("*").eq("id", user.id).execute()
                if not result.data:
                    raise Exception("Verification query failed after repair insert.")
                logger.info(f"Successfully repaired missing profile for user {user.id}")
            except Exception as repair_err:
                logger.error(f"Profile repair failed for {user.id}: {repair_err}")
                return {
                    "id": user.id,
                    "email": user.email,
                    "profile": None,
                    "status": "PROFILE_INCOMPLETE_RETRYABLE",
                    "message": "Profile missing and repair failed."
                }
        logger.info(f"Successfully retrieved profile for user {user.id}")
        return {
            "id": user.id,
            "email": user.email,
            "status": "ACTIVE",
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
    Idempotent signup endpoint to handle Supabase auth and canonical profile creation safely (Option B).
    """
    service_client = get_service_role_client()
    try:
        # Check if this signup_request_id was already processed
        res = service_client.table("signup_requests").select("*").eq("id", req.signup_request_id).execute()
        if res.data:
            return {"message": "Signup already processed", "user_id": res.data[0]["user_id"]}

        admin_client = get_service_role_client()
        
        # 1. Create Auth User
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
        
        # 2. Generate canonical guardian code and create Profile
        import random
        new_code = ""
        for _ in range(50):
            candidate = f"{random.randint(0, 999999):06d}"
            collision = service_client.table("profiles").select("id").eq("guardian_code", candidate).execute()
            if not collision.data:
                new_code = candidate
                break
        
        if not new_code:
            # Clean up the auth user before failing
            admin_client.auth.admin.delete_user(user.id)
            raise HTTPException(status_code=500, detail="Failed to generate unique guardian code. Please try again.")

        try:
            service_client.table("profiles").insert({
                "id": user.id,
                "email": req.email,
                "full_name": req.full_name,
                "phone": req.mobile_number,
                "guardian_code": new_code,
            }).execute()
            
            # Verify profile exists via a fresh read query
            verify = service_client.table("profiles").select("id").eq("id", user.id).execute()
            if not verify.data:
                raise Exception("Profile insert succeeded but fresh read returned empty. Forcing rollback.")
                
        except Exception as e:
            logger.error(f"Failed to create profile for user {user.id}. Exception: {e}. Initiating compensating rollback.")
            # 3. Compensating action: Delete Auth user
            try:
                admin_client.auth.admin.delete_user(user.id)
                
                # Verify compensation via a fresh query
                try:
                    admin_client.auth.admin.get_user_by_id(user.id)
                    # If this succeeds, the user was NOT deleted
                    raise Exception(f"User {user.id} still exists after delete_user call.")
                except Exception as verify_err:
                    # Note: String-matching on exception text is slightly fragile if Supabase changes 
                    # their error formats, but it's acceptable here since we just want to ensure it's gone.
                    if "User not found" in str(verify_err) or "not_found" in str(verify_err) or "404" in str(verify_err):
                        # Expected outcome: user is gone
                        pass
                    else:
                        # Unexpected error during verification, treat as rollback failure
                        raise verify_err
                        
                logger.info(f"Successfully rolled back and verified deletion of Auth user {user.id} after profile creation failure.")
                from fastapi.responses import JSONResponse
                return JSONResponse(status_code=400, content={"error_code": "COMPENSATION_SUCCEEDED", "detail": "Signup failed during profile creation. Please try again."})
            except Exception as rollback_e:
                logger.critical(f"CRITICAL: Failed to roll back Auth user {user.id}. Orphaned user remains! {rollback_e}")
                from fastapi.responses import JSONResponse
                return JSONResponse(status_code=500, content={"error_code": "COMPENSATION_FAILED", "detail": "Critical error: Profile creation failed and account rollback failed. Please contact support."})

        # 4. Log request to prevent dupes
        try:
            service_client.table("signup_requests").insert({
                "id": req.signup_request_id,
                "user_id": user.id,
                "email": req.email
            }).execute()
        except Exception as e:
            logger.warning(f"Failed to insert signup_request idempotency record: {e}")

        return {"message": "Signup successful", "user_id": user.id}

    except Exception as e:
        logger.error(f"Signup error: {e}")
        # If it's a "User already registered" error, we can try to recover
        if "User already registered" in str(e) or "already exists" in str(e):
            return {"message": "User already exists. Please login."}
        raise HTTPException(status_code=500, detail=str(e))
