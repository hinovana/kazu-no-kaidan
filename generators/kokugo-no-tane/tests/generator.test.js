import assert from "node:assert/strict";
import {
  LENGTH_SETTINGS,
  generateWorksheet,
  runMachineChecks,
} from "../domain/generation/generate-worksheet.ts";
import { PROTOTYPE_LEXICON } from "../infrastructure/language/prototype-language-data-provider.ts";
import { getKnownKanjiSet } from "../infrastructure/language/kanji-data.ts";
import {
  STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID,
  STORY_CLUE_DISCOVERY_STRUCTURE_ID,
} from "../domain/blueprints/story-clue-discovery/blueprint.ts";
import {
  STORY_RETRY_CRAFT_STRUCTURE_ID,
  STORY_STANDARD_4Q_BLUEPRINT_ID,
} from "../domain/blueprints/story-retry-craft/blueprint.ts";
import {
  STORY_LATE_ARRIVAL_4Q_BLUEPRINT_ID,
  STORY_LATE_ARRIVAL_STRUCTURE_ID,
} from "../domain/blueprints/story-late-arrival/blueprint.ts";
import {
  CAUSAL_TRACE_6Q_ID,
  CONTEXT_AND_INFERENCE_4Q_ID,
  STANDARD_READING_4Q_ID,
} from "../domain/questions/question-set-registry.ts";

const BLUEPRINT_STRUCTURES = new Map([
  [STORY_STANDARD_4Q_BLUEPRINT_ID, STORY_RETRY_CRAFT_STRUCTURE_ID],
  [STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID, STORY_CLUE_DISCOVERY_STRUCTURE_ID],
  [STORY_LATE_ARRIVAL_4Q_BLUEPRINT_ID, STORY_LATE_ARRIVAL_STRUCTURE_ID],
]);

const countOccurrences = (text, target) => text.split(target).length - 1;

const QUESTION_SET_TYPES = new Map([
  [STANDARD_READING_4Q_ID, ["extract_explicit_trait_term", "emotion_choice", "extract_fact", "infer_emotion"]],
  [CAUSAL_TRACE_6Q_ID, ["cause_result_choice", "emotion_choice", "extract_fact", "event_sequence_choice", "infer_emotion", "extract_resolution"]],
  [CONTEXT_AND_INFERENCE_4Q_ID, ["scene_emotion_choice", "extract_resolution", "event_sequence_choice", "infer_emotion"]],
]);

function assertWorksheet(worksheet) {
  assert.equal(worksheet.text_type, "narrative");
  assert.ok(BLUEPRINT_STRUCTURES.has(worksheet.blueprint_id));
  assert.equal(worksheet.story_structure_id, BLUEPRINT_STRUCTURES.get(worksheet.blueprint_id));
  assert.equal(worksheet.generation_provenance.story_structure_id, worksheet.story_structure_id);
  assert.equal(worksheet.generation_provenance.question_set_blueprint_id, worksheet.question_set_blueprint_id);
  assert.ok(QUESTION_SET_TYPES.has(worksheet.question_set_blueprint_id));
  assert.deepEqual(
    worksheet.questions.map((question) => question.type),
    QUESTION_SET_TYPES.get(worksheet.question_set_blueprint_id),
  );
  assert.equal(worksheet.questions.length, QUESTION_SET_TYPES.get(worksheet.question_set_blueprint_id).length);
  assert.equal(worksheet.total_points, worksheet.questions.reduce((sum, question) => sum + question.points, 0));

  const sentenceIds = new Set(worksheet.passage.sentences.map((sentence) => sentence.sentence_id));
  for (const question of worksheet.questions) {
    assert.ok(question.evidence_ids.length > 0);
    question.evidence_ids.forEach((id) => assert.ok(sentenceIds.has(id), `missing evidence ${id}`));
    assert.ok(question.answer.plainText.length > 0);
    assert.ok(question.scoring_elements.length > 0);
    assert.ok(question.question_pattern_id.startsWith("QP_"));
    assert.ok(question.answer_layout.answer_layout_id.startsWith("AL_"));
    if (question.answer_layout.kind === "fixed-character-boxes" || question.answer_layout.kind === "single-extract") {
      assert.equal(countOccurrences(worksheet.passage.plainText, question.answer.plainText), 1);
    }
    if ("choices" in question) {
      assert.equal(question.choices.length, 3);
      assert.equal(question.choices.filter((choice) => choice.is_correct).length, 1);
      assert.equal(
        question.correct_choice_id,
        question.choices.find((choice) => choice.is_correct).choice_id,
      );
    }
  }
  assert.equal(worksheet.machine_checks.all_passed, true);
  assert.equal(runMachineChecks(worksheet).all_passed, true);
}

{
  const expectedCategories = new Map([
    ["home", "家庭"],
    ["school", "学校"],
    ["nature", "自然"],
    ["town", "町"],
    ["animal", "動物"],
  ]);
  for (const [topic, category] of expectedCategories) {
    for (const questionSetBlueprintId of QUESTION_SET_TYPES.keys()) {
      const worksheet = generateWorksheet({
        grade: 1,
        profile: 4,
        length: "standard",
        seed: `late-arrival-${topic}-${questionSetBlueprintId}`,
        topic,
        blueprintId: STORY_LATE_ARRIVAL_4Q_BLUEPRINT_ID,
        questionSetBlueprintId,
      });
      const lateArrivalIndex = worksheet.passage.sentences.findIndex((sentence) => sentence.role === "late_arrival");
      const problemIndex = worksheet.passage.sentences.findIndex((sentence) => sentence.role === "problem");
      const intervention = worksheet.passage.sentences.find((sentence) => sentence.role === "intervention");
      const firstLateEntrantMention = worksheet.passage.sentences.findIndex((sentence) =>
        new RegExp(`(?:^|[\\s　、。])${worksheet.story.late_arriving_character}(?:は|が|と|も|を|に|へ|で|、|。|$)`, "u")
          .test(sentence.plainText));
      assert.equal(worksheet.story.category, category);
      assert.equal(worksheet.story.character_structure, "late_arrival_three_person");
      assert.ok(worksheet.story.late_arriving_character);
      assert.ok(problemIndex < lateArrivalIndex);
      assert.equal(firstLateEntrantMention, lateArrivalIndex);
      assert.match(worksheet.passage.sentences.at(-1).plainText, /さんにん/);
      assert.ok(worksheet.questions.some((question) => question.evidence_ids.includes(intervention.sentence_id)));
      assert.equal(worksheet.machine_checks.checks.find((check) => check.check_id === "late_arrival_character_contract").passed, true);
      assertWorksheet(worksheet);
    }
  }
}

function assertStandardWorksheet(worksheet) {
  assert.equal(worksheet.question_set_blueprint_id, STANDARD_READING_4Q_ID);
  assertWorksheet(worksheet);
  assert.deepEqual(
    worksheet.questions.map((question) => question.primary_construct),
    ["C1_LOCATE_EXPLICIT", "C2_INTERPRET_EXPLICIT_EMOTION", "C1_LOCATE_EXPLICIT", "C3_INFER_EMOTION"],
  );
  assert.deepEqual(worksheet.questions[3].secondary_demands, ["C5_COMPOSE_WITH_EVIDENCE"]);
  assert.equal(worksheet.total_points, 5);
  assert.equal(worksheet.questions[3].scoring_elements.length, 2);
}

{
  const options = { grade: 1, profile: 3, length: "standard", seed: "same-seed", topic: "nature" };
  const first = generateWorksheet(options);
  const second = generateWorksheet(options);
  assert.deepEqual(second, first, "same inputs must reproduce the complete worksheet");
  assert.equal(JSON.stringify(second), JSON.stringify(first));
}

{
  const variants = Array.from({ length: 12 }, (_, seed) =>
    generateWorksheet({ grade: 2, profile: 3, seed: `variation-${seed}` }));
  assert.ok(new Set(variants.map((item) => item.passage.plainText)).size >= 5, "seeds should vary story surfaces");
  assert.ok(new Set(variants.flatMap((item) => item.questions.filter((question) => "choices" in question).map((question) => question.correct_choice_id))).size >= 2, "seeds should vary choice positions");
  assert.deepEqual(new Set(variants.map((item) => item.blueprint_id)), new Set(BLUEPRINT_STRUCTURES.keys()));
  assert.deepEqual(new Set(variants.map((item) => item.question_set_blueprint_id)), new Set(QUESTION_SET_TYPES.keys()));
}

{
  const expectedCategories = new Map([
    ["home", "家庭"],
    ["school", "学校"],
    ["nature", "自然"],
    ["town", "町"],
    ["animal", "動物"],
  ]);
  for (const [topic, category] of expectedCategories) {
    const worksheet = generateWorksheet({
      grade: 1,
      profile: 3,
      length: "standard",
      seed: `discovery-${topic}`,
      topic,
      blueprintId: STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID,
    });
    assert.equal(worksheet.story.category, category);
    assert.doesNotMatch(worksheet.title.plainText, /やりなおし/u);
    assert.doesNotMatch(worksheet.passage.plainText, /まちがえ|しっぱい|やりなお/u);
    assert.equal(worksheet.story.event.problem, null);
    assert.ok(worksheet.story.event.clue.length > 0);
    assertWorksheet(worksheet);
  }
}

for (const blueprintId of BLUEPRINT_STRUCTURES.keys()) {
  for (let grade = 1; grade <= 3; grade += 1) {
    for (let profile = 1; profile <= 5; profile += 1) {
      for (const length of Object.keys(LENGTH_SETTINGS)) {
        const worksheet = generateWorksheet({ grade, profile, length, seed: `bounds-${grade}-${profile}-${length}`, blueprintId, questionSetBlueprintId: STANDARD_READING_4Q_ID });
      assertStandardWorksheet(worksheet);
      const [minimum, maximum] = LENGTH_SETTINGS[length].character_band;
      assert.ok(
        worksheet.passage.character_count >= minimum && worksheet.passage.character_count <= maximum,
        `grade ${grade}, profile ${profile}, length ${length}: ${worksheet.passage.character_count} not in ${minimum}-${maximum}`,
      );
      assert.equal(worksheet.grade, grade);
      assert.equal(worksheet.generation_profile, profile);
      assert.equal(worksheet.story_length, length);
      const q4Positions = worksheet.questions[3].evidence_ids.map((id) =>
        worksheet.passage.sentences.findIndex((sentence) => sentence.sentence_id === id));
      const expectedDistance = [1, 1, 2, 3, 5][profile - 1];
      assert.equal(q4Positions[1] - q4Positions[0], expectedDistance);
      if (profile >= 4) {
        const paragraphFor = (id) => worksheet.passage.paragraphs.find((paragraph) => paragraph.sentence_ids.includes(id)).paragraph_id;
        assert.notEqual(paragraphFor(worksheet.questions[3].evidence_ids[0]), paragraphFor(worksheet.questions[3].evidence_ids[1]));
      }
      assert.equal(worksheet.questions[3].required_inference_steps, 1);
      }
    }
  }
}

{
  const lengths = ["short", "standard", "long"].map((length) =>
    generateWorksheet({ grade: 1, profile: 3, length, seed: "length-order", topic: "school" }));
  assert.ok(lengths[0].passage.character_count < lengths[1].passage.character_count);
  assert.ok(lengths[1].passage.character_count < lengths[2].passage.character_count);
  assert.equal(generateWorksheet({ grade: 1, profile: 3, seed: "default-length" }).story_length, "standard");
}

{
  const worksheet = generateWorksheet({ grade: 1, profile: 3, length: "standard", seed: "animal-story", topic: "animal", blueprintId: STORY_STANDARD_4Q_BLUEPRINT_ID });
  assert.equal(worksheet.story.category, "動物");
  assert.match(worksheet.passage.plainText, /こりすの　リリ/);
  assert.match(worksheet.passage.plainText, /うさぎの　モモ/);
  assert.equal(worksheet.story.setting_lexeme_id, "forest");
}

{
  const worksheet = generateWorksheet({ grade: 1, profile: 3, length: "standard", seed: "phrase-spacing", topic: "school", questionSetBlueprintId: STANDARD_READING_4Q_ID });
  assert.match(worksheet.passage.plainText, /、　/);
  assert.match(worksheet.passage.plainText, /。　/);
  assert.match(worksheet.questions[1].prompt.plainText, /とき、　/);
  assert.equal(worksheet.orthography.phrase_spacing, "ideographic-space-v0.1");
  assert.equal(worksheet.machine_checks.checks.find((check) => check.check_id === "phrase_spacing").passed, true);
}

{
  const allowedTraits = new Set(["あわてんぼう", "まけずぎらい", "こうきしんがつよい"]);
  for (let seed = 0; seed < 20; seed += 1) {
    const worksheet = generateWorksheet({ grade: 1, profile: 3, seed: `trait-${seed}`, blueprintId: STORY_STANDARD_4Q_BLUEPRINT_ID });
    assert.ok(allowedTraits.has(worksheet.story.protagonist.trait));
    assert.match(worksheet.passage.sentences.find((sentence) => sentence.role === "problem").plainText, /いそいだため/);
    assert.doesNotMatch(worksheet.passage.plainText, /こうきしんやな|てれやさんな|がまんづよいな|るのをだれより/);
  }
}

{
  const worksheet = generateWorksheet({ grade: 1, profile: 3, seed: "ruby-scopes", topic: "nature", blueprintId: STORY_STANDARD_4Q_BLUEPRINT_ID, questionSetBlueprintId: STANDARD_READING_4Q_ID });
  const park = worksheet.ruby_plan.filter((entry) => entry.lexeme_id === "park");
  const passage = park.filter((entry) => entry.scope === "passage");
  assert.equal(passage[0].render_ruby, true);
  assert.equal(passage[0].reason, "first_occurrence");
  assert.equal(passage[1].render_ruby, false);
  assert.equal(passage[1].reason, "repeat_occurrence");
  for (const scope of ["title", "passage", "question_q2", "answer_q2"]) {
    assert.equal(park.find((entry) => entry.scope === scope)?.render_ruby, true, `${scope} should reset ruby`);
  }
  const feeling = worksheet.ruby_plan.filter((entry) => entry.lexeme_id === "feeling");
  for (const scope of ["question_q2", "question_q4", "answer_q4"]) {
    assert.equal(feeling.find((entry) => entry.scope === scope)?.render_ruby, true, `${scope} should reset ruby`);
  }
}

{
  const worksheet = generateWorksheet({ grade: 1, profile: 3, seed: "grade1-known-kanji-ruby", topic: "animal", blueprintId: STORY_STANDARD_4Q_BLUEPRINT_ID });
  const forest = worksheet.ruby_plan.filter((entry) => entry.lexeme_id === "forest");
  const passage = forest.filter((entry) => entry.scope === "passage");
  assert.ok(passage.length >= 2);
  assert.equal(passage[0].surface, "森");
  assert.equal(passage[0].reason, "first_occurrence");
  assert.equal(passage[0].render_ruby, true, "grade 1 known kanji must receive ruby on first occurrence");
  assert.equal(passage[1].reason, "repeat_occurrence");
  assert.equal(passage[1].render_ruby, false);
  assert.equal(worksheet.orthography.mode, "grade1_all_kanji_first_occurrence_ruby");
}

{
  const worksheet = generateWorksheet({ grade: 3, profile: 3, seed: "known-kanji", topic: "nature", blueprintId: STORY_STANDARD_4Q_BLUEPRINT_ID });
  const park = worksheet.ruby_plan.filter((entry) => entry.lexeme_id === "park");
  assert.ok(park.length >= 4);
  assert.ok(park.every((entry) => entry.reason === "grade_known" && !entry.render_ruby));
}

{
  const worksheet = generateWorksheet({ grade: 1, profile: 5, seed: "orthography" });
  const known = getKnownKanjiSet(worksheet.grade);
  const firstRubyByScope = new Set();
  for (const occurrence of worksheet.ruby_plan) {
    const key = `${occurrence.scope}:${occurrence.lexeme_id}`;
    const hasUnknownKanji = Array.from(occurrence.surface)
      .some((character) => /\p{Script=Han}/u.test(character) && !known.has(character));
    const hasKanji = /\p{Script=Han}/u.test(occurrence.surface);
    const requiresRubySupport = hasKanji && (worksheet.grade === 1 || hasUnknownKanji);
    if (requiresRubySupport && !firstRubyByScope.has(key)) {
      assert.equal(occurrence.reason, "first_occurrence");
      assert.equal(occurrence.render_ruby, true);
      firstRubyByScope.add(key);
    } else if (requiresRubySupport) {
      assert.equal(occurrence.reason, "repeat_occurrence");
      assert.equal(occurrence.render_ruby, false);
    } else {
      assert.equal(occurrence.reason, "grade_known");
    }
  }
  assert.equal(worksheet.orthography.vocabulary_source, "prototype_lexicon");
  assert.equal(worksheet.orthography.vocabulary_database_used, false);
  assert.equal(
    worksheet.orthography.vocabulary_candidate_database_consulted,
    "vocabulary-db.v0.1-ninjal-2009b-candidate",
  );
  assert.equal(
    worksheet.generation_provenance.vocabulary_candidate_database_release,
    worksheet.orthography.vocabulary_candidate_database_consulted,
  );
  assert.equal(
    worksheet.orthography.vocabulary_candidate_evidence_scope,
    "prototype_lexicon_occurrences_only",
  );
  assert.equal(
    worksheet.machine_checks.checks.find(
      (check) => check.check_id === "vocabulary_band_candidate_evidence",
    ).passed,
    true,
  );
  assert.equal(
    worksheet.vocabulary_audit.checked_occurrence_count,
    worksheet.ruby_plan.length,
  );
  assert.ok(worksheet.vocabulary_audit.checked_lexeme_count > 0);
  assert.ok(worksheet.vocabulary_audit.occurrences.every(
    (occurrence) =>
      occurrence.grade_band === "lower_elementary_1_3"
      && occurrence.source_lexeme_id?.startsWith("ninjal-ebv-2009b-"),
  ));
  assert.equal(Object.keys(PROTOTYPE_LEXICON).length > 0, true);
}

{
  const worksheet = generateWorksheet({
    grade: 1,
    profile: 3,
    seed: "reject-tampered-vocabulary-audit",
    topic: "school",
  });
  worksheet.vocabulary_audit.occurrences[0].grade_band = "upper_elementary_4_6";
  const checks = runMachineChecks(worksheet);
  assert.equal(checks.all_passed, false, "tampered vocabulary evidence must fail");
  assert.equal(
    checks.checks.find(
      (check) => check.check_id === "vocabulary_band_candidate_evidence",
    ).passed,
    false,
  );
}

{
  const worksheet = generateWorksheet({
    grade: 1,
    profile: 4,
    seed: "reject-tampered-late-arrival-role",
    topic: "town",
    blueprintId: STORY_LATE_ARRIVAL_4Q_BLUEPRINT_ID,
    questionSetBlueprintId: STANDARD_READING_4Q_ID,
  });
  const lateArrivalSentence = worksheet.passage.sentences.find((sentence) => sentence.role === "late_arrival");
  lateArrivalSentence.role = "detail_after";
  const checks = runMachineChecks(worksheet);
  assert.equal(checks.all_passed, false, "removing the late-arrival role must fail");
  assert.equal(
    checks.checks.find((check) => check.check_id === "late_arrival_character_contract").passed,
    false,
  );
}

{
  const worksheet = generateWorksheet({ grade: 2, profile: 4, seed: 20260715, topic: "home" });
  assert.equal(worksheet.lifecycle_status, "automated_checks_passed");
  assert.equal(worksheet.usage_class, "development_preview");
  assert.equal(worksheet.child_use_permitted, false);
  assert.equal(worksheet.manual_check.status, "not_started");
  assert.equal(worksheet.calibration.status, "not_calibrated");
  assert.equal(worksheet.generation_provenance.model, null);
  assert.equal(worksheet.generation_provenance.generated_at, null);
  assert.match(worksheet.generation_provenance.database_release, /candidate/);
  assert.equal(worksheet.machine_checks.quality_assessment.status, "not_formally_assessed");
  assert.equal(worksheet.story.category, "家庭");
}

{
  const worksheet = generateWorksheet({ grade: 1, profile: 3, seed: "reject-wrong-choice", topic: "school", questionSetBlueprintId: STANDARD_READING_4Q_ID });
  const q2 = worksheet.questions[1];
  const wrongChoice = q2.choices.find((choice) => !choice.is_correct);
  q2.choices.forEach((choice) => { choice.is_correct = choice === wrongChoice; });
  q2.correct_choice_id = wrongChoice.choice_id;
  const checks = runMachineChecks(worksheet);
  assert.equal(checks.all_passed, false, "a structurally unique but semantically wrong choice must fail");
  assert.equal(checks.checks.find((check) => check.check_id === "template_answer_evidence_contract").passed, false);
}

for (const questionSetBlueprintId of [CAUSAL_TRACE_6Q_ID, CONTEXT_AND_INFERENCE_4Q_ID]) {
  const worksheet = generateWorksheet({
    grade: 1,
    profile: 3,
    seed: `reject-wrong-choice-${questionSetBlueprintId}`,
    topic: "school",
    questionSetBlueprintId,
  });
  const choiceQuestion = worksheet.questions.find((question) => "choices" in question);
  const wrongChoice = choiceQuestion.choices.find((choice) => !choice.is_correct);
  choiceQuestion.choices.forEach((choice) => { choice.is_correct = choice === wrongChoice; });
  choiceQuestion.correct_choice_id = wrongChoice.choice_id;
  const checks = runMachineChecks(worksheet);
  assert.equal(checks.all_passed, false, `${questionSetBlueprintId} must reject a semantically wrong choice`);
  assert.equal(checks.checks.find((check) => check.check_id === "template_answer_evidence_contract").passed, false);
}

{
  const worksheet = generateWorksheet({ grade: 1, profile: 3, seed: "reject-wrong-response", topic: "home", blueprintId: STORY_STANDARD_4Q_BLUEPRINT_ID, questionSetBlueprintId: STANDARD_READING_4Q_ID });
  worksheet.questions[3].answer = {
    plainText: "うれしい気持ち。",
    segments: [{ type: "text", text: "うれしい気持ち。" }],
  };
  const checks = runMachineChecks(worksheet);
  assert.equal(checks.all_passed, false, "a model response opposed to the evidence must fail");
  assert.equal(checks.checks.find((check) => check.check_id === "template_answer_evidence_contract").passed, false);
}

{
  const worksheet = generateWorksheet({ grade: 1, profile: 3, seed: "reject-missing-ruby", topic: "nature" });
  const first = worksheet.ruby_plan.find((entry) => entry.reason === "first_occurrence" && entry.scope === "passage");
  first.render_ruby = false;
  const sentence = worksheet.passage.sentences.find((entry) => entry.sentence_id === first.location_id);
  const segmentIndex = sentence.segments.findIndex((segment) => segment.lexeme_id === first.lexeme_id);
  sentence.segments[segmentIndex] = { type: "text", text: first.surface, lexeme_id: first.lexeme_id };
  const checks = runMachineChecks(worksheet);
  assert.equal(checks.all_passed, false, "removing first-occurrence ruby from plan and segments must fail");
  assert.equal(checks.checks.find((check) => check.check_id === "first_occurrence_ruby_scopes").passed, false);
}

{
  for (let seed = 0; seed < 60; seed += 1) {
    const worksheet = generateWorksheet({ grade: 1, profile: 5, seed: `detail-consistency-${seed}`, blueprintId: STORY_STANDARD_4Q_BLUEPRINT_ID });
    assert.doesNotMatch(worksheet.passage.plainText, /まどから|約束したとおり/);
  }
}

for (const invalid of [
  { grade: 0, profile: 1, seed: "x" },
  { grade: 1, profile: 6, seed: "x" },
  { grade: 1, profile: 1, length: "huge", seed: "x" },
  { grade: 1, profile: 1, seed: "" },
  { grade: 1, profile: 1, seed: null },
]) {
  assert.throws(() => generateWorksheet(invalid));
}

console.log("kokugo-no-tane generator tests passed");
