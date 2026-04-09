import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceSessionConfig, VoiceStatus } from "./types";

export function useVoiceSession(config: VoiceSessionConfig) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const stoppingRef = useRef(false);
  const statusRef = useRef<VoiceStatus>("idle");

  const updateStatus = useCallback(
    (newStatus: VoiceStatus) => {
      statusRef.current = newStatus;
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
        streamRef.current = stream;
        const mimeType =
          ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find(
            (t) => MediaRecorder.isTypeSupported(t),
          ) ?? "";
        const recorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : {},
        );
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
    if (wsRef.current || statusRef.current !== "idle") return;
    if (stoppingRef.current) return;
    try {
      updateStatus("connecting");

      // Create session via REST
      const resp = await fetch(`${config.apiUrl}/voice/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.publicKey ? { "X-Public-Key": config.publicKey } : {}),
        },
        body: JSON.stringify({
          visitor_id: config.visitorId || "",
          conversation_history: config.conversationHistory || [],
        }),
      });
      if (!resp.ok) {
        throw new Error(`Voice session creation failed: ${resp.status}`);
      }
      const session = await resp.json();

      // Connect WebSocket
      const base = new URL(config.apiUrl);
      const wsUrl = new URL(
        session.ws_url ?? `/voice/stream/${session.session_id}`,
        `${base.protocol}//${base.host}`,
      ).toString();
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
          let msg;
          try {
            msg = JSON.parse(event.data);
          } catch {
            console.warn("Invalid JSON from voice WS:", event.data);
            return;
          }
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

    // Stop media recorder and release mic tracks directly (don't rely on onstop)
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    // Close WebSocket
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: "end" }));
        } catch {}
      }
      wsRef.current.close();
      wsRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Null all refs before resetting stopping flag to block re-entry during teardown
    stoppingRef.current = false;
    updateStatus("idle");
  }, [updateStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { status, transcript, start, stop };
}
