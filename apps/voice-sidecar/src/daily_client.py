"""Daily.co WebRTC room management."""

import httpx


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
                    "exp": 3600,  # 1 hour expiry
                },
            },
        )
        resp.raise_for_status()
        room = resp.json()

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
                    "exp": 3600,
                },
            },
        )
        resp.raise_for_status()
        return resp.json()["token"]
