import {
  STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID,
} from "../../domain/blueprints/story-clue-discovery/blueprint.ts";
import {
  STORY_LATE_ARRIVAL_4Q_BLUEPRINT_ID,
} from "../../domain/blueprints/story-late-arrival/blueprint.ts";
import {
  STORY_STANDARD_4Q_BLUEPRINT_ID,
} from "../../domain/blueprints/story-retry-craft/blueprint.ts";

const BASE_OPTIONS = Object.freeze({
  grade: 1,
  profile: 3,
  topic: "animal",
});

const STRUCTURES = Object.freeze([
  {
    structureId: "retry-craft",
    blueprintId: STORY_STANDARD_4Q_BLUEPRINT_ID,
    seed: "human-review-0",
    focus: "失敗、友だちに見られた状況、反応、やり直しの因果",
  },
  {
    structureId: "clue-discovery",
    blueprintId: STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID,
    seed: "human-review-1",
    focus: "具体的な観察、予想、照合、理解、うなずく反応の因果",
  },
  {
    structureId: "late-arrival",
    blueprintId: STORY_LATE_ARRIVAL_4Q_BLUEPRINT_ID,
    seed: "human-review-3",
    focus: "第三人物の登場、働きかけ、主人公の理解と反応の因果",
  },
]);

export const PASSAGE_QUALITY_REVIEW_CASES = Object.freeze(
  STRUCTURES.flatMap((structure) => ["short", "standard", "long"].map((length) => Object.freeze({
    id: `${structure.structureId}-${length}`,
    expectedBlueprintId: structure.blueprintId,
    focus: structure.focus,
    options: Object.freeze({
      ...BASE_OPTIONS,
      length,
      seed: structure.seed,
    }),
  }))),
);

export const PASSAGE_QUALITY_NEGATIVE_FIXTURES = Object.freeze({
  danglingReferenceTarget: "missing_hypothesis",
  unsupportedModelAnswer: "うれしい気もち。",
  retiredPassageFragments: Object.freeze([
    "みつけたことをゆっくりはなしました",
    "はじめのよそうとくらべました",
    "あたりにはやわらかいひかりがひろがっていました",
    "じぶんがするところをわけました",
  ]),
});
