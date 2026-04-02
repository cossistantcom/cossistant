"""Voice Sidecar — Deepgram STT + Cartesia TTS + Daily.co WebRTC"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .session import SessionManager

session_manager = SessionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await session_manager.cleanup()


app = FastAPI(title="Plasma Voice Sidecar", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "voice-sidecar",
        "deepgram_configured": bool(settings.deepgram_api_key),
        "cartesia_configured": bool(settings.cartesia_api_key),
        "daily_configured": bool(settings.daily_api_key),
    }


@app.post("/voice/sessions")
async def create_voice_session(
    visitor_id: str = "",
    conversation_history: list[dict] | None = None,
):
    """Create a new voice session, returns session_id for WS connection."""
    session = await session_manager.create_session(
        visitor_id=visitor_id,
        conversation_history=conversation_history or [],
    )
    return {
        "session_id": session.id,
        "ws_url": f"/voice/stream/{session.id}",
    }


@app.get("/voice/sessions/{session_id}")
async def get_voice_session(session_id: str):
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id": session.id,
        "status": session.status,
        "created_at": session.created_at,
        "turns": len(session.turns),
    }


@app.delete("/voice/sessions/{session_id}")
async def end_voice_session(session_id: str):
    await session_manager.end_session(session_id)
    return {"status": "ended"}


@app.websocket("/voice/stream/{session_id}")
async def voice_stream(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for voice streaming (audio in, audio out)."""
    session = session_manager.get_session(session_id)
    if not session:
        await websocket.close(code=4004, reason="Session not found")
        return

    await websocket.accept()
    session.status = "connected"

    try:
        from .pipeline.direct import DirectVoicePipeline
        pipeline = DirectVoicePipeline(session=session, settings=settings)
        await pipeline.run(websocket)
    except WebSocketDisconnect:
        pass
    finally:
        session.status = "disconnected"


@app.post("/webrtc/sessions")
async def create_webrtc_session(visitor_id: str = ""):
    """Create a Daily.co WebRTC room for voice."""
    if not settings.daily_api_key:
        raise HTTPException(status_code=503, detail="Daily.co not configured")

    from .daily_client import create_daily_room
    room = await create_daily_room(settings.daily_api_key)

    session = await session_manager.create_session(
        visitor_id=visitor_id,
        conversation_history=[],
        channel="webrtc",
    )

    return {
        "session_id": session.id,
        "room_url": room["url"],
        "room_name": room["name"],
        "token": room.get("token"),
    }
