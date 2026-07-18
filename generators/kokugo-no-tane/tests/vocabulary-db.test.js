import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildVocabularyDb } from "../scripts/build-vocabulary-db.mjs";
import { buildGeneratorVocabularyProjection } from "../scripts/build-generator-vocabulary-projection.mjs";
import { importVocabulary } from "../scripts/import-vocabulary.mjs";
import { validateVocabularyDatabase } from "../scripts/validate-vocabulary-db.mjs";
import { PROTOTYPE_LEXICON } from "../src/prototype-lexicon.js";
import {
  PROTOTYPE_VOCABULARY_EVIDENCE,
  VOCABULARY_CANDIDATE_DATABASE_RELEASE,
} from "../src/generated/prototype-vocabulary-evidence.js";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const GENERATOR_DIR = resolve(TEST_DIR, "..");
const SOURCES_DIR = resolve(GENERATOR_DIR, "data/sources");
const GENERATED_DIR = resolve(GENERATOR_DIR, "data/generated");
const NORMALIZED_PATH = resolve(GENERATOR_DIR, "data/normalized/vocabulary-candidate.json");
const REGISTRY_PATH = resolve(SOURCES_DIR, "source-registry.json");
const SOURCE_PATH = resolve(SOURCES_DIR, "kyoikukihongoi_2009B.csv");
const FILE_NAMES = [
  "vocabulary-db.manifest.json",
  "vocabulary-lower-elementary.json",
  "vocabulary-upper-elementary.json",
];

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

await validateVocabularyDatabase();

const lower = await readJson(resolve(GENERATED_DIR, "vocabulary-lower-elementary.json"));
const upper = await readJson(resolve(GENERATED_DIR, "vocabulary-upper-elementary.json"));
assert.equal(lower.grade_band, "lower_elementary_1_3");
assert.equal(lower.record_count, 6865);
assert.equal(upper.grade_band, "upper_elementary_4_6");
assert.equal(upper.record_count, 8620);
assert.equal(lower.records.length + upper.records.length, 15485);
assert.ok([...lower.records, ...upper.records].every(
  (record) =>
    record.manual_check_status === "pending" &&
    record.usage_status === "candidate_unreviewed" &&
    record.active_for_generation === false,
));
assert.equal(
  VOCABULARY_CANDIDATE_DATABASE_RELEASE,
  "vocabulary-db.v0.1-ninjal-2009b-candidate",
);
assert.deepEqual(
  Object.keys(PROTOTYPE_VOCABULARY_EVIDENCE),
  Object.keys(PROTOTYPE_LEXICON),
);
for (const [id, entry] of Object.entries(PROTOTYPE_LEXICON)) {
  const evidence = PROTOTYPE_VOCABULARY_EVIDENCE[id];
  assert.equal(evidence.surface, entry.surface);
  assert.equal(evidence.reading, entry.reading);
  assert.equal(evidence.grade_band, "lower_elementary_1_3");
  assert.equal(evidence.source_allocation_code, 1);
}

const deterministicRoot = await mkdtemp(resolve(tmpdir(), "kokugo-vocabulary-db-"));
const normalizedPath = resolve(deterministicRoot, "vocabulary-candidate.json");
const outputA = resolve(deterministicRoot, "generated-a");
const outputB = resolve(deterministicRoot, "generated-b");
await importVocabulary({ outputPath: normalizedPath });
assert.deepEqual(
  await readFile(normalizedPath),
  await readFile(NORMALIZED_PATH),
  "fresh vocabulary import must byte-match the checked-in normalized candidate",
);
await buildVocabularyDb({ inputPath: normalizedPath, outputDir: outputA });
await buildVocabularyDb({ inputPath: normalizedPath, outputDir: outputB });
for (const fileName of FILE_NAMES) {
  assert.deepEqual(
    await readFile(resolve(outputA, fileName)),
    await readFile(resolve(outputB, fileName)),
    `${fileName} must be byte-identical across builds`,
  );
  assert.deepEqual(
    await readFile(resolve(outputA, fileName)),
    await readFile(resolve(GENERATED_DIR, fileName)),
    `${fileName} must byte-match the checked-in generated artifact`,
  );
}
const projectionA = resolve(deterministicRoot, "projection-a.js");
const projectionB = resolve(deterministicRoot, "projection-b.js");
await buildGeneratorVocabularyProjection({
  manifestPath: resolve(outputA, "vocabulary-db.manifest.json"),
  lowerPath: resolve(outputA, "vocabulary-lower-elementary.json"),
  upperPath: resolve(outputA, "vocabulary-upper-elementary.json"),
  outputPath: projectionA,
});
await buildGeneratorVocabularyProjection({
  manifestPath: resolve(outputB, "vocabulary-db.manifest.json"),
  lowerPath: resolve(outputB, "vocabulary-lower-elementary.json"),
  upperPath: resolve(outputB, "vocabulary-upper-elementary.json"),
  outputPath: projectionB,
});
assert.deepEqual(
  await readFile(projectionA),
  await readFile(projectionB),
  "generator vocabulary projections must be byte-identical",
);
assert.deepEqual(
  await readFile(projectionA),
  await readFile(resolve(GENERATOR_DIR, "src/generated/prototype-vocabulary-evidence.js")),
  "fresh generator projection must byte-match the checked-in artifact",
);
await assert.rejects(
  buildGeneratorVocabularyProjection({
    manifestPath: resolve(outputA, "vocabulary-db.manifest.json"),
    lowerPath: resolve(outputA, "vocabulary-lower-elementary.json"),
    upperPath: resolve(outputA, "vocabulary-upper-elementary.json"),
    outputPath: resolve(deterministicRoot, "upper-only-projection.js"),
    prototypeLexicon: {
      upper_only_example: { surface: "愛", reading: "あい" },
    },
  }),
  /upper_only=true/,
  "a lexeme supported only by the upper-elementary band must fail the prototype projection build",
);

const tamperRoot = await mkdtemp(resolve(tmpdir(), "kokugo-vocabulary-tamper-"));
const tamperGenerated = resolve(tamperRoot, "generated");
await cp(GENERATED_DIR, tamperGenerated, { recursive: true });
const tamperLowerPath = resolve(tamperGenerated, "vocabulary-lower-elementary.json");
const tamperLower = await readJson(tamperLowerPath);
tamperLower.records[0].active_for_generation = true;
await writeJson(tamperLowerPath, tamperLower);
await assert.rejects(
  validateVocabularyDatabase({ inputDir: tamperGenerated }),
  /unreviewed vocabulary must not be active for generation/,
);

console.log("kokugo-no-tane vocabulary DB tests passed");
