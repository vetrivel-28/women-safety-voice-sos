from fastapi import APIRouter, Depends, HTTPException
from app.db.client import get_service_role_client
from app.api.auth import get_current_user
from app.schemas.profile import ProfileUpdate, ProfileResponse
import logging


logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/api/profile",
    tags=["profile"]
)


# ---------------------------------------------------------
# GET PROFILE
# ---------------------------------------------------------
@router.get("", response_model=ProfileResponse)
async def get_profile(
    user: dict = Depends(get_current_user)
):
    try:
        supabase = get_service_role_client()
        user_id = user["user"].id

        response = (
            supabase
            .table("profiles")
            .select("*")
            .eq("id", user_id)
            .execute()
        )

        rows = response.data or []

        # -------------------------------------------------
        # Create default profile if no row exists
        # -------------------------------------------------
        if not rows:
            default_profile = {
                "id": user_id,
                "user_id": user_id,
                "full_name": "",
                "phone": "",
                "email": user["user"].email or "",
                "blood_group": None,
                "medical_notes": None,
            }

            insert_result = (
                supabase
                .table("profiles")
                .insert(default_profile)
                .execute()
            )

            data = (
                insert_result.data[0]
                if insert_result.data
                else default_profile
            )

        else:
            data = rows[0]

        # -------------------------------------------------
        # Convert database row to API response
        # -------------------------------------------------
        return ProfileResponse(
            user_id=data.get("id") or user_id,
            email=data.get("email") or "",
            full_name=data.get("full_name") or "",
            guardian_code=data.get("guardian_code") or "",
            name=data.get("full_name") or "",
            phone=data.get("phone") or "",
            blood_group=data.get("blood_group") or "",
            medical_notes=data.get("medical_notes") or "",
        )

    except HTTPException:
        raise

    except Exception as e:
        logger.exception(
            "Profile fetch failed for user %s: %s",
            user["user"].id
            if isinstance(user, dict) and user.get("user")
            else "Unknown",
            e,
        )

        raise HTTPException(
            status_code=503,
            detail="Profile service temporarily unavailable"
        )


# ---------------------------------------------------------
# CREATE / UPDATE PROFILE
# ---------------------------------------------------------
@router.post("", response_model=ProfileResponse)
@router.put("", response_model=ProfileResponse)
@router.patch("", response_model=ProfileResponse)
async def update_profile(
    profile_data: ProfileUpdate,
    user: dict = Depends(get_current_user)
):
    try:
        supabase = get_service_role_client()
        user_id = user["user"].id

        # -------------------------------------------------
        # Check whether profile already exists
        # -------------------------------------------------
        existing = (
            supabase
            .table("profiles")
            .select("*")
            .eq("id", user_id)
            .execute()
        )

        existing_row = (
            existing.data[0]
            if existing.data
            else {}
        )

        # -------------------------------------------------
        # Pydantic v2
        # Only fields actually sent by mobile are included
        # -------------------------------------------------
        incoming = profile_data.model_dump(
            exclude_unset=True
        )

        update_data = {}

        # -------------------------------------------------
        # Frontend field -> Database column
        # -------------------------------------------------
        key_mapping = {
            "name": "full_name",
            "phone": "phone",
            "blood_group": "blood_group",
            "medical_notes": "medical_notes",
        }

        for pydantic_key, db_key in key_mapping.items():

            if pydantic_key not in incoming:
                continue

            value = incoming[pydantic_key]

            # Remove accidental spaces
            if isinstance(value, str):
                value = value.strip()

            # ---------------------------------------------
            # Required text fields
            #
            # Do NOT convert empty string to None because
            # database columns may have NOT NULL constraints
            # ---------------------------------------------
            if db_key in {"full_name", "phone"}:
                update_data[db_key] = value or ""

            # ---------------------------------------------
            # Optional fields
            # Empty values may safely become NULL
            # ---------------------------------------------
            else:
                update_data[db_key] = (
                    value
                    if value not in ("", None)
                    else None
                )

        # -------------------------------------------------
        # Nothing changed
        # -------------------------------------------------
        if not update_data and existing_row:
            data = existing_row

        # -------------------------------------------------
        # Update existing profile
        # -------------------------------------------------
        elif existing.data:

            response = (
                supabase
                .table("profiles")
                .update(update_data)
                .eq("id", user_id)
                .execute()
            )

            if not response.data:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to save profile to database"
                )

            data = response.data[0]

        # -------------------------------------------------
        # Create profile if missing
        # -------------------------------------------------
        else:

            insert_dict = {
                **update_data,
                "id": user_id,
                "user_id": user_id,
                "email": user["user"].email or "",
            }

            # Ensure required text fields are never NULL
            insert_dict.setdefault(
                "full_name",
                ""
            )

            insert_dict.setdefault(
                "phone",
                ""
            )

            response = (
                supabase
                .table("profiles")
                .insert(insert_dict)
                .execute()
            )

            if not response.data:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to create profile in database"
                )

            data = response.data[0]

        # -------------------------------------------------
        # Return updated profile
        # -------------------------------------------------
        return ProfileResponse(
            user_id=data.get("id") or user_id,
            email=data.get("email") or "",
            full_name=data.get("full_name") or "",
            guardian_code=data.get("guardian_code") or "",
            name=data.get("full_name") or "",
            phone=data.get("phone") or "",
            blood_group=data.get("blood_group") or "",
            medical_notes=data.get("medical_notes") or "",
        )

    # -----------------------------------------------------
    # Preserve intentional FastAPI errors
    # -----------------------------------------------------
    except HTTPException:
        raise

    # -----------------------------------------------------
    # Unexpected database / Supabase errors
    # -----------------------------------------------------
    except Exception as e:

        logger.exception(
            "Profile update failed for user %s: %s",
            user["user"].id
            if isinstance(user, dict) and user.get("user")
            else "Unknown",
            e,
        )

        raise HTTPException(
            status_code=503,
            detail="Profile service temporarily unavailable"
        )