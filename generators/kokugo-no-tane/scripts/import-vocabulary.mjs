import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const GENERATOR_DIR = resolve(SCRIPT_DIR, "..");
const SOURCE_ID = "ninjal_education_basic_vocabulary_2009b";
const CANDIDATE_RELEASE = "vocabulary-db.v0.1-ninjal-2009b-candidate";
const IMPORT_RULE_VERSION = "import-vocabulary.ninjal-2009b.v0.1";
const EXPECTED_SOURCE_COUNTS = Object.freeze({
  1: 6865,
  2: 8620,
  3: 11749,
});
const FIXED_HEADERS = Object.freeze([
  "語彙配当",
  "通し番号",
  "見出し",
  "表記",
  "品詞",
  "阪本",
  "新阪本",
  "田中",
  "池原",
  "児言研",
  "中央",
  "国語研",
  "出現数",
  "語種",
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
const INCLUDED_BANDS = Object.freeze({
  1: {
    grade_band: "lower_elementary_1_3",
    grade_band_label: "小学校低学年（1〜3年）",
  },
  2: {
    grade_band: "upper_elementary_4_6",
    grade_band_label: "小学校高学年（4〜6年）",
  },
});

export const DEFAULT_VOCABULARY_IMPORT_PATHS = Object.freeze({
  sourceRegistryPath: resolve(GENERATOR_DIR, "data/sources/source-registry.json"),
  sourcePath: resolve(GENERATOR_DIR, "data/sources/kyoikukihongoi_2009B.csv"),
  outputPath: resolve(GENERATOR_DIR, "data/normalized/vocabulary-candidate.json"),
});

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeNullable(value) {
  const normalized = value.normalize("NFC");
  return normalized.length === 0 ? null : normalized;
}

function sourceEntry(registry) {
  const source = registry.sources?.find((entry) => entry.source_id === SOURCE_ID);
  if (!source) throw new Error(`Missing source registry entry: ${SOURCE_ID}`);
  return source;
}

function decodeSource(bytes) {
  return new TextDecoder("shift_jis", { fatal: true }).decode(bytes);
}

function parseSourceRows(text) {
  const lines = text.split(/\r\n|\n|\r/u)
    .filter((line) => line.length > 0 && line.charCodeAt(0) >= 0x20);
  if (lines.length === 0) throw new Error("Vocabulary source CSV is empty");
  if (lines.some((line) => line.includes("\""))) {
    throw new Error("Vocabulary source CSV unexpectedly contains quoted fields");
  }

  const header = lines[0].split(",");
  if (JSON.stringify(header.slice(0, FIXED_HEADERS.length)) !== JSON.stringify(FIXED_HEADERS)) {
    throw new Error(`Unexpected vocabulary CSV headers: ${header.join(",")}`);
  }
  const expectedClassificationHeaders = Array.from(
    { length: 10 },
    (_, index) => `分類番号${index + 1}`,
  );
  if (
    JSON.stringify(header.slice(FIXED_HEADERS.length)) !==
    JSON.stringify(expectedClassificationHeaders)
  ) {
    throw new Error("Unexpected classification-number headers");
  }

  return lines.slice(1).map((line, index) => {
    const fields = line.split(",");
    if (fields.length < FIXED_HEADERS.length) {
      throw new Error(`Vocabulary source row ${index + 2} has only ${fields.length} fields`);
    }
    return { fields, sourceLine: index + 2 };
  });
}

function makeRecord(fields, sourceLine, sourceOrder) {
  const allocationCode = Number(fields[0]);
  const band = INCLUDED_BANDS[allocationCode];
  if (!band) return null;

  const sourceRecordNumber = Number(fields[1]);
  const headword = fields[2].normalize("NFC");
  const appearanceCount = Number(fields[12]);
  const membershipValues = fields.slice(5, 12).map(normalizeNullable);
  const actualAppearanceCount = membershipValues.filter(Boolean).length;
  if (!Number.isInteger(sourceRecordNumber) || sourceRecordNumber <= 0) {
    throw new Error(`Vocabulary source row ${sourceLine} has invalid 通し番号`);
  }
  if (headword.length === 0) {
    throw new Error(`Vocabulary source row ${sourceLine} has an empty 見出し`);
  }
  if (appearanceCount !== actualAppearanceCount) {
    throw new Error(
      `Vocabulary source row ${sourceLine}: 出現数=${appearanceCount}, actual=${actualAppearanceCount}`,
    );
  }

  return {
    lexeme_id: `ninjal-ebv-2009b-${String(sourceRecordNumber).padStart(6, "0")}`,
    source_record_number: sourceRecordNumber,
    source_order: sourceOrder,
    source_allocation_code: allocationCode,
    ...band,
    headword,
    reading_candidate: headword,
    notation: normalizeNullable(fields[3]),
    part_of_speech: fields[4].normalize("NFC"),
    source_membership: Object.fromEntries(
      MEMBERSHIP_KEYS.map((key, index) => [key, membershipValues[index]]),
    ),
    appearance_count: appearanceCount,
    word_origin: normalizeNullable(fields[13]),
    classification_numbers: fields.slice(14).map(normalizeNullable).filter(Boolean),
    source_id: SOURCE_ID,
    source_locator: `CSV line ${sourceLine}; 通し番号 ${sourceRecordNumber}`,
    usage_status: "candidate_unreviewed",
    manual_check_status: "pending",
    active_for_generation: false,
  };
}

export async function importVocabulary({
  sourceRegistryPath = DEFAULT_VOCABULARY_IMPORT_PATHS.sourceRegistryPath,
  sourcePath = DEFAULT_VOCABULARY_IMPORT_PATHS.sourcePath,
  outputPath = DEFAULT_VOCABULARY_IMPORT_PATHS.outputPath,
  verifySourceHash = true,
} = {}) {
  const [registryBytes, sourceBytes] = await Promise.all([
    readFile(sourceRegistryPath),
    readFile(sourcePath),
  ]);
  const registry = JSON.parse(registryBytes.toString("utf8"));
  const source = sourceEntry(registry);
  const actualHash = sha256(sourceBytes);
  if (verifySourceHash && source.artifact_sha256 !== actualHash) {
    throw new Error(
      `Vocabulary source SHA-256 mismatch: ${actualHash} != ${source.artifact_sha256}`,
    );
  }

  const sourceRows = parseSourceRows(decodeSource(sourceBytes));
  const sourceCounts = { 1: 0, 2: 0, 3: 0 };
  const records = [];
  for (const { fields, sourceLine } of sourceRows) {
    const allocationCode = Number(fields[0]);
    if (![1, 2, 3].includes(allocationCode)) {
      throw new Error(`Vocabulary source row ${sourceLine} has invalid 語彙配当`);
    }
    sourceCounts[allocationCode] += 1;
    const record = makeRecord(fields, sourceLine, records.length + 1);
    if (record) records.push(record);
  }
  for (const allocationCode of [1, 2, 3]) {
    if (sourceCounts[allocationCode] !== EXPECTED_SOURCE_COUNTS[allocationCode]) {
      throw new Error(
        `Vocabulary allocation ${allocationCode}: expected ${EXPECTED_SOURCE_COUNTS[allocationCode]}, got ${sourceCounts[allocationCode]}`,
      );
    }
  }

  const result = {
    schema_version: "vocabulary-normalized.v0.1",
    candidate_release: CANDIDATE_RELEASE,
    import_rule_version: IMPORT_RULE_VERSION,
    generated_at: null,
    source_id: SOURCE_ID,
    source_file_sha256: actualHash,
    source_encoding: "CP932",
    included_bands: Object.values(INCLUDED_BANDS),
    excluded_source_bands: [
      {
        source_allocation_code: 3,
        grade_band: "secondary_school",
        record_count: sourceCounts[3],
      },
    ],
    record_count: records.length,
    manual_check_status: "pending",
    records,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, stableJson(result));
  return result;
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
    sourceRegistryPath: values["source-registry"],
    sourcePath: values.source,
    outputPath: values.output,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  importVocabulary(parseArgs(process.argv.slice(2)))
    .then((result) => {
      const counts = Object.fromEntries(
        Object.values(INCLUDED_BANDS).map(({ grade_band: gradeBand }) => [
          gradeBand,
          result.records.filter((record) => record.grade_band === gradeBand).length,
        ]),
      );
      console.log(`Imported vocabulary candidate records: ${JSON.stringify(counts)}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
