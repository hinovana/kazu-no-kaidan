import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const GENERATOR_DIR = resolve(SCRIPT_DIR, "..");

export const DEFAULT_IMPORT_PATHS = Object.freeze({
  sourceRegistryPath: resolve(GENERATOR_DIR, "data/sources/source-registry.json"),
  primarySourcePath: resolve(
    GENERATOR_DIR,
    "data/sources/mext-elementary-curriculum-h29-kanji.json",
  ),
  corroboratingSourcePath: resolve(
    GENERATOR_DIR,
    "data/sources/mext-elementary-japanese-explanation-h29-kanji.json",
  ),
  outputPath: resolve(GENERATOR_DIR, "data/normalized/kanji-candidate.json"),
});

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function readJsonWithBytes(path) {
  const bytes = await readFile(path);
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

function registrySource(registry, sourceId) {
  const source = registry.sources?.find((entry) => entry.source_id === sourceId);
  if (!source) {
    throw new Error(`Unknown source_id in source data: ${sourceId}`);
  }
  return source;
}

function gradeText(source, grade) {
  const entry = source.grades?.[String(grade)];
  if (!entry || !Array.isArray(entry.rows) || entry.rows.length === 0) {
    throw new Error(`${source.source_id}: grade ${grade} has no source rows`);
  }
  if (typeof entry.source_locator !== "string" || entry.source_locator.length === 0) {
    throw new Error(`${source.source_id}: grade ${grade} has no source locator`);
  }
  if (entry.rows.some((row) => typeof row !== "string" || row.length === 0)) {
    throw new Error(`${source.source_id}: grade ${grade} contains an invalid row`);
  }
  return { locator: entry.source_locator, text: entry.rows.join("") };
}

function codePointLabel(character) {
  return `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
}

function assertSingleHanCharacter(character, context) {
  if ([...character].length !== 1 || !/^\p{Script=Han}$/u.test(character)) {
    throw new Error(`${context}: expected one Han code point, got ${JSON.stringify(character)}`);
  }
}

export async function importKanji({
  sourceRegistryPath = DEFAULT_IMPORT_PATHS.sourceRegistryPath,
  primarySourcePath = DEFAULT_IMPORT_PATHS.primarySourcePath,
  corroboratingSourcePath = DEFAULT_IMPORT_PATHS.corroboratingSourcePath,
  outputPath = DEFAULT_IMPORT_PATHS.outputPath,
  verifySourceHashes = true,
} = {}) {
  const [registryFile, primaryFile, corroboratingFile] = await Promise.all([
    readJsonWithBytes(sourceRegistryPath),
    readJsonWithBytes(primarySourcePath),
    readJsonWithBytes(corroboratingSourcePath),
  ]);

  const registry = registryFile.value;
  const primary = primaryFile.value;
  const corroborating = corroboratingFile.value;
  const primaryRegistry = registrySource(registry, primary.source_id);
  const corroboratingRegistry = registrySource(registry, corroborating.source_id);

  if (primary.source_id === corroborating.source_id) {
    throw new Error("Independent comparison requires two different source_id values");
  }

  if (verifySourceHashes) {
    const hashChecks = [
      [primarySourcePath, primaryRegistry.pre_normalization_sha256, primaryFile.bytes],
      [
        corroboratingSourcePath,
        corroboratingRegistry.pre_normalization_sha256,
        corroboratingFile.bytes,
      ],
    ];
    for (const [path, expected, bytes] of hashChecks) {
      const actual = sha256(bytes);
      if (actual !== expected) {
        throw new Error(`Pre-normalization SHA-256 mismatch for ${path}: ${actual} != ${expected}`);
      }
    }
  }

  const records = [];
  const comparison = [];
  for (const grade of [1, 2, 3]) {
    const primaryGrade = gradeText(primary, grade);
    const corroboratingGrade = gradeText(corroborating, grade);
    if (primaryGrade.text !== corroboratingGrade.text) {
      throw new Error(
        `Official-source mismatch for grade ${grade}: ${primary.source_id} and ${corroborating.source_id}`,
      );
    }

    const sourceCharacters = [...primaryGrade.text];
    sourceCharacters.forEach((sourceForm, index) => {
      assertSingleHanCharacter(sourceForm, `${primary.source_id} grade ${grade} item ${index + 1}`);
      const normalizedForm = sourceForm.normalize("NFC");
      assertSingleHanCharacter(normalizedForm, `normalized grade ${grade} item ${index + 1}`);
      records.push({
        character: normalizedForm,
        code_point: codePointLabel(normalizedForm),
        allocation_grade: grade,
        source_id: primary.source_id,
        source_locator: primaryGrade.locator,
        source_form: sourceForm,
        normalized_form: normalizedForm,
        active: true,
        manual_check_status: "pending",
        source_order: index + 1,
        corroborating_sources: [
          {
            source_id: corroborating.source_id,
            source_locator: corroboratingGrade.locator,
            source_form: [...corroboratingGrade.text][index],
          },
        ],
      });
    });

    comparison.push({
      allocation_grade: grade,
      status: "matched",
      record_count: sourceCharacters.length,
    });
  }

  const result = {
    schema_version: "kanji-normalized.v0.1",
    candidate_release: "language-db.v0.1-kanji-candidate",
    import_rule_version: "import-kanji.nfc-and-code-point.v0.1",
    generated_at: null,
    source_comparison: {
      status: "matched",
      source_ids: [primary.source_id, corroborating.source_id],
      grades: comparison,
    },
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
    primarySourcePath: values.primary,
    corroboratingSourcePath: values.corroborating,
    outputPath: values.output,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  importKanji(parseArgs(process.argv.slice(2)))
    .then((result) => {
      const counts = Object.fromEntries(
        [1, 2, 3].map((grade) => [
          grade,
          result.records.filter((record) => record.allocation_grade === grade).length,
        ]),
      );
      console.log(`Imported kanji candidate records: ${JSON.stringify(counts)}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
