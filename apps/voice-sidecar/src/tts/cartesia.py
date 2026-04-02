"""Cartesia TTS integration."""

import httpx


async def synthesize(
    text: str,
    api_key: str,
    voice_id: str,
    model_id: str = "sonic-2",
) -> list[bytes]:
    """Convert text to speech, return audio chunks."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            "https://api.cartesia.ai/tts/bytes",
            headers={
                "X-API-Key": api_key,
                "Cartesia-Version": "2024-06-10",
                "Content-Type": "application/json",
            },
            json={
                "model_id": model_id,
                "transcript": text,
                "voice": {"mode": "id", "id": voice_id},
                "output_format": {
                    "container": "raw",
                    "encoding": "pcm_s16le",
                    "sample_rate": 24000,
                },
            },
        )
        resp.raise_for_status()
        return [resp.content] if resp.content else []
