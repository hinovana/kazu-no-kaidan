import assert from "node:assert/strict";
import { STORY_PLAN_INSTRUCTIONS } from "../server/openai-story-plan.mjs";
import { buildStoryPlanContext } from "../server/story-plan-context.mjs";

const grade1 = buildStoryPlanContext(1);
const grade2 = buildStoryPlanContext(2);
const grade3 = buildStoryPlanContext(3);

assert.equal(grade1.language_database.allocated_kanji_count, 80);
assert.equal(grade2.language_database.allocated_kanji_count, 240);
assert.equal(grade3.language_database.allocated_kanji_count, 440);
assert.equal(grade1.language_database.database_release, "language-db.v0.1-kanji-candidate");
assert.equal(grade1.language_database.release_status, "candidate_pending_manual_check");
assert.equal(grade1.vocabulary_database.status, "candidate_unreviewed_not_connected");
assert.equal(
  grade1.vocabulary_database.candidate_database_release,
  "vocabulary-db.v0.1-ninjal-2009b-candidate",
);
assert.equal(grade1.vocabulary_database.candidate_record_count, 15485);
assert.deepEqual(grade1.vocabulary_database.candidate_grade_bands, [
  "lower_elementary_1_3",
  "upper_elementary_4_6",
]);
assert.equal(grade1.vocabulary_database.generation_eligible, false);
assert.ok(grade1.vocabulary_database.prototype_lexicon.length > 0);
assert.deepEqual(
  grade1.reference_design_anchors.map((anchor) => anchor.id),
  ["ANCHOR-RUBY-Q12", "ANCHOR-RUBY-Q18"],
);
assert.match(STORY_PLAN_INSTRUCTIONS, /良問に変換できる設計図の条件/u);
assert.match(STORY_PLAN_INSTRUCTIONS, /合成例/u);
assert.match(STORY_PLAN_INSTRUCTIONS, /実在教材の転載や言い換えではなく/u);
assert.match(STORY_PLAN_INSTRUCTIONS, /心情を推論/u);
assert.match(STORY_PLAN_INSTRUCTIONS, /地図の目印/u);
assert.doesNotMatch(STORY_PLAN_INSTRUCTIONS, /早稲田|早稲アカ/u);

console.log("kokugo-no-tane story plan context tests passed");
