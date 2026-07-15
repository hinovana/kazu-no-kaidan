import {
  KANJI_DATABASE_RELEASE,
  getKnownKanjiSet,
  isKnownOrthography,
} from "./kanji.js";
import {
  parseStoryPlan,
  stableJson,
  validateStoryPlan,
} from "./story-plan-schema.js";
import { PROTOTYPE_LEXICON } from "./prototype-lexicon.js";
import {
  getBlueprint,
  selectBlueprintId,
} from "./blueprints/index.js";

export { PROTOTYPE_LEXICON } from "./prototype-lexicon.js";

const GENERATOR_VERSION = "kokugo-no-tane.prototype.v0.7";
const LENGTH_SETTINGS = Object.freeze({
  short: { extra_count: 2, character_band: [250, 370], label: "短め" },
  standard: { extra_count: 8, character_band: [370, 570], label: "ふつう" },
  long: { extra_count: 15, character_band: [500, 750], label: "長め" },
});

function hash32(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createRandom(seed) {
  let state = hash32(seed) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function plainFromSegments(segments) {
  return segments.map((segment) => segment.type === "ruby" ? segment.base : segment.text).join("");
}

function applyPhraseSpacing(segments) {
  return segments.map((segment) => (
    segment.type === "text" && !segment.lexeme_id
      ? { ...segment, text: segment.text.replaceAll("|", "　") }
      : segment
  ));
}

function compactText(text) {
  return String(text).replace(/[\s　]+/gu, "");
}

function createRenderer(grade, rubyPlan) {
  const knownKanji = getKnownKanjiSet(grade);
  const seenByScope = new Map();
  const occurrenceByScope = new Map();

  return (template, scope, locationId) => {
    const seen = seenByScope.get(scope) ?? new Set();
    seenByScope.set(scope, seen);
    const segments = [];
    const pattern = /\{\{([a-z_]+)\}\}/g;
    let cursor = 0;
    let match;

    while ((match = pattern.exec(template)) !== null) {
      if (match.index > cursor) {
        segments.push({ type: "text", text: template.slice(cursor, match.index) });
      }
      const lexemeId = match[1];
      const lexeme = PROTOTYPE_LEXICON[lexemeId];
      if (!lexeme) throw new Error(`unknown prototype lexeme: ${lexemeId}`);

      const occurrenceKey = `${scope}:${lexemeId}`;
      const occurrenceIndex = (occurrenceByScope.get(occurrenceKey) ?? 0) + 1;
      occurrenceByScope.set(occurrenceKey, occurrenceIndex);
      const kanji = Array.from(lexeme.surface)
        .filter((character) => /\p{Script=Han}/u.test(character));
      const known = kanji.every((character) => knownKanji.has(character));
      const needsFirstOccurrenceRuby = kanji.length > 0 && (grade === 1 || !known);
      const firstRubyOccurrence = needsFirstOccurrenceRuby && !seen.has(lexemeId);
      if (needsFirstOccurrenceRuby) seen.add(lexemeId);

      segments.push(firstRubyOccurrence
        ? { type: "ruby", base: lexeme.surface, reading: lexeme.reading, lexeme_id: lexemeId }
        : { type: "text", text: lexeme.surface, lexeme_id: lexemeId });
      rubyPlan.push({
        lexeme_id: lexemeId,
        surface: lexeme.surface,
        reading: lexeme.reading,
        scope,
        location_id: locationId,
        occurrence_index: occurrenceIndex,
        render_ruby: firstRubyOccurrence,
        reason: !needsFirstOccurrenceRuby
          ? "grade_known"
          : firstRubyOccurrence ? "first_occurrence" : "repeat_occurrence",
      });
      cursor = pattern.lastIndex;
    }
    if (cursor < template.length) segments.push({ type: "text", text: template.slice(cursor) });
    const renderedSegments = scope === "title" ? segments : applyPhraseSpacing(segments);
    return { plainText: plainFromSegments(renderedSegments), segments: renderedSegments };
  };
}

function validateSegments(worksheet) {
  const issues = [];
  const locations = [
    worksheet.title,
    ...worksheet.passage.sentences,
    ...worksheet.questions.flatMap((question) => [question.prompt, ...(question.choices ?? []), question.answer]),
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

function validateRubyPlan(worksheet) {
  const issues = [];
  const locations = new Map([
    ["title", worksheet.title],
    ...worksheet.passage.sentences.map((sentence) => [sentence.sentence_id, sentence]),
    ...worksheet.questions.flatMap((question) => [
      [`${question.question_id}_prompt`, question.prompt],
      ...(question.choices ?? []).map((choice, index) => [`${question.question_id}_choice_${index + 1}`, choice]),
      [`${question.question_id}_answer`, question.answer],
    ]),
  ]);
  const plansByLocationLexeme = new Map();
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

export function runMachineChecks(worksheet) {
  const blueprint = getBlueprint(worksheet.blueprint_id);
  const [minimum, maximum] = LENGTH_SETTINGS[worksheet.story_length].character_band;
  const sentenceIds = new Set(worksheet.passage.sentences.map((sentence) => sentence.sentence_id));
  const evidenceMissing = worksheet.questions.flatMap((question) => question.evidence_ids)
    .filter((id) => !sentenceIds.has(id));
  const rubyScopeIssues = [];
  const byScopeLexeme = new Map();
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
  const checks = [
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

export function generateWorksheet({
  grade,
  profile,
  length = "standard",
  seed,
  topic,
  blueprintId,
  storyPlan,
  sourceMetadata,
} = {}) {
  if (![1, 2, 3].includes(grade)) throw new RangeError("grade must be 1, 2, or 3");
  if (![1, 2, 3, 4, 5].includes(profile)) throw new RangeError("profile must be 1 through 5");
  if (!Object.hasOwn(LENGTH_SETTINGS, length)) throw new RangeError("length must be short, standard, or long");
  if (typeof seed !== "string" && typeof seed !== "number") {
    throw new TypeError("seed must be a string or number");
  }
  if (typeof seed === "string" && seed.length === 0) throw new TypeError("seed must not be empty");
  if (typeof seed === "number" && !Number.isFinite(seed)) throw new TypeError("seed must be finite");
  if (topic !== undefined && typeof topic !== "string") throw new TypeError("topic must be a string");
  if (sourceMetadata !== undefined && (typeof sourceMetadata !== "object" || sourceMetadata === null || Array.isArray(sourceMetadata))) {
    throw new TypeError("sourceMetadata must be an object");
  }

  const normalizedSeed = `${typeof seed}:${String(seed)}`;
  const normalizedStoryPlan = storyPlan === undefined ? null : parseStoryPlan(storyPlan);
  const resolvedBlueprintId = blueprintId ?? selectBlueprintId({
    seed: normalizedSeed,
    storyPlan: normalizedStoryPlan,
  });
  const blueprint = getBlueprint(resolvedBlueprintId);
  const storyPlanSignature = normalizedStoryPlan ? stableJson(normalizedStoryPlan) : "";
  const random = createRandom(`${blueprint.id}|${normalizedSeed}|${grade}|${profile}|${length}|${topic ?? ""}|${storyPlanSignature}`);
  const scenario = blueprint.createScenario({
    storyPlan: normalizedStoryPlan,
    topic: topic?.trim(),
    random,
  });
  const trait = blueprint.pickTrait(random);
  const rubyPlan = [];
  const render = createRenderer(grade, rubyPlan);
  const title = render(blueprint.buildTitle({ scenario }), "title", "title");
  const rawSentences = blueprint.buildStorySentences({
    scenario,
    trait,
    profile,
    lengthSetting: LENGTH_SETTINGS[length],
    random,
  });
  const sentences = rawSentences.map((sentence, index) => {
    const sentenceId = `sentence_${index + 1}`;
    return {
      sentence_id: sentenceId,
      role: sentence.stage,
      ...render(sentence.text, "passage", sentenceId),
    };
  });
  const evidence = Object.fromEntries(sentences
    .filter((sentence) => blueprint.evidenceRoles.includes(sentence.role))
    .map((sentence) => [sentence.role, sentence.sentence_id]));
  const questions = blueprint.buildQuestions({ render, scenario, trait: trait.term, evidence, random, profile });
  const paragraphCount = Math.min(12, Math.max(5, profile + 4, Math.ceil(sentences.length / 3)));
  const paragraphSize = Math.ceil(sentences.length / paragraphCount);
  const paragraphs = Array.from({ length: paragraphCount }, (_, index) => {
    const paragraphSentences = sentences.slice(index * paragraphSize, (index + 1) * paragraphSize);
    const segments = paragraphSentences.flatMap((sentence, sentenceIndex) => sentenceIndex === 0
      ? sentence.segments
      : [{ type: "text", text: "　" }, ...sentence.segments]);
    return paragraphSentences.length === 0 ? null : {
      paragraph_id: `paragraph_${index + 1}`,
      sentence_ids: paragraphSentences.map((sentence) => sentence.sentence_id),
      plainText: plainFromSegments(segments),
      segments,
    };
  }).filter(Boolean);
  const passageText = sentences.map((sentence) => sentence.plainText).join("　");
  const itemHash = hash32(`${blueprint.id}|${normalizedSeed}|${grade}|${profile}|${length}|${topic ?? ""}|${storyPlanSignature}`).toString(16).padStart(8, "0");
  const generationSource = sourceMetadata?.source ?? (normalizedStoryPlan ? "ai_proxy" : "local");
  const worksheet = {
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
      segments: paragraphs.flatMap((paragraph, index) => index === 0
        ? paragraph.segments
        : [{ type: "text", text: "\n" }, ...paragraph.segments]),
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
      phrase_spacing: "ideographic-space-v0.1",
      scope_policy: ["title", "passage", "each_question", "each_answer"],
    },
    ruby_plan: rubyPlan,
    generation_provenance: {
      generator_version: GENERATOR_VERSION,
      algorithm_spec_version: "algorithm-spec.v0.7-draft",
      blueprint_version: "item-blueprint.v0.3-draft",
      blueprint_id: blueprint.id,
      database_release: KANJI_DATABASE_RELEASE,
      template_version: blueprint.templateVersion({ storyPlan: normalizedStoryPlan }),
      story_structure_id: blueprint.storyStructureId,
      generation_source: generationSource,
      fallback_reason: sourceMetadata?.error_code ?? null,
      candidate_id: sourceMetadata?.candidate_id ?? null,
      proxy_request_id: sourceMetadata?.request_id ?? null,
      prompt_version: sourceMetadata?.prompt_version ?? null,
      prompt_hash: sourceMetadata?.prompt_hash ?? null,
      context_version: sourceMetadata?.context_version ?? null,
      model: sourceMetadata?.model ?? null,
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
  worksheet.machine_checks = runMachineChecks(worksheet);
  if (!worksheet.machine_checks.all_passed) {
    const failures = worksheet.machine_checks.checks.filter((check) => !check.passed).map((check) => check.check_id);
    const error = new Error(`generated worksheet failed machine checks: ${failures.join(", ")}`);
    error.worksheet = worksheet;
    throw error;
  }
  worksheet.lifecycle_status = "automated_checks_passed";
  return worksheet;
}

export { LENGTH_SETTINGS };
