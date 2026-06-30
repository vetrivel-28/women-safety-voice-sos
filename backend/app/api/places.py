import os
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/places", tags=["places"])

@router.get("/autocomplete")
async def autocomplete_places(
    input: str = Query(..., min_length=3),
    sessiontoken: str = Query(None),
    auth_data: dict = Depends(get_current_user)
):
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        logger.error("GOOGLE_MAPS_API_KEY not configured")
        raise HTTPException(status_code=500, detail="Google Maps API key not configured")

    url = "https://maps.googleapis.com/maps/api/place/autocomplete/json"
    params = {
        "input": input,
        "key": api_key
    }
    if sessiontoken:
        params["sessiontoken"] = sessiontoken

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            if data.get("status") not in ("OK", "ZERO_RESULTS"):
                logger.error(f"Google Places API error: {data.get('status')} - {data.get('error_message')}")
                raise HTTPException(status_code=502, detail="Error fetching places from upstream provider")
            return data
        except httpx.RequestError as e:
            logger.error(f"HTTP error requesting Google Places API: {e}")
            raise HTTPException(status_code=502, detail="Error connecting to upstream provider")

@router.get("/details")
async def place_details(
    place_id: str = Query(...),
    sessiontoken: str = Query(None),
    auth_data: dict = Depends(get_current_user)
):
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Google Maps API key not configured")

    url = "https://maps.googleapis.com/maps/api/place/details/json"
    params = {
        "place_id": place_id,
        "fields": "formatted_address,geometry",
        "key": api_key
    }
    if sessiontoken:
        params["sessiontoken"] = sessiontoken

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            if data.get("status") != "OK":
                logger.error(f"Google Places Details API error: {data.get('status')} - {data.get('error_message')}")
                raise HTTPException(status_code=502, detail="Error fetching place details")
            
            result = data.get("result", {})
            location = result.get("geometry", {}).get("location", {})
            return {
                "place_id": place_id,
                "formatted_address": result.get("formatted_address"),
                "latitude": location.get("lat"),
                "longitude": location.get("lng")
            }
        except httpx.RequestError as e:
            logger.error(f"HTTP error requesting Google Places API: {e}")
            raise HTTPException(status_code=502, detail="Error connecting to upstream provider")
