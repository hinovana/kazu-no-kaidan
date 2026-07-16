import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildVocabularyDb } from "../scripts/build-vocabulary-db.mjs";
import { importVocabulary } from "../scripts/import-vocabulary.mjs";
import { validateVocabularyDatabase } from "../scripts/validate-vocabulary-db.mjs";

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
