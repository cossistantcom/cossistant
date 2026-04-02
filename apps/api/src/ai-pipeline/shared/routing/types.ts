export type ComplexityLevel = "simple" | "medium" | "complex";

export interface RouteDecision {
  level: ComplexityLevel;
  model: string;
  temperature: number;
  maxTokens: number;
  reasoning: string;
}

export interface TieredRoutingConfig {
  enabled: boolean;
  simple: { model: string; temperature: number; maxTokens: number };
  medium: { model: string; temperature: number; maxTokens: number };
  complex: { model: string; temperature: number; maxTokens: number };
  groqFastPath?: boolean;
}

export const DEFAULT_TIERED_ROUTING: TieredRoutingConfig = {
  enabled: false,
  simple: { model: "google/gemma-2-9b-it", temperature: 0.3, maxTokens: 512 },
  medium: {
    model: "anthropic/claude-3.5-haiku",
    temperature: 0.5,
    maxTokens: 1024,
  },
  complex: {
    model: "anthropic/claude-sonnet-4",
    temperature: 0.7,
    maxTokens: 2048,
  },
};
