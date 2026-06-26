import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import get_current_user
from app.db.client import get_service_role_client, get_supabase_client
from app.schemas.guardian import (
    GuardianLinkRequest,
    GuardianLinkResponse,
    GuardianCreate,
    GuardianResponse,
    GuardianUpdate
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/guardians", tags=["guardians"])


@router.get("/me/code")
def get_my_guardian_code(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()
    try:
        res = service_client.table("profiles").select("guardian_code, id, email, full_name").eq("id", user.id).execute()
        
        # If no profile exists, upsert one
        if not res.data:
            service_client.table("profiles").upsert({
                "id": user.id,
                "email": user.email,
            }).execute()
            # Fetch again
            res = service_client.table("profiles").select("guardian_code, id, email, full_name").eq("id", user.id).execute()
            
        profile = res.data[0]
        
        # If no guardian code, generate one
        if not profile.get("guardian_code"):
            import hashlib
            import uuid
            code = "SH-" + hashlib.md5(str(uuid.uuid4()).encode()).hexdigest()[:6].upper()
            service_client.table("profiles").update({"guardian_code": code}).eq("id", user.id).execute()
            profile["guardian_code"] = code

        return {
            "user_id": profile["id"],
            "email": profile.get("email"),
            "full_name": profile.get("full_name"),
            "guardian_code": profile["guardian_code"]
        }
    except Exception as e:
        logger.error(f"Error fetching guardian code: {e}")
        raise HTTPException(status_code=500, detail="Could not fetch guardian code")

@router.get("", response_model=List[dict])
def get_guardians(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        # Get links where this user is the user_id (they linked a guardian)
        result = service_client.table("guardian_links").select("id, status, created_at, profiles!guardian_links_guardian_id_fkey(id, full_name, phone, email)").eq("user_id", user.id).execute()
        
        # Flatten the response to be somewhat compatible
        mapped = []
        for row in result.data or []:
            prof = row.get("profiles", {})
            mapped.append({
                "id": row["id"],
                "guardian_user_id": prof.get("id"),
                "name": prof.get("full_name") or "Unknown",
                "phone": prof.get("phone") or "",
                "email": prof.get("email") or "",
                "status": row["status"],
                "created_at": row["created_at"]
            })
        return mapped
    except Exception as e:
        logger.error(f"Error fetching guardians: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch guardians")

@router.get("/watching", response_model=List[dict])
def get_watching(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        # Get links where this user is the guardian
        result = service_client.table("guardian_links").select("id, status, created_at, profiles!guardian_links_user_id_fkey(id, full_name, phone, email)").eq("guardian_user_id", user.id).execute()
        
        mapped = []
        for row in result.data or []:
            prof = row.get("profiles", {})
            mapped.append({
                "id": row["id"],
                "protected_user_id": prof.get("id"),
                "name": prof.get("full_name") or "Unknown",
                "phone": prof.get("phone") or "",
                "email": prof.get("email") or "",
                "status": row["status"],
                "created_at": row["created_at"]
            })
        return mapped
    except Exception as e:
        logger.error(f"Error fetching protected users: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch protected users")

@router.get("/alerts", response_model=List[dict])
def get_guardian_alerts(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        # Get users this guardian is watching
        links = service_client.table("guardian_links").select("user_id").eq("guardian_user_id", user.id).execute()
        protected_user_ids = [link["user_id"] for link in links.data or []]
        
        if not protected_user_ids:
            return []
            
        alerts = service_client.table("sos_alerts").select("*, profiles!sos_alerts_user_id_fkey(full_name, phone)").in_("user_id", protected_user_ids).order("created_at", desc=True).execute()
        return alerts.data or []
    except Exception as e:
        logger.error(f"Error fetching guardian alerts: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch guardian alerts")

@router.get("/safe-windows", response_model=List[dict])
def get_guardian_safe_windows(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        links = service_client.table("guardian_links").select("user_id").eq("guardian_user_id", user.id).execute()
        protected_user_ids = [link["user_id"] for link in links.data or []]
        
        if not protected_user_ids:
            return []
            
        windows = service_client.table("safe_windows").select("*, profiles!safe_windows_user_id_fkey(full_name, phone)").in_("user_id", protected_user_ids).order("started_at", desc=True).execute()
        return windows.data or []
    except Exception as e:
        logger.error(f"Error fetching guardian safe windows: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch guardian safe windows")

@router.get("/safe-windows/{window_id}", response_model=dict)
def get_guardian_safe_window(window_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        links = service_client.table("guardian_links").select("user_id").eq("guardian_user_id", user.id).execute()
        protected_user_ids = [link["user_id"] for link in links.data or []]
        
        if not protected_user_ids:
            raise HTTPException(status_code=404, detail="Safe window not found or unauthorized")
            
        window = service_client.table("safe_windows").select("*, profiles!safe_windows_user_id_fkey(full_name, phone)").eq("id", window_id).in_("user_id", protected_user_ids).execute()
        if not window.data:
            raise HTTPException(status_code=404, detail="Safe window not found or unauthorized")
            
        return window.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching guardian safe window: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch guardian safe window")

@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_guardian_link(link_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        result = service_client.table("guardian_links").delete().eq("id", link_id).eq("user_id", user.id).execute()
        return
    except Exception as e:
        logger.error(f"Error deleting guardian link: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not delete guardian link")


@router.post(
    "/link",
    response_model=GuardianLinkResponse,
    status_code=status.HTTP_201_CREATED
)
def link_guardian(
    link_in: GuardianLinkRequest,
    auth_data: dict = Depends(get_current_user)
):
    """
    Link a guardian using their email address.
    """

    user = auth_data["user"]
    service_client = get_service_role_client()

    logger.info(
        f"Linking guardian {link_in.guardian_email} "
        f"to user {user.id}"
    )

    try:
        # Look up guardian in profiles table
        if getattr(link_in, "guardian_code", None):
            guardian_result = (
                service_client
                .table("profiles")
                .select("id,email")
                .eq("guardian_code", link_in.guardian_code)
                .execute()
            )
        elif getattr(link_in, "guardian_user_id", None):
            guardian_result = (
                service_client
                .table("profiles")
                .select("id,email")
                .eq("id", link_in.guardian_user_id)
                .execute()
            )
        else:
            guardian_result = (
                service_client
                .table("profiles")
                .select("id,email")
                .eq("email", link_in.guardian_email)
                .execute()
            )

        if not guardian_result.data:
            raise HTTPException(
                status_code=404,
                detail="Guardian not found"
            )

        guardian_id = guardian_result.data[0]["id"]

        # Prevent self-linking
        if guardian_id == user.id:
            raise HTTPException(
                status_code=400,
                detail="Cannot link yourself as guardian"
            )

        # Check for existing link
        existing_link = (
            service_client
            .table("guardian_links")
            .select("*")
            .eq("user_id", user.id)
            .eq("guardian_user_id", guardian_id)
            .execute()
        )

        if existing_link.data:
            from fastapi.responses import JSONResponse
            # Return 200 with message
            data = existing_link.data[0]
            data["message"] = "Already linked"
            return JSONResponse(status_code=200, content=data)

        # Create guardian link
        link_data = {
            "user_id": user.id,
            "guardian_user_id": guardian_id,
            "status": "ACTIVE"
        }

        result = (
            service_client
            .table("guardian_links")
            .insert(link_data)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=500,
                detail="Failed to create guardian link"
            )

        return result.data[0]

    except HTTPException:
        raise

    except Exception as e:
        logger.error(
            f"Error linking guardian: {str(e)}",
            exc_info=True
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not link guardian"
        )