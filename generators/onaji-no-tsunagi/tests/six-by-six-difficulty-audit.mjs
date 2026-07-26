/**
 * 原本6×6を基準点として、生成問題の機械的な難易度指標を比較する。
 *
 * 原本座標は引数で渡すローカルJSONからだけ読み込み、リポジトリ内のfixtureや
 * 生成seedとして利用しない。出力する分類は人間の体感難易度の判定ではなく、
 * 目視レビュー対象を絞るための保守的な候補分類である。
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import {
  renderDifficultyAuditHtml,
} from "./difficulty-audit-html.mjs";
import {
  CLASSIFICATION_POLICY,
  summarizeDifficultyCohort,
} from "./difficulty-audit-policy.mjs";
import {
  analyzeDifficultyReferences,
  SIX_BY_SIX_PROFILE_IDS,
  summarizeDifficultyProfile,
  toDifficultyCandidate,
} from "./difficulty-audit-analysis.mjs";
import {
  decodeReferenceCorpusJson,
} from "../application/decode-reference-corpus.ts";
import {
  getUniquePathCoverProfile,
} from "../domain/generation/build-unique-path-cover.ts";
import {
  generateWorksheet,
} from "../domain/generation/generate-worksheet.ts";
let lastReportedTotal = 0;

const options = parseOptions(process.argv.slice(2));
const startedAt = performance.now();
const referenceText = await readFile(options.referenceCorpusPath, "utf8");
const decodedReference = decodeReferenceCorpusJson(referenceText);
if (!decodedReference.ok) {
  throw new TypeError(decodedReference.errors.join("\n"));
}

const references = analyzeDifficultyReferences(decodedReference.corpus);
const requestedProfileIds = options.profileId === undefined
  ? SIX_BY_SIX_PROFILE_IDS
  : [options.profileId];
const generation = await generateCandidates(
  options.samplesPerProfile,
  requestedProfileIds,
);
const report = createReport(
  decodedReference.corpus,
  references,
  generation,
  requestedProfileIds,
  options,
  startedAt,
);
const jsonPath = `${options.outputPrefix}.json`;
const htmlPath = `${options.outputPrefix}.html`;
await mkdir(dirname(options.outputPrefix), { recursive: true });
await Promise.all([
  writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  writeFile(htmlPath, renderDifficultyAuditHtml(report), "utf8"),
]);

console.log(JSON.stringify({
  schemaVersion: report.schemaVersion,
  samplesPerProfile: report.samplesPerProfile,
  totalGenerated: report.totalGenerated,
  generationRequestCount: report.sampling.generationRequestCount,
  elapsedMs: report.elapsedMs,
  jsonPath,
  htmlPath,
  byProfile: Object.fromEntries(
    Object.entries(report.byProfile).map(([profileId, summary]) => [
      profileId,
      summary.classificationCounts,
    ]),
  ),
}, null, 2));

function parseOptions(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new TypeError(`引数を読み取れません: ${key ?? ""}`);
    }
    values.set(key, value);
    index += 1;
  }
  const referenceCorpusPath = values.get("--reference-corpus")
    ?? process.env.OTS_REFERENCE_CORPUS_PATH;
  if (referenceCorpusPath === undefined) {
    throw new TypeError(
      "--reference-corpus または OTS_REFERENCE_CORPUS_PATH が必要です。",
    );
  }
  const profileId = values.get("--profile")
    ?? process.env.OTS_DIFFICULTY_AUDIT_PROFILE;
  if (
    profileId !== undefined
    && !SIX_BY_SIX_PROFILE_IDS.includes(profileId)
  ) {
    throw new TypeError(
      `profileは${SIX_BY_SIX_PROFILE_IDS.join(", ")}から選んでください。`,
    );
  }
  return {
    referenceCorpusPath: resolve(referenceCorpusPath),
    outputPrefix: resolve(
      values.get("--output-prefix")
        ?? process.env.OTS_DIFFICULTY_AUDIT_OUTPUT_PREFIX
        ?? join(tmpdir(), "onaji-no-tsunagi-v34-difficulty-audit"),
    ),
    samplesPerProfile: parsePositiveInteger(
      values.get("--samples-per-profile")
        ?? process.env.OTS_DIFFICULTY_AUDIT_SAMPLES_PER_PROFILE,
      1_000,
      "samples-per-profile",
    ),
    reviewSamplesPerCategory: parsePositiveInteger(
      values.get("--review-samples")
        ?? process.env.OTS_DIFFICULTY_AUDIT_REVIEW_SAMPLES,
      5,
      "review-samples",
    ),
    profileId,
  };
}

function parsePositiveInteger(value, fallback, label) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${label} は正の整数にしてください。`);
  }
  return parsed;
}

async function generateCandidates(samplesPerProfile, profileIds) {
  const candidatesByProfile = new Map(
    profileIds.map(profileId => [profileId, []]),
  );
  const levelTwoProfileIds = profileIds.filter(
    profileId => profileId !== "6x6-6-4-4",
  );
  let generationRequestCount = 0;
  let levelTwoIndex = 0;
  while (
    levelTwoProfileIds.some(
      profileId =>
        candidatesByProfile.get(profileId).length < samplesPerProfile,
    )
  ) {
    const seed = `difficulty-audit-v34-level-2-${levelTwoIndex}`;
    levelTwoIndex += 1;
    generationRequestCount += 1;
    const generated = generateSinglePuzzle(2, seed);
    const candidates = candidatesByProfile.get(
      generated.provenance.profileId,
    );
    if (candidates !== undefined && candidates.length < samplesPerProfile) {
      candidates.push(toDifficultyCandidate(seed, generated));
      reportProgress(candidatesByProfile, profileIds, samplesPerProfile);
    }
  }

  if (profileIds.includes("6x6-6-4-4")) {
    for (let index = 0; index < samplesPerProfile; index += 1) {
      const seed = `difficulty-audit-v34-level-3-${index}`;
      generationRequestCount += 1;
      const generated = generateSinglePuzzle(3, seed);
      assert.equal(generated.provenance.profileId, "6x6-6-4-4");
      candidatesByProfile.get("6x6-6-4-4").push(
        toDifficultyCandidate(seed, generated),
      );
      reportProgress(candidatesByProfile, profileIds, samplesPerProfile);
    }
  }
  return {candidatesByProfile, generationRequestCount};
}

function generateSinglePuzzle(difficulty, seed) {
  const worksheet = generateWorksheet({
    difficulty,
    puzzleCount: 1,
    seed,
  });
  const generated = worksheet.puzzles[0];
  assert.ok(generated);
  return generated;
}

function reportProgress(candidatesByProfile, profileIds, samplesPerProfile) {
  const total = [...candidatesByProfile.values()].reduce(
    (sum, candidates) => sum + candidates.length,
    0,
  );
  if (
    total === samplesPerProfile * profileIds.length
    || total - lastReportedTotal >= 100
  ) {
    lastReportedTotal = total;
    const counts = profileIds.map(
      profileId => `${profileId}=${candidatesByProfile.get(profileId).length}`,
    ).join(" ");
    console.error(`[difficulty-audit] ${counts}`);
  }
}

function createReport(
  corpus,
  references,
  generation,
  profileIds,
  options,
  startedAt,
) {
  const byProfile = {};
  for (const profileId of profileIds) {
    const reference = references.get(profileId);
    const candidates = generation.candidatesByProfile.get(profileId);
    assert.ok(reference);
    assert.equal(candidates.length, options.samplesPerProfile);
    byProfile[profileId] = {
      ...(profileIds.length === 1
        ? {
            cohortLabel:
              "生成アルゴリズム通過・後段の監査フィルターなし",
          }
        : {}),
      profile: summarizeDifficultyProfile(
        getUniquePathCoverProfile(profileId),
      ),
      reference,
      ...summarizeDifficultyCohort(
        candidates,
        reference,
        options.reviewSamplesPerCategory,
      ),
    };
  }
  const targetOnly =
    profileIds.length === 1 && profileIds[0] === "6x6-4-4-2";
  return {
    schemaVersion: "onaji-no-tsunagi.six-by-six-difficulty-audit.v1",
    generatedAt: new Date().toISOString(),
    generatorTrack: "v3.4-draft.3",
    ...(targetOnly
      ? {
          reportTitle:
            "おなじのつなぎ 6×6・10端点 アルゴリズム単独監査",
          toolbarSummary:
            `後段フィルターなし ${options.samplesPerProfile}問`,
          lead:
            "6x6-4-4-2の生成アルゴリズムに内蔵した6条件は有効なまま、"
            + "中央端点数3〜5、2×2、中央・外周境界、外周一辺集中型の"
            + "後段4条件を採用フィルターに使わず、生成された"
            + `${options.samplesPerProfile.toLocaleString("ja-JP")}問を`
            + "そのまま原本基準の機械指標で分類しました。",
          reviewStorageKey:
            "onaji-no-tsunagi-v34-algorithm-only-difficulty-review",
          reviewExportFileName:
            "onaji-no-tsunagi-v34-algorithm-only-human-review.json",
        }
      : {}),
    classificationPolicy: CLASSIFICATION_POLICY,
    referenceCorpus: {
      sourceDocumentId: corpus.sourceDocument.id,
      sourceDocumentSha256: corpus.sourceDocument.sha256,
      sixBySixProblemCount: references.size,
    },
    sampling: {
      profileIds,
      generationRequestCount: generation.generationRequestCount,
      builtInGenerationPolicy:
        targetOnly
          ? "onaji-no-tsunagi-terminal-placement.6x6-4-4-2.v1"
          : "profile-dependent",
      postGenerationAuditFilters: [],
    },
    samplesPerProfile: options.samplesPerProfile,
    totalGenerated:
      options.samplesPerProfile * profileIds.length,
    elapsedMs: Math.round(performance.now() - startedAt),
    byProfile,
  };
}
