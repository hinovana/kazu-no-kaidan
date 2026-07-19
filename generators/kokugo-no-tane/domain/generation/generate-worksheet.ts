import {
  KANJI_DATABASE_RELEASE,
  PROTOTYPE_LANGUAGE_DATA_PROVIDER,
  isKnownOrthography,
} from "../../infrastructure/language/prototype-language-data-provider.ts";
import { createRandomFunction, hash32 } from "./random.ts";
import {
  buildParagraphs,
  buildPassageSegments,
} from "./paragraph-layout.ts";
import {
  compactText,
  createTemplateRenderer,
} from "../language/template-renderer.ts";
import {
  parseStoryPlan,
  stableJson,
  validateStoryPlan,
} from "../schemas/story-plan-v1.ts";
import {
  VOCABULARY_CANDIDATE_DATABASE_RELEASE,
  buildVocabularyAudit,
  validateVocabularyAudit,
} from "../../infrastructure/language/vocabulary-evidence.ts";
import {
  getBlueprint,
  selectBlueprintId,
} from "../blueprints/registry.ts";
import type { LengthSetting } from "../blueprints/blueprint.js";
import type {
  GenerationProfile,
  Grade,
  StoryLength,
  TopicId,
} from "../types/generation.js";
import type { BlueprintId, SentenceId } from "../types/ids.js";
import type { Choice, Question } from "../types/questions.js";
import type { StoryPlanV1 } from "../types/story-plan.js";
import type { RichText } from "../types/text.js";
import type {
  MachineCheck,
  MachineCheckReport,
  RubyPlanOccurrence,
  Worksheet,
  WorksheetCheckInput,
} from "../types/worksheet.js";

const GENERATOR_VERSION = "kokugo-no-tane.prototype.v0.8";
export const LENGTH_SETTINGS = Object.freeze({
  short: { extra_count: 2, character_band: [250, 370], label: "短め" },
  standard: { extra_count: 8, character_band: [370, 570], label: "ふつう" },
  long: { extra_count: 15, character_band: [500, 750], label: "長め" },
} as const satisfies Readonly<Record<StoryLength, LengthSetting>>);

export interface LegacySourceMetadata {
  readonly source: "local" | "local_fallback" | "ai_proxy";
  readonly error_code?: string | null;
  readonly candidate_id?: string | null;
  readonly request_id?: string | null;
  readonly model?: string | null;
  readonly prompt_version?: string | null;
  readonly prompt_hash?: string | null;
  readonly context_version?: string | null;
}

export interface LegacyGenerateWorksheetOptions {
  readonly grade: Grade;
  readonly profile: GenerationProfile;
  readonly length?: StoryLength;
  readonly seed: string | number;
  readonly topic?: TopicId;
  readonly blueprintId?: BlueprintId;
  readonly storyPlan?: StoryPlanV1;
  readonly sourceMetadata?: LegacySourceMetadata;
}

interface UncheckedGenerateWorksheetOptions {
  readonly grade?: unknown;
  readonly profile?: unknown;
  readonly length?: unknown;
  readonly seed?: unknown;
  readonly topic?: unknown;
  readonly blueprintId?: unknown;
  readonly storyPlan?: unknown;
  readonly sourceMetadata?: unknown;
}

function questionChoices(question: Question): readonly Choice[] {
  return question.type === "emotion_choice" ? question.choices : [];
}

function validateSegments(worksheet: WorksheetCheckInput): string[] {
  const issues: string[] = [];
  const locations: readonly (RichText & { readonly sentence_id?: SentenceId })[] = [
    worksheet.title,
    ...worksheet.passage.sentences,
    ...worksheet.questions.flatMap((question) => [
      question.prompt,
      ...questionChoices(question),
      question.answer,
    ]),
  ];
  for (const location of locations) {
    for (const segment of location.segments) {
      if (segment.type === "text" && !segment.lexeme_id && /\p{Script=Han}/u.test(segment.text)) {
        issues.push(`uncontrolled kanji in ${location.sentence_id ?? location.plainText}`);
      }
      if (segment.type === "ruby" && (!segment.base || !segment.reading || !segment.lexeme_id)) {
        issues.push("incomplete ruby segment");
      }
    }
  }
  return issues;
}

function validateRubyPlan(worksheet: WorksheetCheckInput): string[] {
  const issues: string[] = [];
  const locations = new Map<string, RichText>();
  locations.set("title", worksheet.title);
  for (const sentence of worksheet.passage.sentences) {
    locations.set(sentence.sentence_id, sentence);
  }
  for (const question of worksheet.questions) {
    locations.set(`${question.question_id}_prompt`, question.prompt);
    questionChoices(question).forEach((choice, index) => {
      locations.set(`${question.question_id}_choice_${index + 1}`, choice);
    });
    locations.set(`${question.question_id}_answer`, question.answer);
  }
  const plansByLocationLexeme = new Map<string, RubyPlanOccurrence[]>();
  for (const occurrence of worksheet.ruby_plan) {
    const key = `${occurrence.location_id}:${occurrence.lexeme_id}`;
    const entries = plansByLocationLexeme.get(key) ?? [];
    entries.push(occurrence);
    plansByLocationLexeme.set(key, entries);

    if (occurrence.reason === "first_occurrence" && occurrence.render_ruby !== true) {
      issues.push(`${key}: first occurrence must render ruby`);
    }
    if (["repeat_occurrence", "grade_known"].includes(occurrence.reason) && occurrence.render_ruby !== false) {
      issues.push(`${key}: ${occurrence.reason} must not render ruby`);
    }
  }

  for (const [key, plans] of plansByLocationLexeme) {
    const [locationId, lexemeId] = key.split(":");
    if (locationId === undefined || lexemeId === undefined) {
      issues.push(`${key}: invalid location/lexeme key`);
      continue;
    }
    const location = locations.get(locationId);
    if (!location) {
      issues.push(`${key}: location not found`);
      continue;
    }
    const matchingSegments = location.segments.filter((segment) => segment.lexeme_id === lexemeId);
    if (matchingSegments.length !== plans.length) {
      issues.push(`${key}: plan/segment count mismatch`);
      continue;
    }
    plans.forEach((plan, index) => {
      const segment = matchingSegments[index];
      if (segment === undefined) {
        issues.push(`${key}: rendered segment is missing`);
        return;
      }
      if (plan.render_ruby) {
        if (segment.type !== "ruby" || segment.base !== plan.surface || segment.reading !== plan.reading) {
          issues.push(`${key}: rendered ruby does not match plan`);
        }
      } else if (segment.type !== "text" || segment.text !== plan.surface) {
        issues.push(`${key}: plain segment does not match plan`);
      }
    });
  }
  return issues;
}

export function runMachineChecks(worksheet: WorksheetCheckInput): MachineCheckReport {
  const blueprint = getBlueprint(worksheet.blueprint_id);
  const [minimum, maximum] = LENGTH_SETTINGS[worksheet.story_length].character_band;
  const sentenceIds = new Set(worksheet.passage.sentences.map((sentence) => sentence.sentence_id));
  const evidenceMissing = worksheet.questions.flatMap((question) => question.evidence_ids)
    .filter((id) => !sentenceIds.has(id));
  const rubyScopeIssues: string[] = [];
  const byScopeLexeme = new Map<string, RubyPlanOccurrence[]>();
  for (const occurrence of worksheet.ruby_plan) {
    const key = `${occurrence.scope}:${occurrence.lexeme_id}`;
    const prior = byScopeLexeme.get(key) ?? [];
    if (occurrence.reason === "first_occurrence" && prior.length !== 0) rubyScopeIssues.push(key);
    if (occurrence.reason === "repeat_occurrence" && prior.length === 0) rubyScopeIssues.push(key);
    if (occurrence.reason === "grade_known" && occurrence.render_ruby) rubyScopeIssues.push(key);
    prior.push(occurrence);
    byScopeLexeme.set(key, prior);
  }
  const segmentIssues = validateSegments(worksheet);
  const rubyPlanIssues = validateRubyPlan(worksheet);
  const vocabularyAuditIssues = validateVocabularyAudit(worksheet);
  const checks: MachineCheck[] = [
    {
      check_id: "story_plan_contract",
      passed: !worksheet.story_plan
        || (validateStoryPlan(worksheet.story_plan).length === 0
          && worksheet.generation_provenance.generation_source === "ai_proxy"
          && Boolean(worksheet.generation_provenance.candidate_id)),
      details: {
        source: worksheet.generation_provenance.generation_source,
        candidate_id: worksheet.generation_provenance.candidate_id,
        issues: worksheet.story_plan ? validateStoryPlan(worksheet.story_plan) : [],
      },
    },
    {
      check_id: "blueprint_contract",
      passed: worksheet.text_type === blueprint.textType
        && worksheet.story.genre === blueprint.genre
        && worksheet.story_structure_id === blueprint.storyStructureId,
      details: {
        blueprint_id: worksheet.blueprint_id,
        story_structure_id: worksheet.story_structure_id,
        text_type: worksheet.text_type,
      },
    },
    {
      check_id: "passage_length_band",
      passed: worksheet.passage.character_count >= minimum && worksheet.passage.character_count <= maximum,
      details: { length: worksheet.story_length, actual: worksheet.passage.character_count, minimum, maximum },
    },
    {
      check_id: "evidence_references",
      passed: evidenceMissing.length === 0 && worksheet.questions.every((question) => question.evidence_ids.length > 0),
      details: { missing: evidenceMissing },
    },
    ...blueprint.runMachineChecks(worksheet),
    {
      check_id: "phrase_spacing",
      passed: worksheet.orthography.phrase_spacing === "ideographic-space-v0.1"
        && worksheet.passage.plainText.includes("　")
        && !worksheet.passage.plainText.includes("  "),
      details: { mode: worksheet.orthography.phrase_spacing },
    },
    {
      check_id: "prototype_orthography",
      passed: segmentIssues.length === 0 && worksheet.ruby_plan.every((occurrence) => {
        const known = isKnownOrthography(occurrence.surface, worksheet.grade);
        const hasKanji = /\p{Script=Han}/u.test(occurrence.surface);
        const requiresRubySupport = hasKanji && (worksheet.grade === 1 || !known);
        return requiresRubySupport
          ? occurrence.reason !== "grade_known"
          : occurrence.reason === "grade_known";
      }),
      details: { lexicon: "prototype_lexicon", issues: segmentIssues },
    },
    {
      check_id: "vocabulary_band_candidate_evidence",
      passed: vocabularyAuditIssues.length === 0,
      details: {
        database_release: worksheet.vocabulary_audit?.database_release ?? null,
        coverage_scope: worksheet.vocabulary_audit?.coverage_scope ?? null,
        checked_lexeme_count: worksheet.vocabulary_audit?.checked_lexeme_count ?? 0,
        checked_occurrence_count: worksheet.vocabulary_audit?.checked_occurrence_count ?? 0,
        issues: vocabularyAuditIssues,
      },
    },
    {
      check_id: "first_occurrence_ruby_scopes",
      passed: rubyScopeIssues.length === 0 && rubyPlanIssues.length === 0,
      details: {
        scopes: [...new Set(worksheet.ruby_plan.map((entry) => entry.scope))],
        issues: [...rubyScopeIssues, ...rubyPlanIssues],
      },
    },
  ];
  return {
    all_passed: checks.every((check) => check.passed),
    checks,
    quality_assessment: {
      status: "not_formally_assessed",
      score: null,
      reason: "自然さ、妥当性、公平性は機械検査だけでは評価しない",
    },
  };
}

export function generateWorksheet(options: LegacyGenerateWorksheetOptions): Worksheet;
export function generateWorksheet(
  options: UncheckedGenerateWorksheetOptions = {},
): Worksheet {
  const {
    grade,
    profile,
    length: uncheckedLength = "standard",
    seed,
    topic,
    blueprintId,
    storyPlan,
    sourceMetadata,
  } = options;
  if (!isGrade(grade)) throw new RangeError("grade must be 1, 2, or 3");
  if (!isGenerationProfile(profile)) throw new RangeError("profile must be 1 through 5");
  if (!isStoryLength(uncheckedLength)) throw new RangeError("length must be short, standard, or long");
  const length = uncheckedLength;
  if (typeof seed !== "string" && typeof seed !== "number") {
    throw new TypeError("seed must be a string or number");
  }
  if (typeof seed === "string" && seed.length === 0) throw new TypeError("seed must not be empty");
  if (typeof seed === "number" && !Number.isFinite(seed)) throw new TypeError("seed must be finite");
  if (topic !== undefined && typeof topic !== "string") throw new TypeError("topic must be a string");
  if (sourceMetadata !== undefined && !isRecord(sourceMetadata)) {
    throw new TypeError("sourceMetadata must be an object");
  }
  const normalizedSourceMetadata = sourceMetadata as LegacySourceMetadata | undefined;
  const normalizedBlueprintId = blueprintId as BlueprintId | undefined;

  const normalizedSeed = `${typeof seed}:${String(seed)}`;
  const normalizedStoryPlan = storyPlan === undefined ? null : parseStoryPlan(storyPlan);
  const resolvedBlueprintId = normalizedBlueprintId ?? selectBlueprintId({
    seed: normalizedSeed,
    storyPlan: normalizedStoryPlan,
  });
  const blueprint = getBlueprint(resolvedBlueprintId);
  const storyPlanSignature = normalizedStoryPlan ? (stableJson(normalizedStoryPlan) ?? "") : "";
  const random = createRandomFunction(`${blueprint.id}|${normalizedSeed}|${grade}|${profile}|${length}|${topic ?? ""}|${storyPlanSignature}`);
  const scenario = blueprint.createScenario({
    storyPlan: normalizedStoryPlan,
    topic: topic?.trim(),
    random,
  });
  const trait = blueprint.pickTrait(random);
  const rubyPlan: RubyPlanOccurrence[] = [];
  const render = createTemplateRenderer(grade, rubyPlan, PROTOTYPE_LANGUAGE_DATA_PROVIDER);
  const title = render(blueprint.buildTitle({ scenario }), "title", "title");
  const rawSentences = blueprint.buildStorySentences({
    scenario,
    trait,
    profile,
    lengthSetting: LENGTH_SETTINGS[length],
    random,
  });
  const sentences = rawSentences.map((sentence, index) => {
    const sentenceId = `sentence_${index + 1}` as SentenceId;
    return {
      sentence_id: sentenceId,
      role: sentence.stage,
      ...render(sentence.text, "passage", sentenceId),
    };
  });
  const evidence: Record<string, SentenceId> = {};
  for (const sentence of sentences) {
    if (blueprint.evidenceRoles.includes(sentence.role)) {
      evidence[sentence.role] = sentence.sentence_id;
    }
  }
  const questions = blueprint.buildQuestions({ render, scenario, trait: trait.term, evidence, random, profile });
  const paragraphs = buildParagraphs(sentences, profile);
  const passageText = sentences.map((sentence) => sentence.plainText).join("　");
  const itemHash = hash32(`${blueprint.id}|${normalizedSeed}|${grade}|${profile}|${length}|${topic ?? ""}|${storyPlanSignature}`).toString(16).padStart(8, "0");
  const generationSource = normalizedSourceMetadata?.source
    ?? (normalizedStoryPlan ? "ai_proxy" : "local");
  const worksheet: WorksheetCheckInput = {
    item_id: `kt-prototype-${itemHash}`,
    item_revision: 1,
    lifecycle_status: "generated_pending_checks",
    usage_class: "development_preview",
    child_use_permitted: false,
    text_type: blueprint.textType,
    blueprint_id: blueprint.id,
    story_structure_id: blueprint.storyStructureId,
    anchor_ids: [...blueprint.anchorIds],
    grade,
    generation_profile: profile,
    story_length: length,
    seed,
    requested_topic: topic?.trim() || null,
    story_plan: normalizedStoryPlan,
    title,
    passage: {
      plainText: passageText,
      segments: buildPassageSegments(paragraphs),
      character_count: Array.from(compactText(passageText)).length,
      sentences,
      paragraphs,
    },
    questions,
    total_points: questions.reduce((sum, question) => sum + question.points, 0),
    story: blueprint.buildStoryMetadata({ scenario, trait, storyPlan: normalizedStoryPlan }),
    orthography: {
      mode: grade === 1
        ? "grade1_all_kanji_first_occurrence_ruby"
        : "first_unknown_kanji_occurrence_ruby",
      grade_kanji_source: KANJI_DATABASE_RELEASE,
      vocabulary_source: "prototype_lexicon",
      vocabulary_database_used: false,
      vocabulary_candidate_database_consulted: VOCABULARY_CANDIDATE_DATABASE_RELEASE,
      vocabulary_candidate_evidence_scope: "prototype_lexicon_occurrences_only",
      phrase_spacing: "ideographic-space-v0.1",
      scope_policy: ["title", "passage", "each_question", "each_answer"],
    },
    ruby_plan: rubyPlan,
    vocabulary_audit: buildVocabularyAudit(rubyPlan),
    generation_provenance: {
      generator_version: GENERATOR_VERSION,
      algorithm_spec_version: "algorithm-spec.v0.8-draft",
      blueprint_version: "item-blueprint.v0.3-draft",
      blueprint_id: blueprint.id,
      database_release: KANJI_DATABASE_RELEASE,
      vocabulary_candidate_database_release: VOCABULARY_CANDIDATE_DATABASE_RELEASE,
      template_version: blueprint.templateVersion({ storyPlan: normalizedStoryPlan }),
      story_structure_id: blueprint.storyStructureId,
      generation_source: generationSource,
      fallback_reason: normalizedSourceMetadata?.error_code ?? null,
      candidate_id: normalizedSourceMetadata?.candidate_id ?? null,
      proxy_request_id: normalizedSourceMetadata?.request_id ?? null,
      prompt_version: normalizedSourceMetadata?.prompt_version ?? null,
      prompt_hash: normalizedSourceMetadata?.prompt_hash ?? null,
      context_version: normalizedSourceMetadata?.context_version ?? null,
      model: normalizedSourceMetadata?.model ?? null,
      model_settings: normalizedStoryPlan ? { reasoning_effort: "high", structured_outputs: true } : null,
      story_plan_hash: normalizedStoryPlan ? hash32(storyPlanSignature).toString(16).padStart(8, "0") : null,
      normalization_version: "unicode-native.v0.1",
      ruby_processor_version: "prototype-phrase-ruby.v0.2",
      generated_at: null,
      seed: normalizedSeed,
    },
    manual_check: { status: "not_started" },
    calibration: { status: "not_calibrated" },
  };
  const machineChecks = runMachineChecks(worksheet);
  if (!machineChecks.all_passed) {
    const failures = machineChecks.checks
      .filter((check) => !check.passed)
      .map((check) => check.check_id);
    throw Object.assign(
      new Error(`generated worksheet failed machine checks: ${failures.join(", ")}`),
      { worksheet: { ...worksheet, machine_checks: machineChecks } },
    );
  }
  return {
    ...worksheet,
    lifecycle_status: "automated_checks_passed",
    machine_checks: { ...machineChecks, all_passed: true },
  };
}

function isGrade(value: unknown): value is Grade {
  return value === 1 || value === 2 || value === 3;
}

function isGenerationProfile(value: unknown): value is GenerationProfile {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function isStoryLength(value: unknown): value is StoryLength {
  return value === "short" || value === "standard" || value === "long";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
