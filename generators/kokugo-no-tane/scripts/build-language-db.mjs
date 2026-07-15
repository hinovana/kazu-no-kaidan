import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const GENERATOR_DIR = resolve(SCRIPT_DIR, "..");
const DISTRIBUTABLE_LICENSES = new Set(["open", "approved"]);

export const DEFAULT_BUILD_PATHS = Object.freeze({
  inputPath: resolve(GENERATOR_DIR, "data/normalized/kanji-candidate.json"),
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

function sourceIdsFor(records) {
  return new Set(
    records.flatMap((record) => [
      record.source_id,
      ...(record.corroborating_sources ?? []).map((source) => source.source_id),
    ]),
  );
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
    pre_normalization_sha256: source.pre_normalization_sha256,
    license_name: source.license_name,
    license_status: source.license_status,
    required_attribution: source.required_attribution,
  };
}

export async function buildLanguageDb({
  inputPath = DEFAULT_BUILD_PATHS.inputPath,
  sourceRegistryPath = DEFAULT_BUILD_PATHS.sourceRegistryPath,
  outputDir = DEFAULT_BUILD_PATHS.outputDir,
} = {}) {
  const [normalized, registry] = await Promise.all([
    readJson(inputPath),
    readJson(sourceRegistryPath),
  ]);
  const records = normalized.records ?? [];
  const usedSourceIds = sourceIdsFor(records);
  const registryById = new Map((registry.sources ?? []).map((source) => [source.source_id, source]));

  for (const sourceId of usedSourceIds) {
    const source = registryById.get(sourceId);
    if (!source) {
      throw new Error(`Cannot build distribution: unknown source_id ${sourceId}`);
    }
    if (!DISTRIBUTABLE_LICENSES.has(source.license_status)) {
      throw new Error(
        `Cannot build distribution: ${sourceId} has license_status=${source.license_status}`,
      );
    }
  }

  const sourceReleases = (registry.sources ?? [])
    .filter((source) => usedSourceIds.has(source.source_id))
    .map(releaseSource);
  const common = {
    schema_version: "language-db.kanji-grade.v0.1",
    database_release: "language-db.v0.1-kanji-candidate",
    release_status: "candidate_pending_manual_check",
    generated_at: null,
    generation_time_policy: "runtime timestamp omitted from reproducible artifacts",
    derivation_rule_version: normalized.import_rule_version,
    source_releases: sourceReleases,
  };

  await mkdir(outputDir, { recursive: true });
  const files = [];
  for (const grade of [1, 2, 3]) {
    const gradeRecords = records
      .filter((record) => record.allocation_grade === grade && record.active)
      .sort((left, right) => left.source_order - right.source_order);
    const file = {
      ...common,
      allocation_grade: grade,
      record_count: gradeRecords.length,
      records: gradeRecords,
    };
    const fileName = `kanji-grade-${grade}.json`;
    const content = stableJson(file);
    await writeFile(resolve(outputDir, fileName), content);
    files.push({
      file: fileName,
      allocation_grade: grade,
      record_count: gradeRecords.length,
      sha256: sha256(content),
    });
  }

  const counts = Object.fromEntries(
    files.map((file) => [String(file.allocation_grade), file.record_count]),
  );
  const manifest = {
    schema_version: "language-db.manifest.v0.1",
    database_release: common.database_release,
    release_status: common.release_status,
    generated_at: common.generated_at,
    generation_time_policy: common.generation_time_policy,
    derivation_rule_version: common.derivation_rule_version,
    source_releases: sourceReleases,
    source_comparison: normalized.source_comparison,
    contents: {
      scope: "kanji-grade-1-to-3-only",
      excluded: ["vocabulary", "readings", "furigana", "item-generation"],
      grade_counts: counts,
      total_record_count: files.reduce((sum, file) => sum + file.record_count, 0),
      files,
    },
    manual_check: {
      status: "pending",
      pending_record_count: records.filter(
        (record) => record.manual_check_status === "pending",
      ).length,
      note: "AIによる公式資料2経路の照合済み。人間による原典との目視確認は未実施。",
    },
  };
  await writeFile(resolve(outputDir, "language-db.manifest.json"), stableJson(manifest));
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
  buildLanguageDb(parseArgs(process.argv.slice(2)))
    .then((manifest) => {
      console.log(
        `Built ${manifest.database_release}: ${manifest.contents.total_record_count} kanji records`,
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
