import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const GENERATOR_DIR = resolve(SCRIPT_DIR, "..");
const EXPECTED_COUNTS = new Map([
  [1, 80],
  [2, 160],
  [3, 200],
]);
const DISTRIBUTABLE_LICENSES = new Set(["open", "approved"]);
const DATABASE_RELEASE = "language-db.v0.1-kanji-candidate";
const RELEASE_STATUS = "candidate_pending_manual_check";
const GRADE_SCHEMA_VERSION = "language-db.kanji-grade.v0.1";
const MANIFEST_SCHEMA_VERSION = "language-db.manifest.v0.1";
const DERIVATION_RULE_VERSION = "import-kanji.nfc-and-code-point.v0.1";
const GENERATION_TIME_POLICY = "runtime timestamp omitted from reproducible artifacts";

export const DEFAULT_VALIDATE_PATHS = Object.freeze({
  inputDir: resolve(GENERATOR_DIR, "data/generated"),
  sourceRegistryPath: resolve(GENERATOR_DIR, "data/sources/source-registry.json"),
  primarySourcePath: resolve(
    GENERATOR_DIR,
    "data/sources/mext-elementary-curriculum-h29-kanji.json",
  ),
  corroboratingSourcePath: resolve(
    GENERATOR_DIR,
    "data/sources/mext-elementary-japanese-explanation-h29-kanji.json",
  ),
});

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function codePointLabel(character) {
  return `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
}

async function readJsonWithText(path) {
  const text = await readFile(path, "utf8");
  return { text, value: JSON.parse(text) };
}

function sourceIdsForRecord(record) {
  return [
    record.source_id,
    ...(record.corroborating_sources ?? []).map((source) => source.source_id),
  ];
}

function sourceGrade(source, grade, errors) {
  const label = `${source.source_id ?? "unknown source"} grade ${grade}`;
  const gradeData = source.grades?.[String(grade)];
  if (!gradeData || !Array.isArray(gradeData.rows) || gradeData.rows.length === 0) {
    errors.push(`${label}: canonical source rows are missing`);
    return { locator: undefined, characters: [] };
  }
  if (typeof gradeData.source_locator !== "string" || gradeData.source_locator.length === 0) {
    errors.push(`${label}: canonical source locator is missing`);
  }
  if (gradeData.rows.some((row) => typeof row !== "string" || row.length === 0)) {
    errors.push(`${label}: canonical source contains an invalid row`);
    return { locator: gradeData.source_locator, characters: [] };
  }
  return {
    locator: gradeData.source_locator,
    characters: [...gradeData.rows.join("")],
  };
}

function validateCanonicalSources({
  primaryFile,
  corroboratingFile,
  registryById,
  errors,
}) {
  const primary = primaryFile.value;
  const corroborating = corroboratingFile.value;
  if (!primary.source_id || primary.source_id === corroborating.source_id) {
    errors.push("canonical comparison requires two distinct source_id values");
  }

  for (const sourceFile of [primaryFile, corroboratingFile]) {
    const sourceId = sourceFile.value.source_id;
    const registrySource = registryById.get(sourceId);
    if (!registrySource) {
      errors.push(`canonical source has unknown source_id ${sourceId}`);
      continue;
    }
    const actualHash = sha256(sourceFile.text);
    if (actualHash !== registrySource.pre_normalization_sha256) {
      errors.push(
        `canonical source ${sourceId}: SHA-256 ${actualHash} does not match registry`,
      );
    }
  }

  const expectedByGrade = new Map();
  const comparisonGrades = [];
  for (const grade of [1, 2, 3]) {
    const primaryGrade = sourceGrade(primary, grade, errors);
    const corroboratingGrade = sourceGrade(corroborating, grade, errors);
    if (primaryGrade.characters.join("") !== corroboratingGrade.characters.join("")) {
      errors.push(`canonical sources differ for grade ${grade}`);
    }
    expectedByGrade.set(
      grade,
      primaryGrade.characters.map((sourceForm, index) => ({
        character: sourceForm.normalize("NFC"),
        allocation_grade: grade,
        source_order: index + 1,
        source_id: primary.source_id,
        source_locator: primaryGrade.locator,
        source_form: sourceForm,
        normalized_form: sourceForm.normalize("NFC"),
        corroborating_sources: [
          {
            source_id: corroborating.source_id,
            source_locator: corroboratingGrade.locator,
            source_form: corroboratingGrade.characters[index],
          },
        ],
      })),
    );
    comparisonGrades.push({
      allocation_grade: grade,
      status: "matched",
      record_count: primaryGrade.characters.length,
    });
  }

  return {
    expectedByGrade,
    expectedComparison: {
      status: "matched",
      source_ids: [primary.source_id, corroborating.source_id],
      grades: comparisonGrades,
    },
  };
}

function validateRecord(record, expectedRecord, grade, index, registryById, seen, errors) {
  const label = `grade ${grade} record ${index + 1}`;
  if (record.allocation_grade !== grade) {
    errors.push(`${label}: allocation_grade=${record.allocation_grade}`);
  }
  if (typeof record.character !== "string" || [...record.character].length !== 1) {
    errors.push(`${label}: character must be exactly one code point`);
    return;
  }
  if (!/^\p{Script=Han}$/u.test(record.character)) {
    errors.push(`${label}: character is not a Han code point`);
  }
  if (record.normalized_form !== record.character.normalize("NFC")) {
    errors.push(`${label}: normalized_form is not NFC(character)`);
  }
  if (record.normalized_form !== record.normalized_form?.normalize("NFC")) {
    errors.push(`${label}: normalized_form is not NFC`);
  }
  if (record.code_point !== codePointLabel(record.character)) {
    errors.push(`${label}: code_point does not match character`);
  }
  if (record.source_form?.normalize("NFC") !== record.normalized_form) {
    errors.push(`${label}: source_form cannot be traced through NFC normalization`);
  }
  if (record.active !== true) {
    errors.push(`${label}: generated records must be active`);
  }
  if (record.manual_check_status !== "pending") {
    errors.push(`${label}: candidate record must have manual_check_status=pending`);
  }
  if (record.source_order !== index + 1) {
    errors.push(`${label}: source_order must define the fixed array order`);
  }
  if (seen.has(record.character)) {
    errors.push(`${label}: duplicate character ${record.character}`);
  }
  seen.add(record.character);

  if (typeof record.source_locator !== "string" || record.source_locator.length === 0) {
    errors.push(`${label}: source_locator is missing`);
  }
  if (!Array.isArray(record.corroborating_sources) || record.corroborating_sources.length === 0) {
    errors.push(`${label}: corroborating source trace is missing`);
  }
  for (const sourceId of sourceIdsForRecord(record)) {
    const source = registryById.get(sourceId);
    if (!source) {
      errors.push(`${label}: unknown source_id ${sourceId}`);
    } else if (!DISTRIBUTABLE_LICENSES.has(source.license_status)) {
      errors.push(`${label}: source ${sourceId} is not distributable (${source.license_status})`);
    }
  }
  for (const source of record.corroborating_sources ?? []) {
    if (typeof source.source_locator !== "string" || source.source_locator.length === 0) {
      errors.push(`${label}: corroborating source locator is missing`);
    }
    if (source.source_form !== record.source_form) {
      errors.push(`${label}: corroborating source_form differs from primary source_form`);
    }
  }

  if (!expectedRecord) {
    errors.push(`${label}: no matching record exists in the canonical sources`);
    return;
  }
  for (const field of [
    "character",
    "allocation_grade",
    "source_order",
    "source_id",
    "source_locator",
    "source_form",
    "normalized_form",
  ]) {
    if (record[field] !== expectedRecord[field]) {
      errors.push(`${label}: ${field} differs from the canonical source`);
    }
  }
  if (
    JSON.stringify(record.corroborating_sources) !==
    JSON.stringify(expectedRecord.corroborating_sources)
  ) {
    errors.push(`${label}: corroborating_sources differ from the canonical source`);
  }
}

export async function validateGeneratedDatabase({
  inputDir = DEFAULT_VALIDATE_PATHS.inputDir,
  sourceRegistryPath = DEFAULT_VALIDATE_PATHS.sourceRegistryPath,
  primarySourcePath = DEFAULT_VALIDATE_PATHS.primarySourcePath,
  corroboratingSourcePath = DEFAULT_VALIDATE_PATHS.corroboratingSourcePath,
} = {}) {
  const errors = [];
  const [manifestFile, registryFile, primaryFile, corroboratingFile] = await Promise.all([
    readJsonWithText(resolve(inputDir, "language-db.manifest.json")),
    readJsonWithText(sourceRegistryPath),
    readJsonWithText(primarySourcePath),
    readJsonWithText(corroboratingSourcePath),
  ]);
  const manifest = manifestFile.value;
  const registry = registryFile.value;
  const registryById = new Map((registry.sources ?? []).map((source) => [source.source_id, source]));
  const { expectedByGrade, expectedComparison } = validateCanonicalSources({
    primaryFile,
    corroboratingFile,
    registryById,
    errors,
  });

  if (manifest.schema_version !== MANIFEST_SCHEMA_VERSION) {
    errors.push(`unexpected manifest schema_version: ${manifest.schema_version}`);
  }
  if (manifest.database_release !== DATABASE_RELEASE) {
    errors.push(`unexpected database_release: ${manifest.database_release}`);
  }
  if (manifest.release_status !== RELEASE_STATUS) {
    errors.push(`unexpected release_status: ${manifest.release_status}`);
  }
  if (manifest.generated_at !== null) {
    errors.push("generated_at must be null in reproducible artifacts");
  }
  if (manifest.manual_check?.status !== "pending") {
    errors.push("manifest manual_check.status must be pending");
  }
  if (manifest.generation_time_policy !== GENERATION_TIME_POLICY) {
    errors.push(`unexpected generation_time_policy: ${manifest.generation_time_policy}`);
  }
  if (manifest.derivation_rule_version !== DERIVATION_RULE_VERSION) {
    errors.push(`unexpected derivation_rule_version: ${manifest.derivation_rule_version}`);
  }
  if (JSON.stringify(manifest.source_comparison) !== JSON.stringify(expectedComparison)) {
    errors.push("manifest source_comparison does not match the canonical sources");
  }

  const seen = new Set();
  let total = 0;
  for (const grade of [1, 2, 3]) {
    const fileName = `kanji-grade-${grade}.json`;
    const gradeFile = await readJsonWithText(resolve(inputDir, fileName));
    const gradeData = gradeFile.value;
    const records = gradeData.records ?? [];
    const expected = EXPECTED_COUNTS.get(grade);
    const manifestFileEntry = manifest.contents?.files?.find(
      (entry) => entry.allocation_grade === grade,
    );

    if (gradeData.schema_version !== GRADE_SCHEMA_VERSION) {
      errors.push(`grade ${grade}: unexpected schema_version ${gradeData.schema_version}`);
    }
    if (gradeData.release_status !== RELEASE_STATUS) {
      errors.push(`grade ${grade}: unexpected release_status ${gradeData.release_status}`);
    }
    if (gradeData.generated_at !== null) {
      errors.push(`grade ${grade}: generated_at must be null`);
    }
    if (gradeData.generation_time_policy !== GENERATION_TIME_POLICY) {
      errors.push(`grade ${grade}: unexpected generation_time_policy`);
    }
    if (gradeData.derivation_rule_version !== DERIVATION_RULE_VERSION) {
      errors.push(`grade ${grade}: unexpected derivation_rule_version`);
    }
    if (records.length !== expected) {
      errors.push(`grade ${grade}: expected ${expected} records, got ${records.length}`);
    }
    if (gradeData.record_count !== records.length) {
      errors.push(`grade ${grade}: record_count does not match records.length`);
    }
    if (gradeData.allocation_grade !== grade) {
      errors.push(`grade ${grade}: file allocation_grade is ${gradeData.allocation_grade}`);
    }
    if (gradeData.database_release !== manifest.database_release) {
      errors.push(`grade ${grade}: database_release differs from manifest`);
    }
    if (gradeData.derivation_rule_version !== manifest.derivation_rule_version) {
      errors.push(`grade ${grade}: derivation rule differs from manifest`);
    }
    if (JSON.stringify(gradeData.source_releases) !== JSON.stringify(manifest.source_releases)) {
      errors.push(`grade ${grade}: source releases differ from manifest`);
    }
    if (!manifestFileEntry) {
      errors.push(`grade ${grade}: manifest file entry is missing`);
    } else {
      if (manifestFileEntry.file !== fileName) {
        errors.push(`grade ${grade}: manifest file name is ${manifestFileEntry.file}`);
      }
      if (manifestFileEntry.record_count !== records.length) {
        errors.push(`grade ${grade}: manifest record_count does not match file`);
      }
      if (manifestFileEntry.sha256 !== sha256(gradeFile.text)) {
        errors.push(`grade ${grade}: manifest SHA-256 does not match file bytes`);
      }
    }

    records.forEach((record, index) =>
      validateRecord(
        record,
        expectedByGrade.get(grade)?.[index],
        grade,
        index,
        registryById,
        seen,
        errors,
      ),
    );
    total += records.length;
  }

  if (total !== 440) {
    errors.push(`expected 440 total records, got ${total}`);
  }
  if (manifest.contents?.total_record_count !== total) {
    errors.push("manifest total_record_count does not match generated files");
  }
  for (const [grade, expected] of EXPECTED_COUNTS) {
    if (manifest.contents?.grade_counts?.[String(grade)] !== expected) {
      errors.push(`manifest grade_counts[${grade}] must equal ${expected}`);
    }
  }
  if (manifest.manual_check?.pending_record_count !== 440) {
    errors.push("manifest pending_record_count must equal 440");
  }
  for (const source of manifest.source_releases ?? []) {
    if (!DISTRIBUTABLE_LICENSES.has(source.license_status)) {
      errors.push(`manifest includes non-distributable source ${source.source_id}`);
    }
    if (!registryById.has(source.source_id)) {
      errors.push(`manifest includes unknown source ${source.source_id}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Language DB validation failed:\n- ${errors.join("\n- ")}`);
  }
  return {
    database_release: manifest.database_release,
    grade_counts: Object.fromEntries(EXPECTED_COUNTS),
    total_record_count: total,
    source_count: manifest.source_releases?.length ?? 0,
  };
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
    inputDir: values["input-dir"],
    sourceRegistryPath: values["source-registry"],
    primarySourcePath: values.primary,
    corroboratingSourcePath: values.corroborating,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  validateGeneratedDatabase(parseArgs(process.argv.slice(2)))
    .then((summary) => {
      console.log(
        `Validated ${summary.database_release}: ${JSON.stringify(summary.grade_counts)}, total=${summary.total_record_count}`,
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
