import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const GENERATOR_DIR = resolve(SCRIPT_DIR, "..");
const SOURCE_ID = "ninjal_education_basic_vocabulary_2009b";
const DATABASE_RELEASE = "vocabulary-db.v0.1-ninjal-2009b-candidate";
const RELEASE_STATUS = "candidate_pending_normalization_and_manual_check";
const DISTRIBUTABLE_LICENSES = new Set(["open", "approved"]);
const BAND_FILES = Object.freeze([
  {
    gradeBand: "lower_elementary_1_3",
    sourceAllocationCode: 1,
    fileName: "vocabulary-lower-elementary.json",
  },
  {
    gradeBand: "upper_elementary_4_6",
    sourceAllocationCode: 2,
    fileName: "vocabulary-upper-elementary.json",
  },
]);

export const DEFAULT_VOCABULARY_BUILD_PATHS = Object.freeze({
  inputPath: resolve(GENERATOR_DIR, "data/normalized/vocabulary-candidate.json"),
  sourceRegistryPath: resolve(GENERATOR_DIR, "data/sources/source-registry.json"),
  outputDir: resolve(GENERATOR_DIR, "data/generated"),
});

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function releaseSource(source) {
  return {
    source_id: source.source_id,
    title: source.title,
    provider: source.provider,
    source_url: source.source_url,
    source_version: source.source_version,
    retrieved_at: source.retrieved_at,
    artifact_sha256: source.artifact_sha256,
    license_name: source.license_name,
    license_status: source.license_status,
    required_attribution: source.required_attribution,
  };
}

export async function buildVocabularyDb({
  inputPath = DEFAULT_VOCABULARY_BUILD_PATHS.inputPath,
  sourceRegistryPath = DEFAULT_VOCABULARY_BUILD_PATHS.sourceRegistryPath,
  outputDir = DEFAULT_VOCABULARY_BUILD_PATHS.outputDir,
} = {}) {
  const [normalized, registry] = await Promise.all([
    readJson(inputPath),
    readJson(sourceRegistryPath),
  ]);
  const source = registry.sources?.find((entry) => entry.source_id === SOURCE_ID);
  if (!source) throw new Error(`Cannot build vocabulary DB: unknown source_id ${SOURCE_ID}`);
  if (!DISTRIBUTABLE_LICENSES.has(source.license_status)) {
    throw new Error(
      `Cannot build vocabulary DB: ${SOURCE_ID} has license_status=${source.license_status}`,
    );
  }
  if (normalized.candidate_release !== DATABASE_RELEASE) {
    throw new Error(`Unexpected vocabulary candidate release: ${normalized.candidate_release}`);
  }

  const sourceReleases = [releaseSource(source)];
  const common = {
    schema_version: "vocabulary-db.band.v0.1",
    database_release: DATABASE_RELEASE,
    release_status: RELEASE_STATUS,
    generated_at: null,
    generation_time_policy: "runtime timestamp omitted from reproducible artifacts",
    derivation_rule_version: normalized.import_rule_version,
    source_releases: sourceReleases,
    generation_eligibility: "not_eligible_until_manual_review",
  };

  await mkdir(outputDir, { recursive: true });
  const files = [];
  for (const band of BAND_FILES) {
    const records = normalized.records
      .filter((record) => record.grade_band === band.gradeBand)
      .sort((left, right) => left.source_order - right.source_order);
    const file = {
      ...common,
      grade_band: band.gradeBand,
      source_allocation_code: band.sourceAllocationCode,
      record_count: records.length,
      records,
    };
    const content = stableJson(file);
    await writeFile(resolve(outputDir, band.fileName), content);
    files.push({
      file: band.fileName,
      grade_band: band.gradeBand,
      source_allocation_code: band.sourceAllocationCode,
      record_count: records.length,
      sha256: sha256(content),
    });
  }

  const manifest = {
    schema_version: "vocabulary-db.manifest.v0.1",
    database_release: DATABASE_RELEASE,
    release_status: RELEASE_STATUS,
    generated_at: null,
    generation_time_policy: common.generation_time_policy,
    derivation_rule_version: normalized.import_rule_version,
    source_releases: sourceReleases,
    contents: {
      scope: "ninjal-education-basic-vocabulary-2009b-elementary-bands",
      included_grade_bands: BAND_FILES.map((band) => band.gradeBand),
      excluded_source_bands: normalized.excluded_source_bands,
      total_record_count: files.reduce((sum, file) => sum + file.record_count, 0),
      files,
    },
    manual_check: {
      status: "pending",
      pending_record_count: files.reduce((sum, file) => sum + file.record_count, 0),
      note: "国語研の配当区分を保持した候補版。個別語の現代性、意味、表記、児童向け使用可否は未確認。",
    },
    generation_eligibility: "not_eligible_until_manual_review",
  };
  await writeFile(
    resolve(outputDir, "vocabulary-db.manifest.json"),
    stableJson(manifest),
  );
  return manifest;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments, got: ${argv.join(" ")}`);
    }
    values[flag.slice(2)] = resolve(value);
  }
  return {
    inputPath: values.input,
    sourceRegistryPath: values["source-registry"],
    outputDir: values["output-dir"],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  buildVocabularyDb(parseArgs(process.argv.slice(2)))
    .then((manifest) => {
      console.log(
        `Built ${manifest.database_release}: ${manifest.contents.total_record_count} vocabulary records`,
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
