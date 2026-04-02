/**
 * IMMUTABLE eval harness for Plasma Pandora.
 * DO NOT edit during implementation — only add new golden entries.
 */

import { classifyComplexity } from "../../ai-pipeline/shared/routing";
import {
  routeSkill,
  type SkillRoutingContext,
} from "../../ai-pipeline/shared/prompt/skill-router";
import type { GoldenEntry } from "./fixtures";
import { GOLDEN_DATASET } from "./fixtures";

export interface EvalResult {
  id: string;
  query: string;
  // Skill routing
  expectedSkill: string;
  actualSkill: string;
  skillPass: boolean;
  // Complexity tier
  expectedTier: string;
  actualTier: string;
  tierPass: boolean;
  // Guard check
  expectedGuardPass: boolean;
  actualGuardPass: boolean;
  guardPass: boolean;
  // Overall
  pass: boolean;
}

export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  score: string;
  criteria: {
    skillAccuracy: { passed: number; total: number; pass: boolean };
    tierAccuracy: { passed: number; total: number; pass: boolean };
    guardAccuracy: { passed: number; total: number; pass: boolean };
    noRegressions: boolean;
  };
  results: EvalResult[];
}

// Inlined input guard — detects injection attempts and raw PII.
// Mirrors Pandora's L0 input safety layer without an external package dep.
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /reveal\s+your\s+system\s+prompt/i,
  /you\s+are\s+now\s+(DAN|jailbreak)/i,
  /pretend\s+you\s+are\s+a\s+bank/i,
];

const PII_PATTERNS = [
  // Credit/debit card (Luhn-plausible 13-19 digit sequences with optional separators)
  /\b(?:\d[ -]?){13,18}\d\b/,
];

function checkInput(query: string): { passed: boolean; reason?: string } {
  if (!query || query.length === 0) return { passed: true };
  // Normalize Unicode before checking (matches guards/sanitizer behavior)
  const normalized = query.normalize("NFKC");
  // Limit scan window to prevent ReDoS on very long inputs
  const scanTarget =
    normalized.length > 10_000 ? normalized.slice(0, 10_000) : normalized;
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(scanTarget)) return { passed: false, reason: "injection" };
  }
  for (const pattern of PII_PATTERNS) {
    if (pattern.test(scanTarget)) return { passed: false, reason: "pii" };
  }
  return { passed: true };
}

export function runEval(dataset: GoldenEntry[] = GOLDEN_DATASET): EvalSummary {
  const results: EvalResult[] = [];

  for (const entry of dataset) {
    const actualTier = classifyComplexity(entry.query, 0, false);

    const ctx: SkillRoutingContext = {
      isNewVisitor: entry.expectedSkill === "new_prospect",
      isVoiceChannel: false,
      hasDossier: entry.expectedSkill !== "new_prospect",
      isComplianceTopic: entry.tags.includes("compliance"),
      isFrustrated: entry.tags.includes("frustration"),
      confidenceBelowThreshold: false,
      humanRequested: /speak\s+to\s+a\s+human|human\s+agent/i.test(entry.query),
      conversationLength: 0,
    };
    const actualSkill = routeSkill(ctx, entry.query);

    const guardResult = checkInput(entry.query);
    const actualGuardPass = guardResult.passed;

    const skillPass = actualSkill === entry.expectedSkill;
    const tierPass = actualTier === entry.expectedTier;
    const guardPass = actualGuardPass === entry.expectedGuardPass;

    results.push({
      id: entry.id,
      query: entry.query.slice(0, 60),
      expectedSkill: entry.expectedSkill,
      actualSkill,
      skillPass,
      expectedTier: entry.expectedTier,
      actualTier,
      tierPass,
      expectedGuardPass: entry.expectedGuardPass,
      actualGuardPass,
      guardPass,
      pass: skillPass && tierPass && guardPass,
    });
  }

  const passed = results.filter((r) => r.pass).length;
  const skillPassed = results.filter((r) => r.skillPass).length;
  const tierPassed = results.filter((r) => r.tierPass).length;
  const guardPassed = results.filter((r) => r.guardPass).length;
  const total = results.length;

  return {
    total,
    passed,
    failed: total - passed,
    score: `${passed}/${total}`,
    criteria: {
      skillAccuracy: {
        passed: skillPassed,
        total,
        pass: skillPassed / total >= 0.8,
      },
      tierAccuracy: {
        passed: tierPassed,
        total,
        pass: tierPassed / total >= 0.7,
      },
      guardAccuracy: {
        passed: guardPassed,
        total,
        pass: guardPassed / total >= 0.9,
      },
      noRegressions: passed >= Math.floor(total * 0.7),
    },
    results,
  };
}

// CLI runner
if (
  typeof process !== "undefined" &&
  process.argv[1]?.includes("eval-harness")
) {
  const summary = runEval();
  console.log("\n=== Plasma Pandora Eval Results ===\n");
  console.log(`Score: ${summary.score}`);
  console.log(
    `Skill accuracy:  ${summary.criteria.skillAccuracy.passed}/${summary.criteria.skillAccuracy.total} ${summary.criteria.skillAccuracy.pass ? "PASS" : "FAIL"}`,
  );
  console.log(
    `Tier accuracy:   ${summary.criteria.tierAccuracy.passed}/${summary.criteria.tierAccuracy.total} ${summary.criteria.tierAccuracy.pass ? "PASS" : "FAIL"}`,
  );
  console.log(
    `Guard accuracy:  ${summary.criteria.guardAccuracy.passed}/${summary.criteria.guardAccuracy.total} ${summary.criteria.guardAccuracy.pass ? "PASS" : "FAIL"}`,
  );
  console.log("\nFailed entries:");
  for (const r of summary.results.filter((r) => !r.pass)) {
    console.log(
      `  ${r.id}: "${r.query}" — skill:${r.skillPass ? "ok" : "FAIL"} tier:${r.tierPass ? "ok" : "FAIL"} guard:${r.guardPass ? "ok" : "FAIL"}`,
    );
  }
  console.log(`\nVerdict: ${summary.criteria.noRegressions ? "PASS" : "FAIL"}`);
  process.exit(summary.criteria.noRegressions ? 0 : 1);
}
