import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildLanguageDb } from "../scripts/build-language-db.mjs";
import { importKanji } from "../scripts/import-kanji.mjs";
import { validateGeneratedDatabase } from "../scripts/validate-language-db.mjs";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const GENERATOR_DIR = resolve(TEST_DIR, "..");
const SOURCES_DIR = resolve(GENERATOR_DIR, "data/sources");
const GENERATED_DIR = resolve(GENERATOR_DIR, "data/generated");
const NORMALIZED_PATH = resolve(GENERATOR_DIR, "data/normalized/kanji-candidate.json");
const REGISTRY_PATH = resolve(SOURCES_DIR, "source-registry.json");
const PRIMARY_PATH = resolve(SOURCES_DIR, "mext-elementary-curriculum-h29-kanji.json");
const CORROBORATING_PATH = resolve(
  SOURCES_DIR,
  "mext-elementary-japanese-explanation-h29-kanji.json",
);
const FILE_NAMES = [
  "language-db.manifest.json",
  "kanji-grade-1.json",
  "kanji-grade-2.json",
  "kanji-grade-3.json",
];

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function makeFixture(name) {
  const root = await mkdtemp(resolve(tmpdir(), `kokugo-language-db-${name}-`));
  const generated = resolve(root, "generated");
  const registry = resolve(root, "source-registry.json");
  await cp(GENERATED_DIR, generated, { recursive: true });
  await cp(REGISTRY_PATH, registry);
  return { generated, registry, root };
}

await validateGeneratedDatabase({
  inputDir: GENERATED_DIR,
  sourceRegistryPath: REGISTRY_PATH,
});

const gradeData = await Promise.all(
  [1, 2, 3].map((grade) => readJson(resolve(GENERATED_DIR, `kanji-grade-${grade}.json`))),
);
assert.deepEqual(
  gradeData.map((data) => data.records.length),
  [80, 160, 200],
  "学年別件数が80・160・200字である",
);
const allRecords = gradeData.flatMap((data) => data.records);
assert.equal(allRecords.length, 440, "累積件数が440字である");
assert.equal(new Set(allRecords.map((record) => record.character)).size, 440, "学年間に重複がない");
for (const record of allRecords) {
  assert.equal([...record.character].length, 1);
  assert.equal(record.normalized_form, record.normalized_form.normalize("NFC"));
  assert.equal(
    record.code_point,
    `U+${record.character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
  );
  assert.ok(record.source_locator.length > 0);
  assert.equal(record.manual_check_status, "pending");
}
for (const gradeDataEntry of gradeData) {
  assert.equal(gradeDataEntry.schema_version, "language-db.kanji-grade.v0.1");
  assert.equal(gradeDataEntry.database_release, "language-db.v0.1-kanji-candidate");
  assert.equal(gradeDataEntry.release_status, "candidate_pending_manual_check");
  assert.equal(gradeDataEntry.generated_at, null);
  assert.equal(
    gradeDataEntry.derivation_rule_version,
    "import-kanji.nfc-and-code-point.v0.1",
  );
}

const deterministicRoot = await mkdtemp(resolve(tmpdir(), "kokugo-language-db-deterministic-"));
const normalizedPath = resolve(deterministicRoot, "kanji-candidate.json");
const outputA = resolve(deterministicRoot, "generated-a");
const outputB = resolve(deterministicRoot, "generated-b");
await importKanji({ outputPath: normalizedPath });
await buildLanguageDb({ inputPath: normalizedPath, outputDir: outputA });
await buildLanguageDb({ inputPath: normalizedPath, outputDir: outputB });
assert.deepEqual(
  await readFile(normalizedPath),
  await readFile(NORMALIZED_PATH),
  "fresh import must byte-match the checked-in normalized candidate",
);
for (const fileName of FILE_NAMES) {
  assert.deepEqual(
    await readFile(resolve(outputA, fileName)),
    await readFile(resolve(outputB, fileName)),
    `${fileName} must be byte-identical across builds`,
  );
  assert.equal(await sha256(resolve(outputA, fileName)), await sha256(resolve(outputB, fileName)));
  assert.deepEqual(
    await readFile(resolve(outputA, fileName)),
    await readFile(resolve(GENERATED_DIR, fileName)),
    `${fileName} must byte-match the checked-in generated artifact`,
  );
}

const nonSourceFixture = await makeFixture("non-source-character");
const nonSourceGradePath = resolve(nonSourceFixture.generated, "kanji-grade-1.json");
const nonSourceGrade = await readJson(nonSourceGradePath);
nonSourceGrade.records[0] = {
  ...nonSourceGrade.records[0],
  character: "龍",
  normalized_form: "龍",
  code_point: "U+9F8D",
  source_form: "龍",
  corroborating_sources: nonSourceGrade.records[0].corroborating_sources.map((source) => ({
    ...source,
    source_form: "龍",
  })),
};
await writeJson(nonSourceGradePath, nonSourceGrade);
const nonSourceManifestPath = resolve(nonSourceFixture.generated, "language-db.manifest.json");
const nonSourceManifest = await readJson(nonSourceManifestPath);
nonSourceManifest.contents.files.find(
  (entry) => entry.file === "kanji-grade-1.json",
).sha256 = await sha256(nonSourceGradePath);
await writeJson(nonSourceManifestPath, nonSourceManifest);
await assert.rejects(
  validateGeneratedDatabase({
    inputDir: nonSourceFixture.generated,
    sourceRegistryPath: nonSourceFixture.registry,
  }),
  /character differs from the canonical source/,
);

for (const [name, field, value, expectedError] of [
  ["schema-version", "schema_version", "unexpected.schema", /unexpected schema_version/],
  ["release-status", "release_status", "released", /unexpected release_status/],
  ["generated-at", "generated_at", "2026-07-15T00:00:00Z", /generated_at must be null/],
  [
    "derivation-rule",
    "derivation_rule_version",
    "unrecognized.rule",
    /unexpected derivation_rule_version/,
  ],
  [
    "generation-policy",
    "generation_time_policy",
    "runtime timestamp included",
    /unexpected generation_time_policy/,
  ],
]) {
  const metadataFixture = await makeFixture(`grade-metadata-${name}`);
  const metadataGradePath = resolve(metadataFixture.generated, "kanji-grade-1.json");
  const metadataGrade = await readJson(metadataGradePath);
  metadataGrade[field] = value;
  await writeJson(metadataGradePath, metadataGrade);
  await assert.rejects(
    validateGeneratedDatabase({
      inputDir: metadataFixture.generated,
      sourceRegistryPath: metadataFixture.registry,
    }),
    expectedError,
  );
}

const duplicateFixture = await makeFixture("duplicate");
const duplicateGrade = await readJson(resolve(duplicateFixture.generated, "kanji-grade-2.json"));
duplicateGrade.records[0] = {
  ...duplicateGrade.records[0],
  character: duplicateGrade.records[1].character,
  normalized_form: duplicateGrade.records[1].normalized_form,
  code_point: duplicateGrade.records[1].code_point,
  source_form: duplicateGrade.records[1].source_form,
};
await writeJson(resolve(duplicateFixture.generated, "kanji-grade-2.json"), duplicateGrade);
await assert.rejects(
  validateGeneratedDatabase({
    inputDir: duplicateFixture.generated,
    sourceRegistryPath: duplicateFixture.registry,
  }),
  /duplicate character/,
);

const shortageFixture = await makeFixture("shortage");
const shortageGrade = await readJson(resolve(shortageFixture.generated, "kanji-grade-3.json"));
shortageGrade.records.pop();
shortageGrade.record_count = shortageGrade.records.length;
await writeJson(resolve(shortageFixture.generated, "kanji-grade-3.json"), shortageGrade);
await assert.rejects(
  validateGeneratedDatabase({
    inputDir: shortageFixture.generated,
    sourceRegistryPath: shortageFixture.registry,
  }),
  /expected 200 records, got 199/,
);

const sourceFixture = await makeFixture("source-reference");
const sourceGrade = await readJson(resolve(sourceFixture.generated, "kanji-grade-1.json"));
sourceGrade.records[0].source_id = "missing_source";
await writeJson(resolve(sourceFixture.generated, "kanji-grade-1.json"), sourceGrade);
await assert.rejects(
  validateGeneratedDatabase({
    inputDir: sourceFixture.generated,
    sourceRegistryPath: sourceFixture.registry,
  }),
  /unknown source_id missing_source/,
);

const licenseFixture = await makeFixture("license");
const licenseRegistry = await readJson(licenseFixture.registry);
licenseRegistry.sources[0].license_status = "analysis_only";
await writeJson(licenseFixture.registry, licenseRegistry);
await assert.rejects(
  buildLanguageDb({
    inputPath: NORMALIZED_PATH,
    sourceRegistryPath: licenseFixture.registry,
    outputDir: resolve(licenseFixture.root, "must-not-build"),
  }),
  /has license_status=analysis_only/,
);
await assert.rejects(
  validateGeneratedDatabase({
    inputDir: licenseFixture.generated,
    sourceRegistryPath: licenseFixture.registry,
  }),
  /not distributable/,
);

const mismatchRoot = await mkdtemp(resolve(tmpdir(), "kokugo-language-db-source-mismatch-"));
const mismatchSourcePath = resolve(mismatchRoot, "mismatch.json");
const mismatchSource = await readJson(CORROBORATING_PATH);
mismatchSource.grades[1].rows[0] = `二${mismatchSource.grades[1].rows[0].slice(1)}`;
await writeJson(mismatchSourcePath, mismatchSource);
await assert.rejects(
  importKanji({
    primarySourcePath: PRIMARY_PATH,
    corroboratingSourcePath: mismatchSourcePath,
    sourceRegistryPath: REGISTRY_PATH,
    outputPath: resolve(mismatchRoot, "should-not-exist.json"),
    verifySourceHashes: false,
  }),
  /Official-source mismatch for grade 1/,
);

console.log(
  "language-db tests passed: counts, canonical-source provenance, metadata/license gates, fresh-artifact and deterministic builds, manifest hashes, and negative fixtures",
);
