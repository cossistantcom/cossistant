import * as React from "react";
import type { VoiceStatus } from "./types";

interface VoiceOrbProps {
  status: VoiceStatus;
  levels?: number[];
  size?: number;
  className?: string;
  onClick?: () => void;
}

const STATUS_COLORS: Record<
  VoiceStatus,
  { primary: string; secondary: string }
> = {
  idle: { primary: "#6B7280", secondary: "#9CA3AF" },
  connecting: { primary: "#3B82F6", secondary: "#60A5FA" },
  listening: { primary: "#10B981", secondary: "#34D399" },
  processing: { primary: "#F59E0B", secondary: "#FBBF24" },
  speaking: { primary: "#8B5CF6", secondary: "#A78BFA" },
  error: { primary: "#EF4444", secondary: "#F87171" },
};

export function VoiceOrb({
  status,
  levels = [],
  size = 120,
  className = "",
  onClick,
}: VoiceOrbProps) {
  const colors = STATUS_COLORS[status];
  const avgLevel =
    levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
  const scale = 1 + avgLevel * 0.3;
  const isActive = status !== "idle" && status !== "error";

  const statusEmoji = {
    idle: "🎙️",
    listening: "🎤",
    speaking: "🔊",
    processing: "⏳",
    connecting: "📡",
    error: "⚠️",
  }[status];

  return (
    <button
      type="button"
      aria-label={`Voice: ${status}`}
      aria-pressed={isActive}
      onClick={onClick}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: "none",
        cursor: "pointer",
        position: "relative",
        background: `conic-gradient(from 0deg, ${colors.primary}, ${colors.secondary}, ${colors.primary})`,
        transform: `scale(${scale})`,
        transition: "transform 0.1s ease-out",
        boxShadow: isActive
          ? `0 0 ${20 + avgLevel * 40}px ${colors.primary}40`
          : "0 0 10px rgba(0,0,0,0.1)",
        animation:
          status === "connecting"
            ? "pulse 1.5s ease-in-out infinite"
            : undefined,
      }}
    >
      {/* Inner circle */}
      <div
        style={{
          position: "absolute",
          inset: size * 0.15,
          borderRadius: "50%",
          background: isActive
            ? `radial-gradient(circle, ${colors.secondary}30, ${colors.primary}60)`
            : "rgba(255,255,255,0.1)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Ring layers driven by audio levels */}
      {isActive &&
        levels.slice(0, 3).map((level, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: -(8 + i * 6) - level * 12,
              borderRadius: "50%",
              border: `1.5px solid ${colors.primary}${Math.round(
                30 + level * 40,
              )
                .toString(16)
                .padStart(2, "0")}`,
              transition: "inset 0.08s ease-out",
              pointerEvents: "none",
            }}
          />
        ))}

      {/* Status icon */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: size * 0.25,
        }}
      >
        <span aria-hidden="true">{statusEmoji}</span>
      </div>
    </button>
  );
}
