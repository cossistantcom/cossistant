"""Direct WebSocket voice pipeline: audio in → STT → orchestrator → TTS → audio out."""

import base64
import binascii
import json
import logging
import time

import httpx
from fastapi import WebSocket

from ..config import Settings
from ..session import VoiceSession

logger = logging.getLogger(__name__)

# Shared client — created once, reused across all requests
_http_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=8.0)
    return _http_client


async def close_http_client() -> None:
    global _http_client
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None


def _parse_ws_message(text: str) -> dict | None:
    """
    Parse and validate incoming WebSocket JSON message.

    Accepted schemas:
      {"type": "audio", "data": "<base64>"}
      {"type": "init",  "history": [...]}
      {"type": "end"}
    Returns None on validation failure (caller should close connection).
    """
    try:
        msg = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("WS message is not valid JSON")
        return None

    if not isinstance(msg, dict):
        logger.warning("WS message is not a JSON object")
        return None

    msg_type = msg.get("type")
    if msg_type not in ("audio", "init", "end"):
        logger.warning("Unknown WS message type: %r", msg_type)
        return None

    if msg_type == "audio":
        data = msg.get("data")
        if not isinstance(data, str) or not data:
            logger.warning("WS audio message missing or invalid 'data' field")
            return None
        try:
            base64.b64decode(data, validate=True)
        except (binascii.Error, ValueError):
            logger.warning("WS audio message 'data' is not valid base64")
            return None

    if msg_type == "init":
        history = msg.get("history")
        if history is not None and not isinstance(history, list):
            logger.warning("WS init message 'history' must be a list")
            return None

    return msg


class DirectVoicePipeline:
    """Handles bidirectional audio streaming over WebSocket."""

    def __init__(self, session: VoiceSession, settings: Settings):
        self.session = session
        self.settings = settings
        self._max_duration = settings.max_voice_duration_seconds

    async def run(self, websocket: WebSocket) -> None:
        """Main pipeline loop."""
        start_time = time.time()

        await websocket.send_json({
            "type": "session_started",
            "session_id": self.session.id,
        })

        try:
            while True:
                elapsed = time.time() - start_time
                if elapsed >= self._max_duration:
                    logger.info(
                        "Session %s exceeded max duration (%ds), closing",
                        self.session.id,
                        self._max_duration,
                    )
                    await websocket.send_json({
                        "type": "error",
                        "code": "max_duration_exceeded",
                        "message": "Maximum voice session duration reached.",
                    })
                    await websocket.close(code=1000, reason="Max duration exceeded")
                    break

                data = await websocket.receive()

                if "bytes" in data:
                    transcript = await self._process_audio(data["bytes"])
                    if transcript:
                        self.session.add_turn("visitor", transcript)
                        await websocket.send_json({
                            "type": "transcript",
                            "role": "visitor",
                            "content": transcript,
                        })

                        response = await self._get_response(transcript)
                        self.session.add_turn("assistant", response)

                        await websocket.send_json({
                            "type": "transcript",
                            "role": "assistant",
                            "content": response,
                        })

                        audio_chunks = await self._synthesize_speech(response)
                        for chunk in audio_chunks:
                            await websocket.send_bytes(chunk)

                        await websocket.send_json({"type": "audio_end"})

                elif "text" in data:
                    msg = _parse_ws_message(data["text"])
                    if msg is None:
                        await websocket.send_json({
                            "type": "error",
                            "code": "invalid_message",
                            "message": "Invalid message format.",
                        })
                        continue

                    if msg["type"] == "end":
                        logger.info("Session %s ended by client", self.session.id)
                        break
                    elif msg["type"] == "init":
                        history = msg.get("history") or []
                        self.session.conversation_history = history[-20:]
                        logger.debug("Session %s history seeded (%d msgs)", self.session.id, len(history))
                    elif msg["type"] == "audio":
                        audio_bytes = base64.b64decode(msg["data"])
                        transcript = await self._process_audio(audio_bytes)
                        if transcript:
                            self.session.add_turn("visitor", transcript)
                            await websocket.send_json({
                                "type": "transcript",
                                "role": "visitor",
                                "content": transcript,
                            })

                            response = await self._get_response(transcript)
                            self.session.add_turn("assistant", response)

                            await websocket.send_json({
                                "type": "transcript",
                                "role": "assistant",
                                "content": response,
                            })

                            audio_chunks = await self._synthesize_speech(response)
                            for chunk in audio_chunks:
                                await websocket.send_bytes(chunk)

                            await websocket.send_json({"type": "audio_end"})

        except Exception:
            logger.exception("Unhandled error in pipeline for session %s", self.session.id)

    async def _process_audio(self, audio_bytes: bytes) -> str | None:
        """Send audio to Deepgram STT, return transcript."""
        if not self.settings.deepgram_api_key:
            return None

        try:
            from ..stt.deepgram import transcribe_audio
            return await transcribe_audio(
                audio_bytes,
                api_key=self.settings.deepgram_api_key,
            )
        except Exception:
            logger.exception("STT error for session %s", self.session.id)
            return None

    async def _get_response(self, query: str) -> str:
        """Call main API for AI response."""
        client = get_http_client()
        try:
            resp = await client.post(
                f"{self.settings.main_api_url}/v1/voice/query",
                json={
                    "query": query,
                    "session_id": self.session.id,
                    "visitor_id": self.session.visitor_id,
                    "conversation_history": [
                        {"role": t.role, "content": t.content}
                        for t in self.session.turns[-10:]
                    ],
                },
            )
            resp.raise_for_status()
            return resp.json().get("response", "I'm sorry, I didn't catch that.")
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Main API returned %d for session %s",
                exc.response.status_code,
                self.session.id,
            )
            return "I'm having trouble connecting right now. Please try again in a moment."
        except Exception:
            logger.exception("Main API request failed for session %s", self.session.id)
            return "I'm having trouble connecting right now. Please try again in a moment."

    async def _synthesize_speech(self, text: str) -> list[bytes]:
        """Convert text to speech via Cartesia."""
        if not self.settings.cartesia_api_key:
            return []

        try:
            from ..tts.cartesia import synthesize
            return await synthesize(
                text,
                api_key=self.settings.cartesia_api_key,
                voice_id=self.settings.cartesia_voice_id,
            )
        except Exception:
            logger.exception("TTS error for session %s", self.session.id)
            return []
