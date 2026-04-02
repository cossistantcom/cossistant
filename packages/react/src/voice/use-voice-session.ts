import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceSessionConfig, VoiceStatus } from "./types";

export function useVoiceSession(config: VoiceSessionConfig) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const stoppingRef = useRef(false);

  const updateStatus = useCallback(
    (newStatus: VoiceStatus) => {
      setStatus(newStatus);
      config.onStatusChange?.(newStatus);
    },
    [config.onStatusChange],
  );

  const playAudio = useCallback(async (blob: Blob) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer =
        await audioContextRef.current.decodeAudioData(arrayBuffer);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.start();
    } catch {
      // Silently handle audio decode errors
    }
  }, []);

  const startRecording = useCallback(
    async (ws: WebSocket) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        const recorder = new MediaRecorder(stream, {
          mimeType: "audio/webm;codecs=opus",
        });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (
            e.data.size > 0 &&
            ws.readyState === WebSocket.OPEN &&
            !stoppingRef.current
          ) {
            ws.send(e.data);
          }
        };

        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
        };

        recorder.start(250); // Send chunks every 250ms
      } catch {
        config.onError?.(new Error("Microphone access denied"));
        updateStatus("error");
      }
    },
    [config.onError, updateStatus],
  );

  const start = useCallback(async () => {
    if (stoppingRef.current) return;
    try {
      updateStatus("connecting");

      // Create session via REST
      const resp = await fetch(`${config.apiUrl}/voice/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitor_id: config.visitorId || "",
          conversation_history: config.conversationHistory || [],
        }),
      });
      const session = await resp.json();

      // Connect WebSocket
      const wsUrl =
        config.apiUrl.replace(/^http/, "ws") +
        `/voice/stream/${session.session_id}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({ type: "init", history: config.conversationHistory }),
        );
        startRecording(ws);
      };

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          const msg = JSON.parse(event.data);
          if (msg.type === "transcript") {
            setTranscript(msg.content);
            config.onTranscript?.(msg.role, msg.content);
            if (msg.role === "assistant") {
              updateStatus("speaking");
            }
          } else if (msg.type === "audio_end") {
            updateStatus("listening");
          } else if (msg.type === "session_started") {
            updateStatus("listening");
          }
        } else if (event.data instanceof Blob) {
          // Audio data from TTS — play it
          playAudio(event.data);
        }
      };

      ws.onerror = () => {
        updateStatus("error");
        config.onError?.(new Error("Voice WebSocket error"));
      };

      ws.onclose = () => {
        if (!stoppingRef.current) {
          updateStatus("idle");
        }
      };
    } catch (err) {
      updateStatus("error");
      config.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [config, updateStatus, startRecording, playAudio]);

  const stop = useCallback(() => {
    stoppingRef.current = true;

    // Stop media recorder
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: "end" }));
      wsRef.current.close();
      wsRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    updateStatus("idle");
    stoppingRef.current = false;
  }, [updateStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { status, transcript, start, stop };
}
