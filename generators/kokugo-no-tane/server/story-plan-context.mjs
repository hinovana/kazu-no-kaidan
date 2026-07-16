import { readFileSync } from "node:fs";
import { PROTOTYPE_LEXICON } from "../src/prototype-lexicon.js";
import { STORY_PLAN_CONTEXT_VERSION } from "../src/story-plan-schema.js";

const dataRoot = new URL("../data/generated/", import.meta.url);
const manifest = readJson(new URL("language-db.manifest.json", dataRoot));
const vocabularyManifest = readJson(new URL("vocabulary-db.manifest.json", dataRoot));
const kanjiByGrade = new Map([1, 2, 3].map((grade) => [
  grade,
  readJson(new URL(`kanji-grade-${grade}.json`, dataRoot)),
]));

export function buildStoryPlanContext(grade) {
  const selectedGrade = Number(grade);
  if (![1, 2, 3].includes(selectedGrade)) throw new RangeError("grade must be 1, 2, or 3");
  const cumulativeKanji = [...kanjiByGrade.entries()]
    .filter(([allocationGrade]) => allocationGrade <= selectedGrade)
    .flatMap(([, database]) => database.records.map((record) => record.character));

  return {
    context_version: STORY_PLAN_CONTEXT_VERSION,
    target_grade: selectedGrade,
    language_database: {
      database_release: manifest.database_release,
      release_status: manifest.release_status,
      contents: manifest.contents.scope,
      allocated_kanji_through_grade: cumulativeKanji.join(""),
      allocated_kanji_count: cumulativeKanji.length,
      warning: "かんじはいちらんをくだりぶんのひょうきけんしょうにつかうだけでせっけいずにはかんじをかかない",
    },
    vocabulary_database: {
      status: "candidate_unreviewed_not_connected",
      guarantee: "ごいのがくねんてきごうをほしょうしない",
      candidate_database_release: vocabularyManifest.database_release,
      candidate_record_count: vocabularyManifest.contents.total_record_count,
      candidate_grade_bands: vocabularyManifest.contents.included_grade_bands,
      generation_eligible: false,
      prototype_lexicon: Object.entries(PROTOTYPE_LEXICON).map(([id, entry]) => ({ id, ...entry })),
    },
    reference_design_anchors: [
      {
        id: "ANCHOR-RUBY-Q12",
        reusable_feature: "ねんれいそうおうのごいとしょしゅつのよみしえんをわける",
      },
      {
        id: "ANCHOR-RUBY-Q18",
        reusable_feature: "おなじごのさいしょだけよみをしめしさいしゅつではしょうりゃくできる",
      },
    ],
  };
}

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}
