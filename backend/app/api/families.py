import logging
import random
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.auth import get_current_user
from app.db.client import get_service_role_client
from app.schemas.family import FamilyCreate, FamilyResponse, FamilyMemberResponse, JoinRequestCreate, JoinRequestResponse, FamilyRename

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/family", tags=["family"])


def generate_pin():
    return str(random.randint(0, 999999)).zfill(6)


def _insert_in_app_notification(service_client, *, user_id: str, actor_user_id: str = None,
                                 type_: str, title: str, message: str, metadata: dict = None):
    """Insert a bell notification row. Non-fatal — logs on failure."""
    try:
        row = {
            "user_id": user_id,
            "type": type_,
            "title": title,
            "message": message,
            "metadata": metadata or {},
        }
        if actor_user_id:
            row["actor_user_id"] = actor_user_id
        service_client.table("in_app_notifications").insert(row).execute()
    except Exception as e:
        logger.warning(f"[Notifications] Failed to insert in_app_notification (type={type_}): {e}")


# -----------------------------------------------------------------------


# -----------------------------------------------------------------------
# STATIC ROUTES FIRST — must precede /{family_id} parameterised routes
# -----------------------------------------------------------------------

@router.get("/my/current")
def get_my_current_family(auth_data: dict = Depends(get_current_user)):
    """
    Returns one of three states for the caller:
    - null  → no family and no pending request
    - { status: 'pending', join_request: {...}, family_name: str }  → pending join request
    - { status: 'active', families: {...}, ... }  → active membership row with embedded family
    """
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        # Check for active membership first
        membership = (
            service_client.table("family_members")
            .select("*, families(*)")
            .eq("user_id", user.id)
            .eq("status", "active")
            .execute()
        )
        if membership.data:
            return membership.data[0]

        # No active family — check for a pending join request
        pending = (
            service_client.table("family_join_requests")
            .select("*, families(id, family_name)")
            .eq("requester_user_id", user.id)
            .eq("status", "pending")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if pending.data:
            req = pending.data[0]
            return {
                "status": "pending",
                "join_request": req,
                "family_name": (req.get("families") or {}).get("family_name", ""),
                "family_id": req.get("family_id"),
            }

        return None

    except Exception as e:
        logger.error(f"Error fetching current family: {e}")
        raise HTTPException(status_code=500, detail="Database error")


@router.post("/", response_model=FamilyResponse, status_code=status.HTTP_201_CREATED)
def create_family(family_in: FamilyCreate, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        existing = (
            service_client.table("family_members")
            .select("id")
            .eq("user_id", user.id)
            .eq("status", "active")
            .execute()
        )
        if existing.data:
            raise HTTPException(status_code=400, detail="User is already in an active family")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking existing family: {e}")
        raise HTTPException(status_code=500, detail="Database error")

    max_attempts = 5
    for attempt in range(max_attempts):
        pin = generate_pin()
        family_data = {
            "family_name": family_in.family_name,
            "family_pin": pin,
            "host_user_id": user.id,
        }
        try:
            result = service_client.table("families").insert(family_data).execute()
            if result.data:
                created_family = result.data[0]
                service_client.table("family_members").insert({
                    "family_id": created_family["id"],
                    "user_id": user.id,
                    "role": "host",
                    "status": "active",
                }).execute()
                return created_family
        except Exception as e:
            err_str = str(e)
            if "duplicate key value violates unique constraint" in err_str or "23505" in err_str:
                continue
            else:
                logger.error(f"Error creating family: {e}")
                raise HTTPException(status_code=500, detail="Failed to create family")

    raise HTTPException(status_code=500, detail="Failed to generate unique PIN. Please try again.")


@router.post("/join", response_model=JoinRequestResponse)
def join_family(join_in: JoinRequestCreate, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        # Must not already be in an active family
        active_membership = (
            service_client.table("family_members")
            .select("id")
            .eq("user_id", user.id)
            .eq("status", "active")
            .execute()
        )
        if active_membership.data:
            raise HTTPException(status_code=400, detail="You are already a member of a family")

        # Resolve family by PIN
        family_res = (
            service_client.table("families")
            .select("*")
            .eq("family_pin", join_in.family_pin)
            .execute()
        )
        if not family_res.data:
            raise HTTPException(status_code=404, detail="Invalid PIN. No family found with that code.")

        family = family_res.data[0]

        # Idempotency — no duplicate pending requests
        existing_req = (
            service_client.table("family_join_requests")
            .select("id, status")
            .eq("family_id", family["id"])
            .eq("requester_user_id", user.id)
            .eq("status", "pending")
            .execute()
        )
        if existing_req.data:
            raise HTTPException(
                status_code=400,
                detail="Your join request is already pending owner approval.",
            )

        # Create the pending join request
        req_data = {
            "family_id": family["id"],
            "requester_user_id": user.id,
            "status": "pending",
        }
        created_req = service_client.table("family_join_requests").insert(req_data).execute()
        if not created_req.data:
            raise HTTPException(status_code=500, detail="Failed to create join request")

        created = created_req.data[0]

        # Resolve requester display name for notification
        requester_profile = (
            service_client.table("profiles")
            .select("full_name, email")
            .eq("id", user.id)
            .execute()
        )
        rp = requester_profile.data[0] if requester_profile.data else {}
        requester_name = rp.get("full_name") or rp.get("email") or "Someone"

        # Notify the family host (bell notification)
        _insert_in_app_notification(
            service_client,
            user_id=family["host_user_id"],
            actor_user_id=user.id,
            type_="family_join_requested",
            title="Family join request",
            message=f"{requester_name} wants to join your family \"{family['family_name']}\".",
            metadata={
                "family_id": family["id"],
                "family_name": family["family_name"],
                "request_id": created["id"],
                "requester_id": user.id,
                "requester_name": requester_name,
            },
        )

        return created

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error joining family: {e}")
        raise HTTPException(status_code=500, detail="Database error")


@router.post("/join-requests/{request_id}/approve")
def approve_join_request(request_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        req = service_client.table("family_join_requests").select("*").eq("id", request_id).execute()
        if not req.data:
            raise HTTPException(status_code=404, detail="Join request not found")

        req_data = req.data[0]
        if req_data["status"] != "pending":
            raise HTTPException(status_code=400, detail="Request is not pending")

        family_res = service_client.table("families").select("*").eq("id", req_data["family_id"]).execute()
        if not family_res.data:
            raise HTTPException(status_code=404, detail="Family not found")
        family = family_res.data[0]

        if family["host_user_id"] != user.id:
            raise HTTPException(status_code=403, detail="Only the family owner can approve requests")

        # Ensure requester isn't already in another family
        active_membership = (
            service_client.table("family_members")
            .select("id")
            .eq("user_id", req_data["requester_user_id"])
            .eq("status", "active")
            .execute()
        )
        if active_membership.data:
            service_client.table("family_join_requests").update({"status": "rejected"}).eq("id", request_id).execute()
            raise HTTPException(status_code=400, detail="User is already in another active family")

        now_str = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        service_client.table("family_join_requests").update({
            "status": "approved",
            "responded_at": now_str,
        }).eq("id", request_id).execute()

        # Add to active members
        service_client.table("family_members").insert({
            "family_id": req_data["family_id"],
            "user_id": req_data["requester_user_id"],
            "role": "member",
            "status": "active",
        }).execute()

        # Notify requester (bell notification)
        _insert_in_app_notification(
            service_client,
            user_id=req_data["requester_user_id"],
            actor_user_id=user.id,
            type_="family_join_approved",
            title="Family request approved",
            message=f"You have joined \"{family['family_name']}\". Welcome!",
            metadata={
                "family_id": family["id"],
                "family_name": family["family_name"],
                "request_id": request_id,
                "approved_by": user.id,
            },
        )

        return {"detail": "Request approved", "family_id": family["id"]}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving join request: {e}")
        raise HTTPException(status_code=500, detail="Database error")


@router.post("/join-requests/{request_id}/reject")
def reject_join_request(request_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        req = service_client.table("family_join_requests").select("*").eq("id", request_id).execute()
        if not req.data:
            raise HTTPException(status_code=404, detail="Join request not found")

        req_data = req.data[0]
        if req_data["status"] != "pending":
            raise HTTPException(status_code=400, detail="Request is not pending")

        family_res = service_client.table("families").select("*").eq("id", req_data["family_id"]).execute()
        if not family_res.data:
            raise HTTPException(status_code=404, detail="Family not found")
        family = family_res.data[0]

        if family["host_user_id"] != user.id:
            raise HTTPException(status_code=403, detail="Only the family owner can reject requests")

        now_str = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        service_client.table("family_join_requests").update({
            "status": "rejected",
            "responded_at": now_str,
        }).eq("id", request_id).execute()

        # Notify requester (bell notification)
        _insert_in_app_notification(
            service_client,
            user_id=req_data["requester_user_id"],
            actor_user_id=user.id,
            type_="family_join_rejected",
            title="Family request rejected",
            message=f"Your request to join \"{family['family_name']}\" was not approved.",
            metadata={
                "family_id": family["id"],
                "family_name": family["family_name"],
                "request_id": request_id,
                "rejected_by": user.id,
            },
        )

        return {"detail": "Request rejected"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting join request: {e}")
        raise HTTPException(status_code=500, detail="Database error")


# -----------------------------------------------------------------------
# DYNAMIC (/{family_id}) ROUTES — must come after all static routes
# -----------------------------------------------------------------------

@router.get("/{family_id}", response_model=FamilyResponse)
def get_family(family_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        membership = (
            service_client.table("family_members")
            .select("id")
            .eq("family_id", family_id)
            .eq("user_id", user.id)
            .eq("status", "active")
            .execute()
        )
        if not membership.data:
            raise HTTPException(status_code=403, detail="Not an active member of this family")

        family = service_client.table("families").select("*").eq("id", family_id).execute()
        if not family.data:
            raise HTTPException(status_code=404, detail="Family not found")
        return family.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching family: {e}")
        raise HTTPException(status_code=500, detail="Database error")


@router.patch("/{family_id}", response_model=FamilyResponse)
def rename_family(family_id: str, rename_in: FamilyRename, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        family = service_client.table("families").select("*").eq("id", family_id).execute()
        if not family.data:
            raise HTTPException(status_code=404, detail="Family not found")
        if family.data[0]["host_user_id"] != user.id:
            raise HTTPException(status_code=403, detail="Only host can rename family")

        updated = service_client.table("families").update({"family_name": rename_in.family_name}).eq("id", family_id).execute()
        return updated.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error renaming family: {e}")
        raise HTTPException(status_code=500, detail="Database error")


@router.delete("/{family_id}")
def delete_family(family_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        family = service_client.table("families").select("*").eq("id", family_id).execute()
        if not family.data:
            raise HTTPException(status_code=404, detail="Family not found")
        if family.data[0]["host_user_id"] != user.id:
            raise HTTPException(status_code=403, detail="Only host can delete family")

        service_client.table("families").delete().eq("id", family_id).execute()
        return {"detail": "Family deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting family: {e}")
        raise HTTPException(status_code=500, detail="Database error")


@router.get("/{family_id}/members")
def get_family_members(family_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        membership = (
            service_client.table("family_members")
            .select("id")
            .eq("family_id", family_id)
            .eq("user_id", user.id)
            .eq("status", "active")
            .execute()
        )
        if not membership.data:
            raise HTTPException(status_code=403, detail="Not an active member of this family")

        members = (
            service_client.table("family_members")
            .select("*, profiles:user_id(id, email, phone, full_name)")
            .eq("family_id", family_id)
            .eq("status", "active")
            .execute()
        )
        return members.data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching family members: {e}")
        raise HTTPException(status_code=500, detail="Database error")


@router.get("/{family_id}/join-requests")
def get_family_join_requests(family_id: str, auth_data: dict = Depends(get_current_user)):
    """Owner/admin can list pending join requests for their family."""
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        family = service_client.table("families").select("host_user_id").eq("id", family_id).execute()
        if not family.data:
            raise HTTPException(status_code=404, detail="Family not found")
        if family.data[0]["host_user_id"] != user.id:
            raise HTTPException(status_code=403, detail="Only the family owner can view join requests")

        reqs = (
            service_client.table("family_join_requests")
            .select("*, profiles:requester_user_id(id, email, full_name)")
            .eq("family_id", family_id)
            .eq("status", "pending")
            .order("created_at", desc=False)
            .execute()
        )
        return reqs.data or []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching join requests: {e}")
        raise HTTPException(status_code=500, detail="Database error")


@router.get("/{family_id}/dashboard")
def get_family_dashboard(family_id: str, auth_data: dict = Depends(get_current_user)):
    """Returns members with their active SOS alerts and active safe windows."""
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        membership = (
            service_client.table("family_members")
            .select("id")
            .eq("family_id", family_id)
            .eq("user_id", user.id)
            .eq("status", "active")
            .execute()
        )
        if not membership.data:
            raise HTTPException(status_code=403, detail="Not an active member of this family")

        members_res = (
            service_client.table("family_members")
            .select("user_id, profiles:user_id(id, email, full_name)")
            .eq("family_id", family_id)
            .eq("status", "active")
            .execute()
        )
        member_ids = [m["user_id"] for m in members_res.data]

        sos_res = (
            service_client.table("sos_alerts")
            .select("*")
            .in_("user_id", member_ids)
            .eq("status", "ACTIVE")
            .execute()
        )

        journeys_res = (
            service_client.table("safe_windows")
            .select("*")
            .in_("user_id", member_ids)
            .eq("status", "active")
            .execute()
        )

        return {
            "members": members_res.data,
            "active_sos": sos_res.data,
            "active_journeys": journeys_res.data,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching family dashboard: {e}")
        raise HTTPException(status_code=500, detail="Database error")


@router.post("/{family_id}/leave")
def leave_family(family_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        membership = (
            service_client.table("family_members")
            .select("*")
            .eq("family_id", family_id)
            .eq("user_id", user.id)
            .eq("status", "active")
            .execute()
        )
        if not membership.data:
            raise HTTPException(status_code=400, detail="Not an active member")

        if membership.data[0]["role"] == "host":
            raise HTTPException(
                status_code=400,
                detail="Host cannot leave family. Delete family or transfer host role first.",
            )

        service_client.table("family_members").update({"status": "left"}).eq("id", membership.data[0]["id"]).execute()
        return {"detail": "Left family successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error leaving family: {e}")
        raise HTTPException(status_code=500, detail="Database error")


@router.post("/{family_id}/regenerate-pin", response_model=FamilyResponse)
def regenerate_pin(family_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        family = service_client.table("families").select("*").eq("id", family_id).execute()
        if not family.data:
            raise HTTPException(status_code=404, detail="Family not found")
        if family.data[0]["host_user_id"] != user.id:
            raise HTTPException(status_code=403, detail="Only host can regenerate PIN")

        max_attempts = 5
        for attempt in range(max_attempts):
            new_pin = generate_pin()
            try:
                updated = service_client.table("families").update({"family_pin": new_pin}).eq("id", family_id).execute()
                return updated.data[0]
            except Exception as e:
                err_str = str(e)
                if "duplicate key value violates unique constraint" in err_str or "23505" in err_str:
                    continue
                else:
                    raise e

        raise HTTPException(status_code=500, detail="Failed to generate unique PIN. Please try again.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error regenerating PIN: {e}")
        raise HTTPException(status_code=500, detail="Database error")


@router.delete("/{family_id}/members/{member_id}")
def remove_member(family_id: str, member_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        family = service_client.table("families").select("*").eq("id", family_id).execute()
        if not family.data:
            raise HTTPException(status_code=404, detail="Family not found")
        if family.data[0]["host_user_id"] != user.id:
            raise HTTPException(status_code=403, detail="Only host can remove members")

        membership = (
            service_client.table("family_members")
            .select("*")
            .eq("id", member_id)
            .eq("family_id", family_id)
            .eq("status", "active")
            .execute()
        )
        if not membership.data:
            raise HTTPException(status_code=404, detail="Active member not found")

        if membership.data[0]["user_id"] == user.id:
            raise HTTPException(status_code=400, detail="Host cannot remove themselves")

        service_client.table("family_members").update({"status": "removed"}).eq("id", member_id).execute()
        return {"detail": "Member removed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing member: {e}")
        raise HTTPException(status_code=500, detail="Database error")
