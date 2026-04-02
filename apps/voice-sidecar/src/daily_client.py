"""Daily.co WebRTC room management."""

import logging
import time

import httpx

logger = logging.getLogger(__name__)


async def create_daily_room(api_key: str) -> dict:
    """Create a Daily.co room for WebRTC voice session."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            "https://api.daily.co/v1/rooms",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "properties": {
                    "max_participants": 2,
                    "enable_chat": False,
                    "enable_screenshare": False,
                    "exp": int(time.time()) + 3600,  # epoch timestamp, 1 hour from now
                },
            },
        )
        resp.raise_for_status()
        room = resp.json()
        logger.info("Created Daily.co room: %s", room["name"])

    token = await _create_token(api_key, room["name"])

    return {
        "url": room["url"],
        "name": room["name"],
        "token": token,
    }


async def _create_token(api_key: str, room_name: str) -> str:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            "https://api.daily.co/v1/meeting-tokens",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "properties": {
                    "room_name": room_name,
                    "is_owner": False,
                    "exp": int(time.time()) + 3600,  # epoch timestamp, 1 hour from now
                },
            },
        )
        resp.raise_for_status()
        return resp.json()["token"]
