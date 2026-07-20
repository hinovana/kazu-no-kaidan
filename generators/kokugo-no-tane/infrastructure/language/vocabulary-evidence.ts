import {
  PROTOTYPE_VOCABULARY_EVIDENCE,
  VOCABULARY_CANDIDATE_DATABASE_RELEASE,
} from "../../src/generated/prototype-vocabulary-evidence.ts";
import type {
  RubyPlanOccurrence,
  Worksheet,
} from "../../domain/types/worksheet.js";

interface CandidateVocabularyEvidence {
  readonly source_lexeme_id: string;
  readonly surface: string;
  readonly reading: string;
  readonly grade_band: string;
  readonly source_allocation_code: number;
  readonly evidence_status: string;
  readonly generation_eligible: boolean;
}

const EVIDENCE_BY_LEXEME: Readonly<Record<string, CandidateVocabularyEvidence>> =
  PROTOTYPE_VOCABULARY_EVIDENCE;

export {
  PROTOTYPE_VOCABULARY_EVIDENCE,
  VOCABULARY_CANDIDATE_DATABASE_RELEASE,
};

export function buildVocabularyAudit(
  rubyPlan: readonly RubyPlanOccurrence[],
): Worksheet["vocabulary_audit"] {
  const occurrences = rubyPlan.map((occurrence) => {
    const evidence = EVIDENCE_BY_LEXEME[occurrence.lexeme_id] ?? null;
    return {
      lexeme_id: occurrence.lexeme_id,
      source_lexeme_id: evidence?.source_lexeme_id ?? null,
      surface: occurrence.surface,
      reading: occurrence.reading,
      grade_band: evidence?.grade_band ?? null,
      evidence_status: evidence?.evidence_status ?? "missing",
      location_id: occurrence.location_id,
      scope: occurrence.scope,
    };
  });
  const uniqueLexemeIds = [...new Set(occurrences.map((occurrence) => occurrence.lexeme_id))];
  return {
    database_release: VOCABULARY_CANDIDATE_DATABASE_RELEASE,
    coverage_scope: "prototype_lexicon_occurrences_only",
    generation_policy: "candidate evidence only; not a manual approval",
    checked_occurrence_count: occurrences.length,
    checked_lexeme_count: uniqueLexemeIds.length,
    occurrences,
  };
}

export function validateVocabularyAudit(
  worksheet: Pick<Worksheet, "vocabulary_audit" | "ruby_plan">,
): string[] {
  const issues: string[] = [];
  const audit = worksheet.vocabulary_audit;
  if (!audit) return ["vocabulary_audit is missing"];
  if (audit.database_release !== VOCABULARY_CANDIDATE_DATABASE_RELEASE) {
    issues.push("vocabulary candidate database release mismatch");
  }
  if (audit.coverage_scope !== "prototype_lexicon_occurrences_only") {
    issues.push("unexpected vocabulary audit coverage scope");
  }
  if (audit.generation_policy !== "candidate evidence only; not a manual approval") {
    issues.push("unexpected vocabulary audit generation policy");
  }
  if (!Array.isArray(audit.occurrences)) {
    return [...issues, "vocabulary audit occurrences are missing"];
  }
  if (audit.checked_occurrence_count !== worksheet.ruby_plan.length) {
    issues.push("vocabulary audit occurrence count mismatch");
  }
  if (
    audit.checked_lexeme_count
    !== new Set(audit.occurrences.map((occurrence) => occurrence.lexeme_id)).size
  ) {
    issues.push("vocabulary audit lexeme count mismatch");
  }

  audit.occurrences.forEach((occurrence, index) => {
    const plan = worksheet.ruby_plan[index];
    const evidence = EVIDENCE_BY_LEXEME[occurrence.lexeme_id];
    if (!plan || plan.lexeme_id !== occurrence.lexeme_id) {
      issues.push(`occurrence ${index + 1}: ruby plan mismatch`);
      return;
    }
    if (!evidence) {
      issues.push(`${occurrence.lexeme_id}: candidate evidence is missing`);
      return;
    }
    if (
      evidence.grade_band !== "lower_elementary_1_3"
      || evidence.source_allocation_code !== 1
      || evidence.evidence_status !== "candidate_unreviewed"
      || evidence.generation_eligible !== false
    ) {
      issues.push(`${occurrence.lexeme_id}: not supported by the lower-elementary band`);
    }
    if (
      evidence.surface !== occurrence.surface
      || evidence.reading !== occurrence.reading
      || evidence.source_lexeme_id !== occurrence.source_lexeme_id
      || evidence.grade_band !== occurrence.grade_band
      || evidence.evidence_status !== occurrence.evidence_status
      || plan.surface !== occurrence.surface
      || plan.reading !== occurrence.reading
    ) {
      issues.push(`${occurrence.lexeme_id}: evidence does not match the rendered occurrence`);
    }
  });
  return issues;
}
