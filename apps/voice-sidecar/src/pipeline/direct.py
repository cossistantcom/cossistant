"""Direct WebSocket voice pipeline: audio in → STT → orchestrator → TTS → audio out."""

import json

from fastapi import WebSocket

from ..config import Settings
from ..session import VoiceSession


class DirectVoicePipeline:
    """Handles bidirectional audio streaming over WebSocket."""

    def __init__(self, session: VoiceSession, settings: Settings):
        self.session = session
        self.settings = settings

    async def run(self, websocket: WebSocket) -> None:
        """Main pipeline loop."""
        await websocket.send_json({
            "type": "session_started",
            "session_id": self.session.id,
        })

        try:
            while True:
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
                    msg = json.loads(data["text"])
                    if msg.get("type") == "end":
                        break
                    elif msg.get("type") == "init":
                        if "history" in msg:
                            self.session.conversation_history = msg["history"][-20:]

        except Exception:
            pass  # WebSocket disconnect handled by caller

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
            return None

    async def _get_response(self, query: str) -> str:
        """Call main API for AI response."""
        import httpx

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
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
        except Exception:
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
            return []
