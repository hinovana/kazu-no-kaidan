/**
 * 6x6-4-4-2で、中央配置と外周隣接の仮説を難易度指標で対照評価する。
 *
 * 同じseed系列から生成policy通過群、中央端点数の範囲を加えた条件、
 * 中央隣接上限を加えた条件と、縦横3連・L字3連・2×2・
 * 中央外周境界の隣接上限・外周一辺集中型も加えた最終条件を同数集め、
 * 原本基準の同一分類規則で比較する。
 * 仮説条件はgeneratorの品質gateへは追加しない。
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import {
  analyzeDifficultyReferences,
  summarizeDifficultyProfile,
  toDifficultyCandidate,
} from "./difficulty-audit-analysis.mjs";
import {
  analyzeTerminalPlacementHypotheses,
  CENTRAL_SYMBOL_COVERAGE_HYPOTHESIS,
  CENTRAL_TERMINAL_COUNT_HYPOTHESIS,
  COMBINED_TERMINAL_PLACEMENT_HYPOTHESIS,
  CONCENTRATED_ORTHOGONAL_EDGE_PAIRS_HYPOTHESIS,
  LIMITED_CENTRAL_BOUNDARY_ADJACENCY_HYPOTHESIS,
  LIMITED_CENTRAL_ADJACENCY_HYPOTHESIS,
  LIMITED_EDGE_ADJACENCY_HYPOTHESIS,
  TERMINAL_PLACEMENT_GATE_RULES,
  TERMINAL_RUN_AND_BLOCK_HYPOTHESIS,
} from "./difficulty-audit-hypothesis.mjs";
import {
  CLASSIFICATION_POLICY,
  classifyCandidate,
  summarizeDifficultyCohort,
} from "./difficulty-audit-policy.mjs";
import {
  renderDifficultyAuditHtml,
} from "./difficulty-audit-html.mjs";
import {
  decodeReferenceCorpusJson,
} from "../application/decode-reference-corpus.ts";
import {
  getUniquePathCoverProfile,
} from "../domain/generation/build-unique-path-cover.ts";
import {
  generateWorksheet,
} from "../domain/generation/generate-worksheet.ts";

const options = parseOptions(process.argv.slice(2));
const startedAt = performance.now();
const referenceText = await readFile(options.referenceCorpusPath, "utf8");
const decodedReference = decodeReferenceCorpusJson(referenceText);
if (!decodedReference.ok) {
  throw new TypeError(decodedReference.errors.join("\n"));
}

const references = analyzeDifficultyReferences(decodedReference.corpus);
const reference = references.get(
  CENTRAL_SYMBOL_COVERAGE_HYPOTHESIS.targetProfileId,
);
assert.ok(reference);
const referencePlacement =
  analyzeTerminalPlacementHypotheses(reference.puzzle);
assert.equal(
  referencePlacement.satisfiesCombinedHypothesis,
  true,
  "原本6x6-4-4-2が組み合わせ条件を満たしていません。",
);
assert.equal(
  referencePlacement.adjacentEdgeTerminalPairCount,
  1,
  "原本6x6-4-4-2の外周隣接数が想定と異なります。",
);
assert.equal(
  referencePlacement.centralTerminalCount,
  3,
  "原本6x6-4-4-2の中央端点数が想定と異なります。",
);
assert.ok(
  referencePlacement.adjacentCentralTerminalPairCount <= 1,
  "原本6x6-4-4-2の中央隣接数が追加条件を超えています。",
);
assert.equal(
  referencePlacement.satisfiesFinalHypothesis,
  true,
  "原本6x6-4-4-2が改訂後の隣接条件を満たしていません。",
);

const generated = generateExperimentCohorts(options.samplesPerCohort);
const baselineSummary = summarizeDifficultyCohort(
  generated.baselineCandidates,
  reference,
  options.reviewSamplesPerCategory,
);
const hypothesisSummary = summarizeDifficultyCohort(
  generated.centralCandidates,
  reference,
  options.reviewSamplesPerCategory,
);
const previousCombinedSummary = summarizeDifficultyCohort(
  generated.previousCombinedCandidates,
  reference,
  options.reviewSamplesPerCategory,
);
const boundedCentralSummary = summarizeDifficultyCohort(
  generated.boundedCentralCandidates,
  reference,
  options.reviewSamplesPerCategory,
);
const combinedSummary = summarizeDifficultyCohort(
  generated.combinedCandidates,
  reference,
  options.reviewSamplesPerCategory,
);
const finalSummary = summarizeDifficultyCohort(
  generated.finalCandidates,
  reference,
  options.reviewSamplesPerCategory,
);
const report = createExperimentReport(
  decodedReference.corpus,
  references,
  reference,
  referencePlacement,
  generated,
  baselineSummary,
  hypothesisSummary,
  previousCombinedSummary,
  boundedCentralSummary,
  combinedSummary,
  finalSummary,
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
  samplesPerCohort: report.samplesPerProfile,
  elapsedMs: report.elapsedMs,
  jsonPath,
  htmlPath,
  sampling: report.experiment.sampling,
  conditionRejections: report.experiment.conditionRejections,
  constructionPruning: report.experiment.constructionPruning,
  comparison: report.experiment.classificationComparison,
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
  return {
    referenceCorpusPath: resolve(referenceCorpusPath),
    outputPrefix: resolve(
      values.get("--output-prefix")
        ?? process.env.OTS_CENTRAL_TERMINAL_EXPERIMENT_OUTPUT_PREFIX
        ?? join(
          tmpdir(),
          "onaji-no-tsunagi-v34-central-terminal-experiment",
        ),
    ),
    samplesPerCohort: parsePositiveInteger(
      values.get("--samples-per-cohort")
        ?? process.env.OTS_CENTRAL_TERMINAL_EXPERIMENT_SAMPLES,
      1_000,
      "samples-per-cohort",
    ),
    reviewSamplesPerCategory: parsePositiveInteger(
      values.get("--review-samples")
        ?? process.env.OTS_DIFFICULTY_AUDIT_REVIEW_SAMPLES,
      5,
      "review-samples",
    ),
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

function generateExperimentCohorts(samplesPerCohort) {
  const baselineCandidates = [];
  const centralCandidates = [];
  const previousCombinedCandidates = [];
  const boundedCentralCandidates = [];
  const combinedCandidates = [];
  const finalCandidates = [];
  const terminalPlacementDiagnostics = [];
  let levelTwoRequestCount = 0;
  let targetProfileEncounterCount = 0;
  let ignoredOtherProfileCount = 0;
  let centralHypothesisMatchCount = 0;
  let previousCombinedHypothesisMatchCount = 0;
  let boundedCentralHypothesisMatchCount = 0;
  let combinedHypothesisMatchCount = 0;
  let finalHypothesisMatchCount = 0;
  const gateRuleCounters = TERMINAL_PLACEMENT_GATE_RULES.map(rule => ({
    ...rule,
    standaloneRejectedCount: 0,
    reachedCount: 0,
    sequentialRejectedCount: 0,
  }));

  while (
    baselineCandidates.length < samplesPerCohort
    || centralCandidates.length < samplesPerCohort
    || previousCombinedCandidates.length < samplesPerCohort
    || boundedCentralCandidates.length < samplesPerCohort
    || combinedCandidates.length < samplesPerCohort
    || finalCandidates.length < samplesPerCohort
  ) {
    const seed = `difficulty-audit-v34-level-2-${levelTwoRequestCount}`;
    levelTwoRequestCount += 1;
    const worksheet = generateWorksheet({
      difficulty: 2,
      puzzleCount: 1,
      seed,
    });
    const result = worksheet.puzzles[0];
    assert.ok(result);
    if (
      result.provenance.profileId
      !== CENTRAL_SYMBOL_COVERAGE_HYPOTHESIS.targetProfileId
    ) {
      ignoredOtherProfileCount += 1;
      continue;
    }

    targetProfileEncounterCount += 1;
    assert.ok(
      result.provenance.terminalPlacementDiagnostics,
      "6x6-4-4-2に端点配置探索の診断値がありません。",
    );
    terminalPlacementDiagnostics.push(
      result.provenance.terminalPlacementDiagnostics,
    );
    const placement = analyzeTerminalPlacementHypotheses(result.puzzle);
    recordGateRuleEvaluation(gateRuleCounters, placement);
    const candidate = {
      ...toDifficultyCandidate(seed, result),
      placement,
    };
    if (baselineCandidates.length < samplesPerCohort) {
      baselineCandidates.push(candidate);
    }
    if (placement.satisfiesCentralSymbolCoverage) {
      centralHypothesisMatchCount += 1;
      if (centralCandidates.length < samplesPerCohort) {
        centralCandidates.push(candidate);
      }
    }
    if (placement.satisfiesPreviousCombinedHypothesis) {
      previousCombinedHypothesisMatchCount += 1;
      if (previousCombinedCandidates.length < samplesPerCohort) {
        previousCombinedCandidates.push(candidate);
      }
    }
    if (placement.satisfiesBoundedCentralAndEdgeHypothesis) {
      boundedCentralHypothesisMatchCount += 1;
      if (boundedCentralCandidates.length < samplesPerCohort) {
        boundedCentralCandidates.push(candidate);
      }
    }
    if (placement.satisfiesCombinedHypothesis) {
      combinedHypothesisMatchCount += 1;
      if (combinedCandidates.length < samplesPerCohort) {
        combinedCandidates.push(candidate);
      }
    }
    if (placement.satisfiesFinalHypothesis) {
      finalHypothesisMatchCount += 1;
      if (finalCandidates.length < samplesPerCohort) {
        finalCandidates.push(candidate);
      }
    }

    if (
      targetProfileEncounterCount % 100 === 0
      || (
        baselineCandidates.length === samplesPerCohort
        && centralCandidates.length === samplesPerCohort
        && previousCombinedCandidates.length === samplesPerCohort
        && boundedCentralCandidates.length === samplesPerCohort
        && combinedCandidates.length === samplesPerCohort
        && finalCandidates.length === samplesPerCohort
      )
    ) {
      console.error(
        `[central-terminal-experiment] target=${
          targetProfileEncounterCount
        } baseline=${baselineCandidates.length} central=${
          centralCandidates.length
        } previous=${previousCombinedCandidates.length} bounded=${
          boundedCentralCandidates.length
        } combined=${combinedCandidates.length} final=${
          finalCandidates.length
        }`,
      );
    }
  }

  const conditionRejections = summarizeGateRuleRejections(
    gateRuleCounters,
    targetProfileEncounterCount,
  );
  assert.equal(
    conditionRejections.at(-1)?.remainingCount,
    finalHypothesisMatchCount,
    "条件別の段階集計と最終条件の通過数が一致しません。",
  );
  return {
    baselineCandidates,
    centralCandidates,
    previousCombinedCandidates,
    boundedCentralCandidates,
    combinedCandidates,
    finalCandidates,
    conditionRejections,
    constructionPruning: summarizeConstructionPruning(
      terminalPlacementDiagnostics,
    ),
    sampling: {
      levelTwoRequestCount,
      targetProfileEncounterCount,
      ignoredOtherProfileCount,
      centralHypothesisMatchCount,
      previousCombinedHypothesisMatchCount,
      boundedCentralHypothesisMatchCount,
      combinedHypothesisMatchCount,
      finalHypothesisMatchCount,
      baselineCentralMatchCount: baselineCandidates.filter(
        candidate => candidate.placement.satisfiesCentralSymbolCoverage,
      ).length,
      baselinePreviousCombinedMatchCount: baselineCandidates.filter(
        candidate =>
          candidate.placement.satisfiesPreviousCombinedHypothesis,
      ).length,
      baselineBoundedCentralMatchCount: baselineCandidates.filter(
        candidate =>
          candidate.placement.satisfiesBoundedCentralAndEdgeHypothesis,
      ).length,
      baselineCombinedMatchCount: baselineCandidates.filter(
        candidate => candidate.placement.satisfiesCombinedHypothesis,
      ).length,
      baselineFinalMatchCount: baselineCandidates.filter(
        candidate => candidate.placement.satisfiesFinalHypothesis,
      ).length,
    },
  };
}

function createExperimentReport(
  corpus,
  references,
  reference,
  referencePlacement,
  generated,
  baselineSummary,
  centralSummary,
  previousCombinedSummary,
  boundedCentralSummary,
  combinedSummary,
  finalSummary,
  options,
  startedAt,
) {
  const targetProfileId =
    CENTRAL_SYMBOL_COVERAGE_HYPOTHESIS.targetProfileId;
  const sampling = {
    ...generated.sampling,
    targetProfileCentralAcceptanceRate: round(
      generated.sampling.centralHypothesisMatchCount
      / generated.sampling.targetProfileEncounterCount,
    ),
    targetProfilePreviousCombinedAcceptanceRate: round(
      generated.sampling.previousCombinedHypothesisMatchCount
      / generated.sampling.targetProfileEncounterCount,
    ),
    targetProfileBoundedCentralAcceptanceRate: round(
      generated.sampling.boundedCentralHypothesisMatchCount
      / generated.sampling.targetProfileEncounterCount,
    ),
    targetProfileCombinedAcceptanceRate: round(
      generated.sampling.combinedHypothesisMatchCount
      / generated.sampling.targetProfileEncounterCount,
    ),
    targetProfileFinalAcceptanceRate: round(
      generated.sampling.finalHypothesisMatchCount
      / generated.sampling.targetProfileEncounterCount,
    ),
    baselineCentralMatchRate: round(
      generated.sampling.baselineCentralMatchCount
      / options.samplesPerCohort,
    ),
    baselinePreviousCombinedMatchRate: round(
      generated.sampling.baselinePreviousCombinedMatchCount
      / options.samplesPerCohort,
    ),
    baselineBoundedCentralMatchRate: round(
      generated.sampling.baselineBoundedCentralMatchCount
      / options.samplesPerCohort,
    ),
    baselineCombinedMatchRate: round(
      generated.sampling.baselineCombinedMatchCount
      / options.samplesPerCohort,
    ),
    baselineFinalMatchRate: round(
      generated.sampling.baselineFinalMatchCount
      / options.samplesPerCohort,
    ),
  };
  return {
    schemaVersion:
      "onaji-no-tsunagi.terminal-placement-difficulty-experiment.v6",
    reportTitle: "おなじのつなぎ 6×6 端点配置仮説の対照実験",
    toolbarSummary:
      `生成policy通過・段階的な端点配置条件 各${
        options.samplesPerCohort
      }問`,
    lead:
      "6x6-4-4-2の生成探索へ組み込んだ6条件と、監査に残した4条件を"
      + "対象に、中央4×4の記号網羅、外周隣接制限、"
      + "中央端点数3〜5、中央隣接最大1組を段階的に加え、"
      + "最後に縦横3連・L字3連・2×2を却下し、中央と外周を"
      + "またぐ隣接を2組まで、外周一辺集中型の直交隣接pairを"
      + "2組までに制限して、"
      + "同じseed系列・同じ原本基準で比較しました。",
    reviewStorageKey:
      "onaji-no-tsunagi-v34-terminal-placement-difficulty-review-v6",
    reviewExportFileName:
      "onaji-no-tsunagi-v34-terminal-placement-human-review-v6.json",
    generatedAt: new Date().toISOString(),
    generatorTrack: "v3.4-draft.3",
    classificationPolicy: CLASSIFICATION_POLICY,
    referenceCorpus: {
      sourceDocumentId: corpus.sourceDocument.id,
      sourceDocumentSha256: corpus.sourceDocument.sha256,
      sixBySixProblemCount: references.size,
    },
    samplesPerProfile: options.samplesPerCohort,
    totalGenerated:
      generated.sampling.levelTwoRequestCount,
    elapsedMs: Math.round(performance.now() - startedAt),
    experiment: {
      hypotheses: {
        central: CENTRAL_SYMBOL_COVERAGE_HYPOTHESIS,
        centralTerminalCount: CENTRAL_TERMINAL_COUNT_HYPOTHESIS,
        edgeAdjacency: LIMITED_EDGE_ADJACENCY_HYPOTHESIS,
        centralAdjacency: LIMITED_CENTRAL_ADJACENCY_HYPOTHESIS,
        combined: COMBINED_TERMINAL_PLACEMENT_HYPOTHESIS,
        terminalRunAndBlock: TERMINAL_RUN_AND_BLOCK_HYPOTHESIS,
        centralBoundaryAdjacency:
          LIMITED_CENTRAL_BOUNDARY_ADJACENCY_HYPOTHESIS,
        concentratedOrthogonalEdgePairs:
          CONCENTRATED_ORTHOGONAL_EDGE_PAIRS_HYPOTHESIS,
      },
      referencePlacement,
      sampling,
      conditionRejections: generated.conditionRejections,
      constructionPruning: generated.constructionPruning,
      classificationComparison: compareClassificationCounts(
        baselineSummary.classificationCounts,
        centralSummary.classificationCounts,
        previousCombinedSummary.classificationCounts,
        boundedCentralSummary.classificationCounts,
        combinedSummary.classificationCounts,
        finalSummary.classificationCounts,
      ),
      baselineHypothesisMatchByClassification:
        summarizeHypothesisMatchesByClassification(
          generated.baselineCandidates,
          reference,
        ),
      placementComparison: {
        baseline: summarizePlacement(generated.baselineCandidates),
        central: summarizePlacement(generated.centralCandidates),
        previousCombined: summarizePlacement(
          generated.previousCombinedCandidates,
        ),
        boundedCentral: summarizePlacement(
          generated.boundedCentralCandidates,
        ),
        combined: summarizePlacement(generated.combinedCandidates),
        final: summarizePlacement(generated.finalCandidates),
      },
    },
    baselineCohort: baselineSummary,
    centralCohort: centralSummary,
    previousCombinedCohort: previousCombinedSummary,
    boundedCentralCohort: boundedCentralSummary,
    combinedCohort: combinedSummary,
    byProfile: {
      [targetProfileId]: {
        cohortLabel:
          "中央4×4は全記号・合計3〜5・隣接1組まで"
          + "＋外周隣接は異記号1組まで"
          + "＋縦横3連・L字3連・2×2を却下"
          + "＋中央外周境界の隣接2組まで"
          + `＋外周一辺集中型3ペアを却下した条件付き${
            options.samplesPerCohort
          }問`,
        profile: summarizeDifficultyProfile(
          getUniquePathCoverProfile(targetProfileId),
        ),
        reference,
        ...finalSummary,
      },
    },
  };
}

function summarizeConstructionPruning(diagnostics) {
  const pathExtensionEvaluationCount = sum(
    diagnostics.map(value => value.pathExtensionEvaluationCount),
  );
  const completedCoverEvaluationCount = sum(
    diagnostics.map(value => value.completedCoverEvaluationCount),
  );
  const symbolAssignmentEvaluationCount = sum(
    diagnostics.map(value => value.symbolAssignmentEvaluationCount),
  );
  const pathRules = [
    ["outer_adjacency_pair_limit", "外周隣接は最大1ペア"],
    ["central_adjacency_pair_limit", "中央隣接は最大1ペア"],
    ["straight_terminal_run", "縦3連・横3連を禁止"],
    ["l_shaped_terminal_triple", "L字型3連を禁止"],
  ].map(([ruleId, label]) => {
    const prunedCount = sum(
      diagnostics.map(value => value.pathPruningCounts[ruleId]),
    );
    const evaluatedCount = ruleId === "l_shaped_terminal_triple"
      ? completedCoverEvaluationCount
      : pathExtensionEvaluationCount;
    return {
      stage: "path_extension",
      ruleId,
      label,
      evaluatedCount,
      prunedCount,
      pruningRate: round(
        prunedCount / evaluatedCount,
      ),
    };
  });
  const symbolRules = [
    ["central_symbol_coverage", "中央4×4に各記号1個以上"],
    ["same_symbol_outer_adjacency", "外周の同記号隣接を禁止"],
  ].map(([ruleId, label]) => {
    const prunedCount = sum(
      diagnostics.map(
        value => value.symbolAssignmentRejectionCounts[ruleId],
      ),
    );
    return {
      stage: "symbol_assignment",
      ruleId,
      label,
      evaluatedCount: symbolAssignmentEvaluationCount,
      prunedCount,
      pruningRate: round(
        prunedCount / symbolAssignmentEvaluationCount,
      ),
    };
  });
  return {
    policyId: diagnostics[0]?.policyId,
    acceptedPuzzleCount: diagnostics.length,
    pathExtensionEvaluationCount,
    completedCoverEvaluationCount,
    symbolAssignmentEvaluationCount,
    allowedSymbolAssignmentCount: summarizeNumbers(
      diagnostics.map(value => value.allowedSymbolAssignmentCount),
    ),
    rules: [...pathRules, ...symbolRules],
  };
}

function recordGateRuleEvaluation(counters, placement) {
  let reachedCurrentRule = true;
  for (const counter of counters) {
    const satisfiesRule = placement[counter.resultKey];
    assert.equal(
      typeof satisfiesRule,
      "boolean",
      `配置分析にboolean結果 ${counter.resultKey} がありません。`,
    );
    if (!satisfiesRule) {
      counter.standaloneRejectedCount += 1;
    }
    if (!reachedCurrentRule) {
      continue;
    }
    counter.reachedCount += 1;
    if (!satisfiesRule) {
      counter.sequentialRejectedCount += 1;
      reachedCurrentRule = false;
    }
  }
}

function summarizeGateRuleRejections(counters, candidateCount) {
  let remainingCount = candidateCount;
  return counters.map((counter, index) => {
    remainingCount -= counter.sequentialRejectedCount;
    return {
      order: index + 1,
      id: counter.id,
      label: counter.label,
      description: counter.description,
      resultKey: counter.resultKey,
      candidateCount,
      standaloneRejectedCount: counter.standaloneRejectedCount,
      standaloneRejectionRate: round(
        counter.standaloneRejectedCount / candidateCount,
      ),
      reachedCount: counter.reachedCount,
      sequentialRejectedCount: counter.sequentialRejectedCount,
      sequentialRejectionRate: round(
        counter.sequentialRejectedCount / counter.reachedCount,
      ),
      remainingCount,
      remainingRate: round(remainingCount / candidateCount),
    };
  });
}

function compareClassificationCounts(
  baseline,
  central,
  previousCombined,
  boundedCentral,
  combined,
  final,
) {
  return Object.fromEntries(
    Object.keys(baseline).map(classification => {
      const baselineEntry = baseline[classification];
      const centralEntry = central[classification];
      const previousCombinedEntry = previousCombined[classification];
      const boundedCentralEntry = boundedCentral[classification];
      const combinedEntry = combined[classification];
      const finalEntry = final[classification];
      return [classification, {
        baseline: baselineEntry,
        central: centralEntry,
        previousCombined: previousCombinedEntry,
        boundedCentral: boundedCentralEntry,
        combined: combinedEntry,
        final: finalEntry,
        centralRatioPointChange: round(
          centralEntry.ratio - baselineEntry.ratio,
        ),
        combinedRatioPointChange: round(
          combinedEntry.ratio - baselineEntry.ratio,
        ),
        combinedRelativeChange: baselineEntry.ratio === 0
          ? null
          : round(
              (combinedEntry.ratio - baselineEntry.ratio)
              / baselineEntry.ratio,
            ),
        finalRatioPointChange: round(
          finalEntry.ratio - baselineEntry.ratio,
        ),
        finalVsCombinedRatioPointChange: round(
          finalEntry.ratio - combinedEntry.ratio,
        ),
      }];
    }),
  );
}

function summarizeHypothesisMatchesByClassification(candidates, reference) {
  const classified = candidates.map(candidate => classifyCandidate(
    candidate,
    reference,
  ));
  return Object.fromEntries(
    [
      "reference_like",
      "clearly_easier",
      "clearly_harder",
      "mixed",
    ].map(classification => {
      const matchingClassification = classified.filter(
        candidate => candidate.classification === classification,
      );
      const hypothesisMatchCount = matchingClassification.filter(
        candidate => candidate.placement.satisfiesCentralSymbolCoverage,
      ).length;
      const previousCombinedMatchCount = matchingClassification.filter(
        candidate =>
          candidate.placement.satisfiesPreviousCombinedHypothesis,
      ).length;
      const boundedCentralMatchCount = matchingClassification.filter(
        candidate =>
          candidate.placement.satisfiesBoundedCentralAndEdgeHypothesis,
      ).length;
      const combinedMatchCount = matchingClassification.filter(
        candidate => candidate.placement.satisfiesCombinedHypothesis,
      ).length;
      const finalMatchCount = matchingClassification.filter(
        candidate => candidate.placement.satisfiesFinalHypothesis,
      ).length;
      return [classification, {
        totalCount: matchingClassification.length,
        centralMatchCount: hypothesisMatchCount,
        centralMatchRate: matchingClassification.length === 0
          ? null
          : round(
              hypothesisMatchCount / matchingClassification.length,
            ),
        previousCombinedMatchCount,
        previousCombinedMatchRate: matchingClassification.length === 0
          ? null
          : round(
              previousCombinedMatchCount
              / matchingClassification.length,
            ),
        boundedCentralMatchCount,
        boundedCentralMatchRate: matchingClassification.length === 0
          ? null
          : round(
              boundedCentralMatchCount / matchingClassification.length,
            ),
        combinedMatchCount,
        combinedMatchRate: matchingClassification.length === 0
          ? null
          : round(
              combinedMatchCount / matchingClassification.length,
            ),
        finalMatchCount,
        finalMatchRate: matchingClassification.length === 0
          ? null
          : round(
              finalMatchCount / matchingClassification.length,
            ),
      }];
    }),
  );
}

function summarizePlacement(candidates) {
  return {
    centralTerminalCount: summarizeNumbers(
      candidates.map(candidate => candidate.placement.centralTerminalCount),
    ),
    outerRingTerminalCount: summarizeNumbers(
      candidates.map(candidate => candidate.placement.outerRingTerminalCount),
    ),
    adjacentEdgeTerminalPairCount: summarizeNumbers(
      candidates.map(
        candidate => candidate.placement.adjacentEdgeTerminalPairCount,
      ),
    ),
    adjacentSameSymbolEdgePairCount: summarizeNumbers(
      candidates.map(
        candidate => candidate.placement.adjacentSameSymbolEdgePairCount,
      ),
    ),
    adjacentCentralTerminalPairCount: summarizeNumbers(
      candidates.map(
        candidate => candidate.placement.adjacentCentralTerminalPairCount,
      ),
    ),
    maximumAdjacentTerminalClusterSize: summarizeNumbers(
      candidates.map(
        candidate =>
          candidate.placement.maximumAdjacentTerminalClusterSize,
      ),
    ),
    centralBoundaryAdjacentTerminalPairCount: summarizeNumbers(
      candidates.map(
        candidate =>
          candidate.placement.centralBoundaryAdjacentTerminalPairCount,
      ),
    ),
    horizontalThreeTerminalRunCount: summarizeNumbers(
      candidates.map(
        candidate => candidate.placement.horizontalThreeTerminalRunCount,
      ),
    ),
    verticalThreeTerminalRunCount: summarizeNumbers(
      candidates.map(
        candidate => candidate.placement.verticalThreeTerminalRunCount,
      ),
    ),
    filledTwoByTwoTerminalBlockCount: summarizeNumbers(
      candidates.map(
        candidate =>
          candidate.placement.filledTwoByTwoTerminalBlockCount,
      ),
    ),
    lShapedThreeTerminalBlockCount: summarizeNumbers(
      candidates.map(
        candidate =>
          candidate.placement.lShapedThreeTerminalBlockCount,
      ),
    ),
    maximumOrthogonalEdgeTerminalPairCount: summarizeNumbers(
      candidates.map(
        candidate =>
          candidate.placement.maximumOrthogonalEdgeTerminalPairCount,
      ),
    ),
  };
}

function summarizeNumbers(values) {
  const sorted = [...values].toSorted((left, right) => left - right);
  return {
    minimum: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    maximum: sorted.at(-1),
    average: round(
      values.reduce((sum, value) => sum + value, 0) / values.length,
    ),
  };
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
