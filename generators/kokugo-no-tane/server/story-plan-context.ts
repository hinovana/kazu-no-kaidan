import { readFileSync } from "node:fs";
import { PROTOTYPE_LEXICON } from "../infrastructure/language/prototype-language-data-provider.ts";
import { PROTOTYPE_VOCABULARY_EVIDENCE } from "../src/generated/prototype-vocabulary-evidence.ts";
import { STORY_PLAN_CONTEXT_VERSION } from "../domain/schemas/story-plan-v1.ts";
import type { Grade } from "../domain/types/generation.js";

interface LanguageManifest {
  readonly database_release: string;
  readonly release_status: string;
  readonly contents: { readonly scope: string };
}

interface VocabularyManifest {
  readonly database_release: string;
  readonly contents: {
    readonly total_record_count: number;
    readonly included_grade_bands: readonly string[];
  };
}

interface KanjiDatabase {
  readonly records: readonly { readonly character: string }[];
}

const dataRoot = new URL("../data/generated/", import.meta.url);
const manifest = readJson<LanguageManifest>(new URL("language-db.manifest.json", dataRoot));
const vocabularyManifest = readJson<VocabularyManifest>(new URL("vocabulary-db.manifest.json", dataRoot));
const kanjiByGrade = new Map<Grade, KanjiDatabase>(([1, 2, 3] as const).map((grade) => [
  grade,
  readJson<KanjiDatabase>(new URL(`kanji-grade-${grade}.json`, dataRoot)),
] as const));

export function buildStoryPlanContext(grade: unknown) {
  const selectedGrade = Number(grade);
  if (!isGrade(selectedGrade)) throw new RangeError("grade must be 1, 2, or 3");
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
      status: "candidate_unreviewed_audit_projection_only",
      guarantee: "ごいのがくねんてきごうをほしょうしない",
      candidate_database_release: vocabularyManifest.database_release,
      candidate_record_count: vocabularyManifest.contents.total_record_count,
      candidate_grade_bands: vocabularyManifest.contents.included_grade_bands,
      generation_eligible: false,
      audit_projection_scope: "prototype_lexicon_occurrences_only",
      audit_projection_lexeme_count: Object.keys(PROTOTYPE_VOCABULARY_EVIDENCE).length,
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

function readJson<T>(url: URL): T {
  return JSON.parse(readFileSync(url, "utf8")) as T;
}

function isGrade(value: number): value is Grade {
  return value === 1 || value === 2 || value === 3;
}
