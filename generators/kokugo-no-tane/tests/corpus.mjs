import assert from "node:assert/strict";
import { LENGTH_SETTINGS, generateWorksheet } from "../domain/generation/generate-worksheet.ts";
import {
  STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID,
} from "../domain/blueprints/story-clue-discovery/blueprint.ts";
import {
  STORY_STANDARD_4Q_BLUEPRINT_ID,
} from "../domain/blueprints/story-retry-craft/blueprint.ts";
import {
  STORY_LATE_ARRIVAL_4Q_BLUEPRINT_ID,
} from "../domain/blueprints/story-late-arrival/blueprint.ts";
import {
  CAUSAL_TRACE_6Q_ID,
  CONTEXT_AND_INFERENCE_4Q_ID,
  STANDARD_READING_4Q_ID,
} from "../domain/questions/question-set-registry.ts";

const QUESTION_COUNTS = new Map([
  [STANDARD_READING_4Q_ID, 4],
  [CAUSAL_TRACE_6Q_ID, 6],
  [CONTEXT_AND_INFERENCE_4Q_ID, 4],
]);

function countPassageKanji(text) {
  const counts = new Map();
  for (const character of text) {
    if (!/\p{Script=Han}/u.test(character)) continue;
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  return counts;
}

let generated = 0;
const failures = [];
const qualityMetrics = new Map(Object.keys(LENGTH_SETTINGS).map((length) => [length, {
  worksheets: 0,
  characters: 0,
  sentences: 0,
  narrativeFunctions: 0,
  directEvidenceSentences: 0,
  unusedMeaningfulSentences: 0,
  references: 0,
  resolvedReferences: 0,
  unresolvedReferences: 0,
  distinctKanji: 0,
  repeatedDistinctKanji: 0,
  minimumDistinctKanji: Number.POSITIVE_INFINITY,
  minimumRepeatedDistinctKanji: Number.POSITIVE_INFINITY,
}]));

for (let grade = 1; grade <= 3; grade += 1) {
  for (let profile = 1; profile <= 5; profile += 1) {
    for (const length of Object.keys(LENGTH_SETTINGS)) {
      const storySurfaces = new Set();
      const choicePositions = new Set();
      const blueprintIds = new Set();
      const questionSetIds = new Set();
      const layoutSignatures = new Set();
      const firstEvidencePositions = new Set();
      for (let index = 0; index < 30; index += 1) {
        try {
          const worksheet = generateWorksheet({
            grade,
            profile,
            length,
            seed: `corpus-g${grade}-p${profile}-${length}-${index}`,
          });
          generated += 1;
          storySurfaces.add(worksheet.passage.plainText);
          blueprintIds.add(worksheet.blueprint_id);
          questionSetIds.add(worksheet.question_set_blueprint_id);
          layoutSignatures.add(worksheet.questions.map((question) => question.answer_layout.kind).join(","));
          worksheet.questions
            .filter((question) => "choices" in question)
            .forEach((question) => choicePositions.add(question.correct_choice_id));
          const [minimum, maximum] = LENGTH_SETTINGS[length].character_band;
          assert.ok(worksheet.passage.character_count >= minimum);
          assert.ok(worksheet.passage.character_count <= maximum);
          assert.equal(worksheet.machine_checks.all_passed, true);
          assert.equal(worksheet.lifecycle_status, "automated_checks_passed");
          assert.equal(worksheet.usage_class, "development_preview");
          assert.equal(worksheet.child_use_permitted, false);
          assert.equal(worksheet.story_length, length);
          assert.ok(worksheet.passage.plainText.includes("　"));
          assert.equal(worksheet.questions.length, QUESTION_COUNTS.get(worksheet.question_set_blueprint_id));
          const sentenceIds = new Set(worksheet.passage.sentences.map((sentence) => sentence.sentence_id));
          const sentenceRoles = new Map(worksheet.passage.sentences.map((sentence, position) => [sentence.role, position]));
          const sentencePosition = (id) => worksheet.passage.sentences.findIndex((sentence) => sentence.sentence_id === id);
          firstEvidencePositions.add(sentencePosition(worksheet.questions[0].evidence_ids[0]));
          assert.ok(worksheet.questions.every((question) => {
            assert.match(question.question_pattern_id, /^QP_/u);
            assert.match(question.answer_layout.answer_layout_id, /^AL_/u);
            if ("choices" in question) {
              assert.equal(question.choices.filter((choice) => choice.is_correct).length, 1);
            }
            return question.evidence_ids.length > 0 && question.evidence_ids.every((id) => sentenceIds.has(id));
          }));
          const emotionQuestion = worksheet.questions.find((question) => question.type === "infer_emotion");
          assert.ok(emotionQuestion);
          assert.equal(emotionQuestion.scoring_elements.length, 2);
          const emotionPositions = emotionQuestion.evidence_ids.map((id) =>
            worksheet.passage.sentences.findIndex((sentence) => sentence.sentence_id === id));
          assert.equal(emotionPositions[1] - emotionPositions[0], [1, 1, 2, 3, 5][profile - 1]);

          const directEvidenceIds = new Set(worksheet.questions.flatMap((question) => question.evidence_ids));
          const referencedSentences = worksheet.passage.sentences.filter((sentence) => sentence.reference_target_role !== null);
          const resolvedReferences = referencedSentences.filter((sentence) =>
            sentenceRoles.has(sentence.reference_target_role)
              && sentenceRoles.get(sentence.reference_target_role) < sentenceRoles.get(sentence.role));
          const metric = qualityMetrics.get(length);
          metric.worksheets += 1;
          metric.characters += worksheet.passage.character_count;
          metric.sentences += worksheet.passage.sentences.length;
          metric.narrativeFunctions += new Set(
            worksheet.passage.sentences.map((sentence) => sentence.narrative_function),
          ).size;
          metric.directEvidenceSentences += directEvidenceIds.size;
          metric.unusedMeaningfulSentences += worksheet.passage.sentences.filter((sentence) =>
            sentence.narrative_function && !directEvidenceIds.has(sentence.sentence_id)).length;
          metric.references += referencedSentences.length;
          metric.resolvedReferences += resolvedReferences.length;
          metric.unresolvedReferences += referencedSentences.length - resolvedReferences.length;
          assert.equal(referencedSentences.length, resolvedReferences.length);
          assert.equal(
            worksheet.machine_checks.checks.find((check) => check.check_id === "narrative_semantics").passed,
            true,
          );
          const passageKanjiCounts = countPassageKanji(worksheet.passage.plainText);
          const repeatedDistinctKanji = [...passageKanjiCounts.values()]
            .filter((count) => count >= 2).length;
          metric.distinctKanji += passageKanjiCounts.size;
          metric.repeatedDistinctKanji += repeatedDistinctKanji;
          metric.minimumDistinctKanji = Math.min(metric.minimumDistinctKanji, passageKanjiCounts.size);
          metric.minimumRepeatedDistinctKanji = Math.min(
            metric.minimumRepeatedDistinctKanji,
            repeatedDistinctKanji,
          );
          assert.ok(passageKanjiCounts.size >= 5);
          assert.ok(repeatedDistinctKanji >= 5);
          for (const checkId of [
            "passage_kanji_variety",
            "passage_kanji_recurrence",
            "passage_kanji_grade_range",
          ]) {
            assert.equal(
              worksheet.machine_checks.checks.find((check) => check.check_id === checkId).passed,
              true,
            );
          }
        } catch (error) {
          failures.push({ grade, profile, length, index, message: error.message });
        }
      }
      assert.ok(storySurfaces.size >= 12, `insufficient story variation for grade ${grade}, profile ${profile}, length ${length}`);
      assert.ok(choicePositions.size >= 2, `insufficient choice variation for grade ${grade}, profile ${profile}, length ${length}`);
      assert.ok(firstEvidencePositions.size >= 3, `first-question evidence is too predictable for grade ${grade}, profile ${profile}, length ${length}`);
      assert.equal(layoutSignatures.size, 3, `answer layout variation is missing for grade ${grade}, profile ${profile}, length ${length}`);
      assert.deepEqual(blueprintIds, new Set([
        STORY_STANDARD_4Q_BLUEPRINT_ID,
        STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID,
        STORY_LATE_ARRIVAL_4Q_BLUEPRINT_ID,
      ]));
      assert.deepEqual(questionSetIds, new Set(QUESTION_COUNTS.keys()));
    }
  }
}

assert.deepEqual(failures, []);
assert.equal(generated, 3 * 5 * 3 * 30);
console.log(`kokugo-no-tane corpus passed: ${generated} worksheets`);
for (const [length, metric] of qualityMetrics) {
  const average = (value) => Math.round((value / metric.worksheets) * 10) / 10;
  const directEvidenceRate = Math.round(
    (metric.directEvidenceSentences / metric.sentences) * 1_000,
  ) / 10;
  console.log(
    `${length}: characters=${average(metric.characters)}, sentences=${average(metric.sentences)}, `
      + `narrative_functions=${average(metric.narrativeFunctions)}, direct_evidence_rate=${directEvidenceRate}%, `
      + `unused_meaningful=${average(metric.unusedMeaningfulSentences)}, `
      + `references=${metric.resolvedReferences}/${metric.references}, unresolved=${metric.unresolvedReferences}, `
      + `kanji_distinct=${average(metric.distinctKanji)}(min ${metric.minimumDistinctKanji}), `
      + `kanji_repeated=${average(metric.repeatedDistinctKanji)}(min ${metric.minimumRepeatedDistinctKanji})`,
  );
}
