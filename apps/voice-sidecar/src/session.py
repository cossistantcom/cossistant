import time
import uuid
from dataclasses import dataclass, field


@dataclass
class VoiceTurn:
    role: str  # "visitor" or "assistant"
    content: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class VoiceSession:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    visitor_id: str = ""
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

    async def create_session(
        self,
        visitor_id: str,
        conversation_history: list[dict],
        channel: str = "websocket",
    ) -> VoiceSession:
        session = VoiceSession(
            visitor_id=visitor_id,
            conversation_history=conversation_history[-20:],  # Cap history
            channel=channel,
        )
        self._sessions[session.id] = session
        return session

    def get_session(self, session_id: str) -> VoiceSession | None:
        return self._sessions.get(session_id)

    async def end_session(self, session_id: str) -> None:
        session = self._sessions.pop(session_id, None)
        if session:
            session.status = "disconnected"

    async def cleanup(self) -> None:
        """Clean up stale sessions (older than max duration)."""
        now = time.time()
        stale = [
            sid
            for sid, s in self._sessions.items()
            if now - s.created_at > 900  # 15 min
        ]
        for sid in stale:
            await self.end_session(sid)
