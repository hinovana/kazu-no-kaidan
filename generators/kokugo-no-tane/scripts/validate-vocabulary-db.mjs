import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const GENERATOR_DIR = resolve(SCRIPT_DIR, "..");
const SOURCE_ID = "ninjal_education_basic_vocabulary_2009b";
const DATABASE_RELEASE = "vocabulary-db.v0.1-ninjal-2009b-candidate";
const RELEASE_STATUS = "candidate_pending_normalization_and_manual_check";
const DERIVATION_RULE_VERSION = "import-vocabulary.ninjal-2009b.v0.1";
const EXPECTED_BANDS = Object.freeze([
  {
    gradeBand: "lower_elementary_1_3",
    sourceAllocationCode: 1,
    fileName: "vocabulary-lower-elementary.json",
    recordCount: 6865,
  },
  {
    gradeBand: "upper_elementary_4_6",
    sourceAllocationCode: 2,
    fileName: "vocabulary-upper-elementary.json",
    recordCount: 8620,
  },
]);
const MEMBERSHIP_KEYS = Object.freeze([
  "sakamoto",
  "new_sakamoto",
  "tanaka",
  "ikehara",
  "child_language_research_group",
  "chuo",
  "ninjal",
]);

export const DEFAULT_VOCABULARY_VALIDATE_PATHS = Object.freeze({
  normalizedPath: resolve(GENERATOR_DIR, "data/normalized/vocabulary-candidate.json"),
  inputDir: resolve(GENERATOR_DIR, "data/generated"),
  sourceRegistryPath: resolve(GENERATOR_DIR, "data/sources/source-registry.json"),
  sourcePath: resolve(GENERATOR_DIR, "data/sources/kyoikukihongoi_2009B.csv"),
});

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function readJsonWithText(path) {
  const text = await readFile(path, "utf8");
  return { text, value: JSON.parse(text) };
}

function validateRecord(record, band, position, seenIds, seenSourceNumbers, errors) {
  const label = `${band.gradeBand} record ${position}`;
  if (!/^ninjal-ebv-2009b-\d{6}$/u.test(record.lexeme_id)) {
    errors.push(`${label}: invalid lexeme_id`);
  }
  if (seenIds.has(record.lexeme_id)) errors.push(`${label}: duplicate lexeme_id`);
  seenIds.add(record.lexeme_id);
  if (!Number.isInteger(record.source_record_number) || record.source_record_number <= 0) {
    errors.push(`${label}: invalid source_record_number`);
  }
  if (seenSourceNumbers.has(record.source_record_number)) {
    errors.push(`${label}: duplicate source_record_number`);
  }
  seenSourceNumbers.add(record.source_record_number);
  if (!Number.isInteger(record.source_order) || record.source_order <= 0) {
    errors.push(`${label}: invalid source_order`);
  }
  if (record.grade_band !== band.gradeBand) errors.push(`${label}: grade_band mismatch`);
  if (record.source_allocation_code !== band.sourceAllocationCode) {
    errors.push(`${label}: source_allocation_code mismatch`);
  }
  if (typeof record.headword !== "string" || record.headword.length === 0) {
    errors.push(`${label}: headword is missing`);
  } else if (record.headword !== record.headword.normalize("NFC")) {
    errors.push(`${label}: headword is not NFC`);
  }
  if (record.reading_candidate !== record.headword) {
    errors.push(`${label}: reading_candidate must preserve the source headword`);
  }
  if (record.source_id !== SOURCE_ID) errors.push(`${label}: source_id mismatch`);
  if (record.usage_status !== "candidate_unreviewed") {
    errors.push(`${label}: usage_status must be candidate_unreviewed`);
  }
  if (record.manual_check_status !== "pending") {
    errors.push(`${label}: manual_check_status must be pending`);
  }
  if (record.active_for_generation !== false) {
    errors.push(`${label}: unreviewed vocabulary must not be active for generation`);
  }
  if (!Array.isArray(record.classification_numbers)) {
    errors.push(`${label}: classification_numbers must be an array`);
  }
  const membership = record.source_membership;
  if (!membership || JSON.stringify(Object.keys(membership)) !== JSON.stringify(MEMBERSHIP_KEYS)) {
    errors.push(`${label}: source_membership keys mismatch`);
  } else {
    const actualAppearanceCount = Object.values(membership).filter(Boolean).length;
    if (record.appearance_count !== actualAppearanceCount) {
      errors.push(`${label}: appearance_count mismatch`);
    }
  }
}

export async function validateVocabularyDatabase({
  normalizedPath = DEFAULT_VOCABULARY_VALIDATE_PATHS.normalizedPath,
  inputDir = DEFAULT_VOCABULARY_VALIDATE_PATHS.inputDir,
  sourceRegistryPath = DEFAULT_VOCABULARY_VALIDATE_PATHS.sourceRegistryPath,
  sourcePath = DEFAULT_VOCABULARY_VALIDATE_PATHS.sourcePath,
} = {}) {
  const errors = [];
  const [normalizedFile, manifestFile, registryFile, sourceBytes] = await Promise.all([
    readJsonWithText(normalizedPath),
    readJsonWithText(resolve(inputDir, "vocabulary-db.manifest.json")),
    readJsonWithText(sourceRegistryPath),
    readFile(sourcePath),
  ]);
  const normalized = normalizedFile.value;
  const manifest = manifestFile.value;
  const registry = registryFile.value;
  const source = registry.sources?.find((entry) => entry.source_id === SOURCE_ID);
  if (!source) {
    errors.push(`source registry is missing ${SOURCE_ID}`);
  } else {
    const actualSourceHash = sha256(sourceBytes);
    if (actualSourceHash !== source.artifact_sha256) {
      errors.push(`source artifact SHA-256 mismatch: ${actualSourceHash}`);
    }
    if (!["open", "approved"].includes(source.license_status)) {
      errors.push(`source license_status is not distributable: ${source.license_status}`);
    }
  }

  if (normalized.schema_version !== "vocabulary-normalized.v0.1") {
    errors.push(`unexpected normalized schema_version: ${normalized.schema_version}`);
  }
  if (normalized.candidate_release !== DATABASE_RELEASE) {
    errors.push(`unexpected normalized candidate_release: ${normalized.candidate_release}`);
  }
  if (normalized.import_rule_version !== DERIVATION_RULE_VERSION) {
    errors.push(`unexpected import_rule_version: ${normalized.import_rule_version}`);
  }
  if (normalized.generated_at !== null) errors.push("normalized generated_at must be null");
  if (normalized.record_count !== normalized.records?.length) {
    errors.push("normalized record_count does not match records.length");
  }

  if (manifest.schema_version !== "vocabulary-db.manifest.v0.1") {
    errors.push(`unexpected manifest schema_version: ${manifest.schema_version}`);
  }
  if (manifest.database_release !== DATABASE_RELEASE) {
    errors.push(`unexpected database_release: ${manifest.database_release}`);
  }
  if (manifest.release_status !== RELEASE_STATUS) {
    errors.push(`unexpected release_status: ${manifest.release_status}`);
  }
  if (manifest.generated_at !== null) errors.push("manifest generated_at must be null");
  if (manifest.derivation_rule_version !== DERIVATION_RULE_VERSION) {
    errors.push(`unexpected manifest derivation_rule_version`);
  }
  if (manifest.generation_eligibility !== "not_eligible_until_manual_review") {
    errors.push("manifest generation_eligibility must block unreviewed candidates");
  }

  const seenIds = new Set();
  const seenSourceNumbers = new Set();
  let total = 0;
  for (const band of EXPECTED_BANDS) {
    const gradeFile = await readJsonWithText(resolve(inputDir, band.fileName));
    const gradeData = gradeFile.value;
    const manifestEntry = manifest.contents?.files?.find((entry) => entry.file === band.fileName);
    if (gradeData.schema_version !== "vocabulary-db.band.v0.1") {
      errors.push(`${band.fileName}: unexpected schema_version`);
    }
    if (gradeData.database_release !== DATABASE_RELEASE) {
      errors.push(`${band.fileName}: database_release mismatch`);
    }
    if (gradeData.release_status !== RELEASE_STATUS) {
      errors.push(`${band.fileName}: release_status mismatch`);
    }
    if (gradeData.generated_at !== null) errors.push(`${band.fileName}: generated_at must be null`);
    if (gradeData.grade_band !== band.gradeBand) {
      errors.push(`${band.fileName}: grade_band mismatch`);
    }
    if (gradeData.source_allocation_code !== band.sourceAllocationCode) {
      errors.push(`${band.fileName}: source_allocation_code mismatch`);
    }
    if (gradeData.record_count !== band.recordCount || gradeData.records?.length !== band.recordCount) {
      errors.push(`${band.fileName}: expected ${band.recordCount} records`);
    }
    if (gradeData.generation_eligibility !== "not_eligible_until_manual_review") {
      errors.push(`${band.fileName}: unreviewed candidates must not be generation-eligible`);
    }

    let previousSourceOrder = 0;
    gradeData.records?.forEach((record, index) => {
      validateRecord(record, band, index + 1, seenIds, seenSourceNumbers, errors);
      if (record.source_order <= previousSourceOrder) {
        errors.push(`${band.fileName} record ${index + 1}: source_order is not increasing`);
      }
      previousSourceOrder = record.source_order;
    });
    const normalizedRecords = normalized.records?.filter(
      (record) => record.grade_band === band.gradeBand,
    );
    if (JSON.stringify(gradeData.records) !== JSON.stringify(normalizedRecords)) {
      errors.push(`${band.fileName}: records differ from normalized candidate`);
    }
    if (!manifestEntry) {
      errors.push(`${band.fileName}: manifest entry is missing`);
    } else {
      if (manifestEntry.record_count !== band.recordCount) {
        errors.push(`${band.fileName}: manifest record_count mismatch`);
      }
      if (manifestEntry.sha256 !== sha256(gradeFile.text)) {
        errors.push(`${band.fileName}: manifest SHA-256 mismatch`);
      }
    }
    total += gradeData.records?.length ?? 0;
  }

  if (total !== 15485) errors.push(`expected 15485 elementary records, got ${total}`);
  if (normalized.records?.length !== total) {
    errors.push("normalized candidate contains unexpected bands or record count");
  }
  if (manifest.contents?.total_record_count !== total) {
    errors.push("manifest total_record_count mismatch");
  }
  if (manifest.manual_check?.pending_record_count !== total) {
    errors.push("manifest pending_record_count mismatch");
  }
  const excludedSecondary = manifest.contents?.excluded_source_bands?.find(
    (entry) => entry.source_allocation_code === 3,
  );
  if (excludedSecondary?.record_count !== 11749) {
    errors.push("manifest must record 11749 excluded secondary-school records");
  }

  if (errors.length > 0) {
    throw new Error(`Vocabulary DB validation failed:\n- ${errors.join("\n- ")}`);
  }
  return {
    database_release: DATABASE_RELEASE,
    band_counts: Object.fromEntries(
      EXPECTED_BANDS.map((band) => [band.gradeBand, band.recordCount]),
    ),
    total_record_count: total,
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
    normalizedPath: values.normalized,
    inputDir: values["input-dir"],
    sourceRegistryPath: values["source-registry"],
    sourcePath: values.source,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  validateVocabularyDatabase(parseArgs(process.argv.slice(2)))
    .then((summary) => {
      console.log(
        `Validated ${summary.database_release}: ${JSON.stringify(summary.band_counts)}, total=${summary.total_record_count}`,
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
