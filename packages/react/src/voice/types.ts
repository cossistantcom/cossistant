export type VoiceStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

export interface VoiceSessionConfig {
  apiUrl: string;
  publicKey?: string;
  sessionId?: string;
  visitorId?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  onTranscript?: (role: string, content: string) => void;
  onStatusChange?: (status: VoiceStatus) => void;
  onError?: (error: Error) => void;
}
