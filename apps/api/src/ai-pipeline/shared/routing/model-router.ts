import type {
  ComplexityLevel,
  RouteDecision,
  TieredRoutingConfig,
} from "./types";

// Signals that indicate higher complexity
const COMPLEX_SIGNALS = [
  /multi[-\s]?step/i,
  /compare/i,
  /analyze/i,
  /explain.*detail/i,
  /troubleshoot/i,
  /debug/i,
  /complex/i,
  /multiple.*question/i,
];

const SIMPLE_SIGNALS = [
  /^(hi|hello|hey|thanks|ok|yes|no)\b/i,
  /what.*hours/i,
  /where.*located/i,
  /how.*contact/i,
  /password.*reset/i,
  /^faq\b/i,
];

export function classifyComplexity(
  query: string,
  conversationLength: number,
  hasExactMatch: boolean,
): ComplexityLevel {
  // L0 exact match → always simple
  if (hasExactMatch) return "simple";

  // Short greetings/FAQ → simple
  if (query.length < 30 && SIMPLE_SIGNALS.some((r) => r.test(query)))
    return "simple";

  // Multi-turn or complex signals → complex
  if (conversationLength > 6) return "complex";
  if (query.length > 300) return "complex";
  if (COMPLEX_SIGNALS.some((r) => r.test(query))) return "complex";

  // Default → medium
  return "medium";
}

export function routeModel(
  config: TieredRoutingConfig,
  level: ComplexityLevel,
): RouteDecision {
  const tier = config[level];
  return {
    level,
    model: tier.model,
    temperature: tier.temperature,
    maxTokens: tier.maxTokens,
    reasoning: `Classified as ${level} tier`,
  };
}
