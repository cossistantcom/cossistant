const PII_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  replacement: string;
}> = [
  {
    name: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: "[EMAIL]",
  },
  {
    name: "phone",
    pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: "[PHONE]",
  },
  {
    name: "ssn",
    pattern: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
    replacement: "[SSN]",
  },
  {
    name: "credit_card",
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    replacement: "[CARD]",
  },
  {
    name: "iban",
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g,
    replacement: "[IBAN]",
  },
  {
    name: "passport",
    pattern: /(?<![#\w-])\b[A-Z]{1,2}\d{6,9}\b(?![\w-])/g,
    replacement: "[PASSPORT]",
  },
  {
    name: "emirates_id",
    pattern: /\b784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d{1}\b/g,
    replacement: "[EMIRATES_ID]",
  },
];

export function detectPii(
  text: string,
): Array<{ type: string; match: string; start: number }> {
  const results: Array<{ type: string; match: string; start: number }> = [];
  for (const { name, pattern } of PII_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      results.push({ type: name, match: match[0], start: match.index });
    }
  }
  return results;
}

export function scrubPii(text: string): string {
  let result = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    result = result.replace(
      new RegExp(pattern.source, pattern.flags),
      replacement,
    );
  }
  return result;
}
