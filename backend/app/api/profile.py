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
# HELPER: Convert database row to API response
# ---------------------------------------------------------
def build_profile_response(data: dict, user_id: str) -> ProfileResponse:
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

        return build_profile_response(
            data=data,
            user_id=user_id
        )

    except HTTPException:
        raise

    except Exception as e:
        user_id_for_log = (
            user["user"].id
            if isinstance(user, dict) and user.get("user")
            else "Unknown"
        )

        logger.exception(
            "PROFILE_FETCH_ERROR user=%s type=%s message=%s",
            user_id_for_log,
            type(e).__name__,
            str(e),
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

        existing_rows = existing.data or []

        existing_row = (
            existing_rows[0]
            if existing_rows
            else {}
        )

        # -------------------------------------------------
        # Pydantic v2
        # Only fields actually sent by mobile are included
        # -------------------------------------------------
        incoming = profile_data.model_dump(
            exclude_unset=True
        )

        # Safe diagnostic logging.
        # Do not log JWT tokens or authorization headers.
        logger.info(
            "PROFILE_UPDATE_INPUT user=%s fields=%s",
            user_id,
            list(incoming.keys()),
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

            # Remove accidental leading/trailing spaces
            if isinstance(value, str):
                value = value.strip()

            # ---------------------------------------------
            # Required text fields
            # Never convert empty strings to SQL NULL
            # ---------------------------------------------
            if db_key in {"full_name", "phone"}:
                update_data[db_key] = value or ""

            # ---------------------------------------------
            # Optional fields
            # Empty values may become SQL NULL
            # ---------------------------------------------
            else:
                update_data[db_key] = (
                    value
                    if value not in ("", None)
                    else None
                )

        logger.info(
            "PROFILE_UPDATE_PREPARED user=%s columns=%s",
            user_id,
            list(update_data.keys()),
        )

        # -------------------------------------------------
        # Nothing changed
        # -------------------------------------------------
        if not update_data and existing_row:
            data = existing_row

        # -------------------------------------------------
        # Update existing profile
        # -------------------------------------------------
        elif existing_rows:
            logger.info(
                "PROFILE_UPDATE_DB_ACTION user=%s action=update",
                user_id,
            )

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
            logger.info(
                "PROFILE_UPDATE_DB_ACTION user=%s action=insert",
                user_id,
            )

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

        logger.info(
            "PROFILE_UPDATE_SUCCESS user=%s",
            user_id,
        )

        return build_profile_response(
            data=data,
            user_id=user_id
        )

    # -----------------------------------------------------
    # Preserve intentional FastAPI errors
    # -----------------------------------------------------
    except HTTPException:
        raise

    # -----------------------------------------------------
    # TEMPORARY DIAGNOSTIC ERROR HANDLING
    # Shows exact Supabase/PostgreSQL error
    # -----------------------------------------------------
    except Exception as e:
        user_id_for_log = (
            user["user"].id
            if isinstance(user, dict) and user.get("user")
            else "Unknown"
        )

        error_type = type(e).__name__
        error_message = str(e)

        logger.exception(
            "PROFILE_UPDATE_ERROR user=%s type=%s message=%s",
            user_id_for_log,
            error_type,
            error_message,
        )

        # TEMPORARY DEBUG RESPONSE
        # Remove detailed message after diagnosis.
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Profile update failed",
                "type": error_type,
                "message": error_message,
            },
        )