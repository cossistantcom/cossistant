"""Voice Sidecar — Deepgram STT + Cartesia TTS + Daily.co WebRTC"""

import logging
from contextlib import asynccontextmanager
from urllib.parse import quote

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from .config import settings
from .session import SessionManager, issue_session_token, validate_session_token

logger = logging.getLogger(__name__)

session_manager = SessionManager()
_bearer = HTTPBearer(auto_error=False)


class VoiceSessionCreateRequest(BaseModel):
    visitor_id: str = ""
    website_id: str = ""
    organization_id: str = ""
    conversation_history: list[dict] = Field(default_factory=list)


class WebRtcSessionCreateRequest(BaseModel):
    visitor_id: str = ""
    website_id: str = ""
    organization_id: str = ""


def _require_api_key(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    if not settings.voice_api_key:
        raise HTTPException(status_code=503, detail="Voice auth not configured")
    if credentials is None or credentials.credentials != settings.voice_api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


def _build_ws_url(session_id: str) -> str:
    base_url = settings.voice_public_base_url.rstrip("/")
    if base_url.startswith("https://"):
        base_url = f"wss://{base_url.removeprefix('https://')}"
    elif base_url.startswith("http://"):
        base_url = f"ws://{base_url.removeprefix('http://')}"

    token = issue_session_token(
        session_id=session_id,
        secret=settings.voice_api_key,
        ttl_seconds=settings.session_ttl_seconds,
    )
    return f"{base_url}/voice/stream/{session_id}?token={quote(token)}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await session_manager.start_cleanup_loop(ttl_seconds=settings.session_ttl_seconds)
    logger.info("Voice sidecar started")
    yield
    await session_manager.cleanup(ttl_seconds=0)  # Clean all on shutdown
    logger.info("Voice sidecar stopped")


app = FastAPI(title="Plasma Voice Sidecar", lifespan=lifespan)

_origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "voice-sidecar",
        "auth_configured": bool(settings.voice_api_key),
        "deepgram_configured": bool(settings.deepgram_api_key),
        "cartesia_configured": bool(settings.cartesia_api_key),
        "daily_configured": bool(settings.daily_api_key),
        "active_sessions": len(session_manager._sessions),
    }


@app.post("/voice/sessions", dependencies=[Depends(_require_api_key)])
async def create_voice_session(
    payload: VoiceSessionCreateRequest,
):
    """Create a new voice session, returns session_id for WS connection."""
    session = await session_manager.create_session(
        visitor_id=payload.visitor_id,
        website_id=payload.website_id,
        organization_id=payload.organization_id,
        conversation_history=payload.conversation_history,
        max_sessions=settings.max_concurrent_sessions,
    )
    return {
        "session_id": session.id,
        "ws_url": _build_ws_url(session.id),
    }


@app.get("/voice/sessions/{session_id}", dependencies=[Depends(_require_api_key)])
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


@app.delete("/voice/sessions/{session_id}", dependencies=[Depends(_require_api_key)])
async def end_voice_session(session_id: str):
    await session_manager.end_session(session_id)
    return {"status": "ended"}


@app.websocket("/voice/stream/{session_id}")
async def voice_stream(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for voice streaming (audio in, audio out)."""
    if not settings.voice_api_key:
        await websocket.close(code=1013, reason="Voice auth not configured")
        return

    token = websocket.query_params.get("token")
    if not validate_session_token(
        token=token,
        session_id=session_id,
        secret=settings.voice_api_key,
    ):
        await websocket.close(code=4401, reason="Unauthorized")
        return

    session = session_manager.get_session(session_id)
    if not session:
        await websocket.close(code=4004, reason="Session not found")
        return

    await websocket.accept()
    session.status = "connected"
    logger.info("WebSocket connected for session %s", session_id)

    try:
        from .pipeline.direct import DirectVoicePipeline
        pipeline = DirectVoicePipeline(session=session, settings=settings)
        await pipeline.run(websocket)
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for session %s", session_id)
    except Exception:
        logger.exception("Unexpected error in voice_stream for session %s", session_id)
    finally:
        session.status = "disconnected"


@app.post("/webrtc/sessions", dependencies=[Depends(_require_api_key)])
async def create_webrtc_session(payload: WebRtcSessionCreateRequest):
    """Create a Daily.co WebRTC room for voice."""
    if not settings.daily_api_key:
        raise HTTPException(status_code=503, detail="Daily.co not configured")

    from .daily_client import create_daily_room
    room = await create_daily_room(settings.daily_api_key)

    session = await session_manager.create_session(
        visitor_id=payload.visitor_id,
        website_id=payload.website_id,
        organization_id=payload.organization_id,
        conversation_history=[],
        channel="webrtc",
        max_sessions=settings.max_concurrent_sessions,
    )

    return {
        "session_id": session.id,
        "room_url": room["url"],
        "room_name": room["name"],
        "token": room.get("token"),
    }
