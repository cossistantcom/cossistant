// Strip injection patterns from dossier content
const INJECTION_PATTERNS = [
  /\[SYSTEM\]/gi,
  /\[INST\]/gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /<<SYS>>/gi,
  /<\/SYS>/gi,
  /\{\{.*?\}\}/g,
  /\[\[.*?\]\]/g,
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /data:text\/html/gi,
];

export function sanitizeDossierContent(content: string): string {
  // Normalize Unicode before pattern checks (consistent with guards package)
  let sanitized = content.normalize("NFKC");
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  // Limit total length to prevent prompt stuffing
  if (sanitized.length > 4000) {
    sanitized =
      sanitized.slice(0, 4000) +
      "\n\n[Dossier truncated — older entries removed]";
  }
  return sanitized;
}
