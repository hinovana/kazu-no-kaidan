import assert from "node:assert/strict";
import { LENGTH_SETTINGS, generateWorksheet } from "../domain/generation/generate-worksheet.ts";
import {
  STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID,
} from "../domain/blueprints/story-clue-discovery/blueprint.ts";
import {
  STORY_STANDARD_4Q_BLUEPRINT_ID,
} from "../domain/blueprints/story-retry-craft/blueprint.ts";

let generated = 0;
const failures = [];

for (let grade = 1; grade <= 3; grade += 1) {
  for (let profile = 1; profile <= 5; profile += 1) {
    for (const length of Object.keys(LENGTH_SETTINGS)) {
      const storySurfaces = new Set();
      const choicePositions = new Set();
      const blueprintIds = new Set();
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
          choicePositions.add(worksheet.questions[1].correct_choice_id);
          blueprintIds.add(worksheet.blueprint_id);
          const [minimum, maximum] = LENGTH_SETTINGS[length].character_band;
          assert.ok(worksheet.passage.character_count >= minimum);
          assert.ok(worksheet.passage.character_count <= maximum);
          assert.equal(worksheet.machine_checks.all_passed, true);
          assert.equal(worksheet.lifecycle_status, "automated_checks_passed");
          assert.equal(worksheet.usage_class, "development_preview");
          assert.equal(worksheet.child_use_permitted, false);
          assert.equal(worksheet.story_length, length);
          assert.ok(worksheet.passage.plainText.includes("　"));
          assert.equal(worksheet.questions.length, 4);
          assert.equal(worksheet.questions[1].choices.filter((choice) => choice.is_correct).length, 1);
          const sentenceIds = new Set(worksheet.passage.sentences.map((sentence) => sentence.sentence_id));
          assert.ok(worksheet.questions.every((question) =>
            question.evidence_ids.length > 0 && question.evidence_ids.every((id) => sentenceIds.has(id))));
          assert.equal(worksheet.questions[3].scoring_elements.length, 2);
          const q4Positions = worksheet.questions[3].evidence_ids.map((id) =>
            worksheet.passage.sentences.findIndex((sentence) => sentence.sentence_id === id));
          assert.equal(q4Positions[1] - q4Positions[0], [1, 1, 2, 3, 5][profile - 1]);
        } catch (error) {
          failures.push({ grade, profile, length, index, message: error.message });
        }
      }
      assert.ok(storySurfaces.size >= 12, `insufficient story variation for grade ${grade}, profile ${profile}, length ${length}`);
      assert.ok(choicePositions.size >= 2, `insufficient choice variation for grade ${grade}, profile ${profile}, length ${length}`);
      assert.deepEqual(blueprintIds, new Set([
        STORY_STANDARD_4Q_BLUEPRINT_ID,
        STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID,
      ]));
    }
  }
}

assert.deepEqual(failures, []);
assert.equal(generated, 3 * 5 * 3 * 30);
console.log(`kokugo-no-tane corpus passed: ${generated} worksheets`);
