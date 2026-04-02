"""Deepgram STT integration."""

import httpx


async def transcribe_audio(audio_bytes: bytes, api_key: str) -> str | None:
    """Send audio bytes to Deepgram for transcription."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            "https://api.deepgram.com/v1/listen",
            headers={
                "Authorization": f"Token {api_key}",
                "Content-Type": "audio/webm",
            },
            params={
                "model": "nova-3",
                "language": "en",
                "smart_format": "true",
                "endpointing": "300",
            },
            content=audio_bytes,
        )
        resp.raise_for_status()
        data = resp.json()

    channels = data.get("results", {}).get("channels", [])
    if not channels:
        return None

    alternatives = channels[0].get("alternatives", [])
    if not alternatives:
        return None

    transcript = alternatives[0].get("transcript", "").strip()
    return transcript if transcript else None
