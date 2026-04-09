import asyncio
import base64
import hashlib
import hmac
import json
import logging
import time
import uuid
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


def _encode_token_bytes(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _decode_token_bytes(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def issue_session_token(*, session_id: str, secret: str, ttl_seconds: int) -> str:
    payload = {
        "sid": session_id,
        "exp": int(time.time()) + ttl_seconds,
    }
    payload_raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    payload_encoded = _encode_token_bytes(payload_raw)
    signature = hmac.new(
        secret.encode(),
        payload_encoded.encode(),
        hashlib.sha256,
    ).digest()
    signature_encoded = _encode_token_bytes(signature)
    return f"{payload_encoded}.{signature_encoded}"


def validate_session_token(
    *, token: str | None, session_id: str, secret: str
) -> bool:
    if not token:
        return False

    try:
        payload_encoded, signature_encoded = token.split(".", 1)
    except ValueError:
        return False

    expected_signature = hmac.new(
        secret.encode(),
        payload_encoded.encode(),
        hashlib.sha256,
    ).digest()

    try:
        received_signature = _decode_token_bytes(signature_encoded)
    except (ValueError, base64.binascii.Error):
        return False

    if not hmac.compare_digest(expected_signature, received_signature):
        return False

    try:
        payload = json.loads(_decode_token_bytes(payload_encoded))
    except (ValueError, json.JSONDecodeError, base64.binascii.Error):
        return False

    if payload.get("sid") != session_id:
        return False

    exp = payload.get("exp")
    if not isinstance(exp, int):
        return False

    return exp >= int(time.time())


@dataclass
class VoiceTurn:
    role: str  # "visitor" or "assistant"
    content: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class VoiceSession:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    visitor_id: str = ""
    website_id: str = ""
    organization_id: str = ""
    status: str = "created"  # created | connected | disconnected
    channel: str = "websocket"  # websocket | webrtc
    turns: list[VoiceTurn] = field(default_factory=list)
    conversation_history: list[dict] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)

    def add_turn(self, role: str, content: str) -> None:
        self.turns.append(VoiceTurn(role=role, content=content))
        # Cap at 20 turns to prevent payload blowup
        if len(self.turns) > 20:
            self.turns = self.turns[-20:]


class SessionManager:
    def __init__(self):
        self._sessions: dict[str, VoiceSession] = {}
        self._cleanup_task: asyncio.Task | None = None

    async def start_cleanup_loop(self, ttl_seconds: int = 1800) -> None:
        """Start periodic cleanup task. Store ref to prevent GC."""
        self._cleanup_task = asyncio.create_task(
            self._periodic_cleanup(ttl_seconds)
        )
        self._cleanup_task.add_done_callback(
            lambda t: logger.error("Cleanup loop exited: %s", t.exception()) if t.exception() else None
        )
        logger.info("Session cleanup loop started (TTL=%ds)", ttl_seconds)

    async def _periodic_cleanup(self, ttl_seconds: int) -> None:
        while True:
            await asyncio.sleep(60)
            await self.cleanup(ttl_seconds=ttl_seconds)

    async def create_session(
        self,
        visitor_id: str,
        website_id: str,
        organization_id: str,
        conversation_history: list[dict],
        channel: str = "websocket",
        max_sessions: int = 100,
    ) -> VoiceSession:
        if len(self._sessions) >= max_sessions:
            logger.warning("Session capacity reached (%d/%d)", len(self._sessions), max_sessions)
            from fastapi import HTTPException
            raise HTTPException(status_code=429, detail="Session capacity reached")

        session = VoiceSession(
            visitor_id=visitor_id,
            website_id=website_id,
            organization_id=organization_id,
            conversation_history=conversation_history[-20:],  # Cap history
            channel=channel,
        )
        self._sessions[session.id] = session
        logger.info("Session created: %s visitor=%s channel=%s", session.id, visitor_id, channel)
        return session

    def get_session(self, session_id: str) -> VoiceSession | None:
        return self._sessions.get(session_id)

    async def end_session(self, session_id: str) -> None:
        session = self._sessions.pop(session_id, None)
        if session:
            session.status = "disconnected"
            logger.info("Session ended: %s", session_id)

    async def cleanup(self, ttl_seconds: int = 1800) -> None:
        """Clean up stale sessions older than ttl_seconds."""
        now = time.time()
        stale = [
            sid
            for sid, s in self._sessions.items()
            if now - s.created_at > ttl_seconds
        ]
        for sid in stale:
            logger.info("Cleaning up stale session: %s", sid)
            await self.end_session(sid)
        if stale:
            logger.info("Cleanup removed %d stale sessions", len(stale))
