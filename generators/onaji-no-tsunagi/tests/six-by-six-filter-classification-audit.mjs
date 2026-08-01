/**
 * 6x6-4-4-4の生成問題を、配置条件違反と難易度分類のクロス表にする。
 *
 * 通常の36マスcover、または36マスcoverの唯一解を1〜5マス短縮して独立solver
 * で唯一解を再証明した31〜35マスcoverを母集団にできる。profileへ組み込まれた
 * 後段採用gateは最終canonical solutionにも再適用し、残る監査条件の違反問題数と
 * 5難易度区分を同じschemaで出す。
 */

import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname} from "node:path";
import {performance} from "node:perf_hooks";

import {decodeReferenceCorpusJson} from "../application/decode-reference-corpus.ts";
import {
  getUniquePathCoverProfile,
} from "../domain/generation/build-unique-path-cover.ts";
import {generateWorksheetForProfile} from "../domain/generation/generate-worksheet.ts";
import {materializePathPlan} from "../domain/generation/materialize-path-plan.ts";
import {
  evaluatePuzzleSelectionFilters,
} from "../domain/generation/puzzle-selection-policy.ts";
import {createSeededRandom} from "../domain/generation/random.ts";
import {solutionHash} from "../domain/solver/normalize-solution.ts";
import {solvePuzzle} from "../domain/solver/solve-puzzle.ts";
import {
  analyzeSolutionCoverage,
} from "../domain/validation/analyze-solution-coverage.ts";
import {
  analyzeSolutionGeometry,
  countStraightPathsByAxis,
} from "../domain/validation/analyze-solution-geometry.ts";
import {
  analyzeUniquePathCoverEntry,
} from "../domain/validation/analyze-unique-path-cover-entry.ts";
import {
  analyzeDifficultyReferences,
  toDifficultyCandidate,
} from "./difficulty-audit-analysis.mjs";
import {
  CLASSIFICATION_POLICY,
  MAX_REVIEW_SAMPLES_PER_GROUP,
  calculateReferencePercentiles,
  classifyCandidate,
  sampleThenSortCandidates,
  summarizeCandidateMetrics,
  summarizeDifficultyCohort,
} from "./difficulty-audit-policy.mjs";
import {
  renderDifficultyAuditHtml,
} from "./difficulty-audit-html.mjs";
import {
  TERMINAL_PLACEMENT_GATE_RULES,
  analyzeTerminalPlacementHypotheses,
} from "./difficulty-audit-hypothesis.mjs";

const PROFILE_ID = "6x6-4-4-4";
const PROFILE_DIFFICULTY = 2;
const SYMBOL_PATH_COUNTS = [2, 2, 2];
const STRAIGHT_PATH_LIMIT_RULE = {
  id: "reject-three-straight-paths-on-same-axis",
  label: "真横線3本以上または真縦線3本以上を禁止",
  resultKey: "satisfiesNoThreeStraightPathsOnSameAxis",
};
const CONNECTED_TERMINAL_CLUSTER_RULE = {
  id: "reject-four-connected-terminal-cluster",
  label: "縦横隣接で連なる端点4個以上を禁止",
  resultKey: "satisfiesNoFourOrMoreOrthogonallyConnectedTerminals",
};
const FILTER_AUDIT_RULES = [
  ...TERMINAL_PLACEMENT_GATE_RULES,
  CONNECTED_TERMINAL_CLUSTER_RULE,
  STRAIGHT_PATH_LIMIT_RULE,
];
const FILTER_RULE_BY_SELECTION_RULE_ID = new Map([
  [
    "no_three_straight_paths_on_same_axis",
    STRAIGHT_PATH_LIMIT_RULE,
  ],
]);
const DEFAULT_ACTIVE_RULE_IDS = [
  "central-4x4-all-symbols",
  "central-4x4-four-to-six-terminals",
  "reject-same-symbol-edge-adjacency",
  "reject-filled-two-by-two-terminal-blocks",
  "at-most-two-central-boundary-adjacencies",
  "reject-three-orthogonal-pairs-on-one-outer-side",
  "reject-four-connected-terminal-cluster",
  "reject-three-straight-paths-on-same-axis",
];
const CLASSIFICATION_GROUPS = [
  {id: "clearly_easier", label: "明らかに簡単側"},
  {id: "reference_like", label: "原本近傍"},
  {id: "clearly_harder", label: "明らかに難しい側"},
  {id: "mixed_easier", label: "指標混合: 簡単寄り"},
  {id: "mixed_harder", label: "指標混合: 難しい寄り"},
];

const options = parseOptions(process.argv.slice(2));
const referenceText = await readFile(options.referenceCorpusPath, "utf8");
const decodedReference = decodeReferenceCorpusJson(referenceText);
if (!decodedReference.ok) {
  throw new TypeError(decodedReference.errors.join("\n"));
}
const reference = analyzeDifficultyReferences(
  decodedReference.corpus,
).get(PROFILE_ID);
assert.ok(reference, `${PROFILE_ID}: 原本基準点がありません。`);

const rulesById = new Map(
  FILTER_AUDIT_RULES.map(rule => [rule.id, rule]),
);
const ruleCounters = options.ruleIds
  .map(ruleId => {
    const rule = rulesById.get(ruleId);
    if (rule === undefined) {
      throw new TypeError(`unknown rule id: ${ruleId}`);
    }
    return rule;
  })
  .map(rule => ({
    ...rule,
    violationCount: 0,
    classificationCounts: createClassificationCounts(),
  }));
const overallClassificationCounts = createClassificationCounts();
const passedClassificationCounts = createClassificationCounts();
const classifiedCandidates = [];
let allFiltersPassedCount = 0;
const startedAt = performance.now();
const generatedPopulation = generateAuditPopulation(options);

for (
  let index = 0;
  index < generatedPopulation.candidates.length;
  index += 1
) {
  const candidate = generatedPopulation.candidates[index];
  const placement = analyzeTerminalPlacementHypotheses(candidate.puzzle);
  const filterAnalysis = {
    ...placement,
    horizontalStraightPathCount:
      candidate.metrics.horizontalStraightPathCount,
    verticalStraightPathCount:
      candidate.metrics.verticalStraightPathCount,
    satisfiesNoThreeStraightPathsOnSameAxis:
      candidate.metrics.horizontalStraightPathCount
        < CLASSIFICATION_POLICY.clearlyEasierStraightPathCountOnSameAxis
      && candidate.metrics.verticalStraightPathCount
        < CLASSIFICATION_POLICY.clearlyEasierStraightPathCountOnSameAxis,
  };
  const failedRules = [];
  for (const counter of ruleCounters) {
    if (filterAnalysis[counter.resultKey] === true) {
      continue;
    }
    failedRules.push({
      id: counter.id,
      label: counter.label,
    });
  }
  const classified = {
    ...classifyCandidate(candidate, reference),
    placement: filterAnalysis,
    filterEvaluation: {
      allPassed: failedRules.length === 0,
      failedRules,
    },
  };
  classifiedCandidates.push(classified);
  const classificationId = toClassificationGroupId(classified);
  overallClassificationCounts[classificationId] += 1;
  for (const failedRule of failedRules) {
    const counter = ruleCounters.find(rule => rule.id === failedRule.id);
    assert.ok(counter);
    counter.violationCount += 1;
    counter.classificationCounts[classificationId] += 1;
  }
  if (classified.filterEvaluation.allPassed) {
    allFiltersPassedCount += 1;
    passedClassificationCounts[classificationId] += 1;
  }
  if ((index + 1) % 100 === 0) {
    console.error(
      `[filter-classification-audit:${options.generationMode}] ${
        index + 1
      }/${options.sampleCount}`,
    );
  }
}

const elapsedMs = Math.round(performance.now() - startedAt);
const passedCandidates = classifiedCandidates.filter(
  candidate => candidate.filterEvaluation.allPassed,
);
const rejectedCandidates = classifiedCandidates.filter(
  candidate => !candidate.filterEvaluation.allPassed,
);
assert.equal(passedCandidates.length, allFiltersPassedCount);
assert.equal(
  passedCandidates.length + rejectedCandidates.length,
  options.sampleCount,
);
const rejectedClassificationCounts = countClassifications(
  rejectedCandidates,
);
const previousPolicyClassificationCounts =
  countPreviousPolicyClassifications(classifiedCandidates);
const classificationPolicyTransitions =
  summarizeClassificationPolicyTransitions(classifiedCandidates);
const conditionViolations = ruleCounters.map(counter => {
  const violationCandidates = classifiedCandidates.filter(candidate =>
    candidate.filterEvaluation.failedRules.some(rule => rule.id === counter.id)
  );
  const referenceLikeViolationCandidates = violationCandidates.filter(
    candidate => candidate.classification === "reference_like",
  );
  const referenceLikeReviewCandidates = sampleThenSortCandidates(
    referenceLikeViolationCandidates,
    options.reviewSamplesPerCategory,
    `condition:${counter.id}:reference-like`,
    (left, right) => left.referenceDistance - right.referenceDistance,
  );
  const exclusiveViolationCandidates = violationCandidates.filter(
    candidate => candidate.filterEvaluation.failedRules.length === 1,
  );
  const exclusiveClassificationCounts = countClassifications(
    exclusiveViolationCandidates,
  );
  const ifRemovedClassificationCounts = addClassificationCounts(
    passedClassificationCounts,
    exclusiveClassificationCounts,
  );
  const ifRemovedPassedCount =
    allFiltersPassedCount + exclusiveViolationCandidates.length;
  return {
    id: counter.id,
    label: counter.label,
    resultKey: counter.resultKey,
    sampleCount: options.sampleCount,
    violationCount: counter.violationCount,
    violationRate: counter.violationCount / options.sampleCount,
    classificationCounts: counter.classificationCounts,
    classificationRates: toClassificationRates(
      counter.classificationCounts,
      counter.violationCount,
    ),
    referenceLikeViolationCount: referenceLikeViolationCandidates.length,
    referenceLikeReviewCandidates,
    exclusiveViolationCount: exclusiveViolationCandidates.length,
    exclusiveViolationRate:
      exclusiveViolationCandidates.length / options.sampleCount,
    exclusiveClassificationCounts,
    ifRemoved: {
      passedCount: ifRemovedPassedCount,
      passedRate: ifRemovedPassedCount / options.sampleCount,
      additionalPassedCount: exclusiveViolationCandidates.length,
      classificationCounts: ifRemovedClassificationCounts,
      classificationRates: toClassificationRates(
        ifRemovedClassificationCounts,
        ifRemovedPassedCount,
      ),
    },
  };
});
const failureCombinations = summarizeFailureCombinations(
  rejectedCandidates,
  options.sampleCount,
);
const overallSummary = summarizeDifficultyCohort(
  classifiedCandidates,
  reference,
  options.reviewSamplesPerCategory,
);
const passedSummary = summarizeDifficultyCohort(
  passedCandidates,
  reference,
  options.reviewSamplesPerCategory,
);
const report = {
  schemaVersion:
    "onaji-no-tsunagi.six-by-six-filter-classification-audit.v6",
  generatedAt: new Date().toISOString(),
  generatorTrack:
    options.generationMode === "ordinary"
      ? "v3.4-draft.3"
      : options.generationMode === "rust-prototype"
        ? "rust-prototype-v0.2-partial-cover-experiment"
        : "v3.4-draft.3-partial-cover-experiment",
  reportTitle:
    `${
      options.generationMode === "rust-prototype"
        ? "Rust版 "
        : ""
    }おなじのつなぎ 6x6-4-4-4・${
      formatGeneratedCoverLabel(options)
    }生成${
      formatNumber(options.sampleCount)
    }問 統合監査`,
  toolbarSummary:
    `${
      options.generationMode === "rust-prototype"
        ? "Rust builder・solver / "
        : ""
    }同一母集団 ${formatNumber(options.sampleCount)}問 / ${
      formatNumber(options.ruleIds.length)
    }条件`,
  lead:
    createReportLead(options),
  fullWidthLayout: true,
  compactCandidateCards: true,
  designTheme: "dashboard-frame",
  pairedCandidateCards: false,
  reviewEnabled: false,
  showToolbar: false,
  showLead: false,
  showClassificationDisclaimer: false,
  showReportMeta: false,
  showFilterConclusion: false,
  showFilterTableNotes: false,
  showConditionCopyButton: true,
  showRejectedSummaryPanel: false,
  combineClassificationSummaryIntoConditionTable: true,
  showGeneratedDistribution: false,
  showCandidateCardMetrics: false,
  showReferencePercentiles: false,
  reviewStorageKey:
    `onaji-no-tsunagi-v34-6x6-4-4-4-${
      formatGenerationStorageKey(options)
    }-filter-audit-review-v6`,
  reviewExportFileName:
    `onaji-no-tsunagi-v34-6x6-4-4-4-${
      formatGenerationStorageKey(options)
    }-filter-audit-human-review.json`,
  classificationPolicy: CLASSIFICATION_POLICY,
  referenceCorpus: {
    sourceDocumentId: decodedReference.corpus.sourceDocument.id,
    sourceDocumentSha256: decodedReference.corpus.sourceDocument.sha256,
    sixBySixProblemCount: 3,
  },
  profileId: PROFILE_ID,
  sampleCount: options.sampleCount,
  samplesPerProfile: options.sampleCount,
  totalGenerated: options.sampleCount,
  seedPrefix: options.seedPrefix,
  sampling: createSamplingDescription(options),
  reviewSampling: {
    method: "deterministic-random-then-sort",
    requestedPerGroup: options.reviewSamplesPerCategory,
    maximumPerGroup: MAX_REVIEW_SAMPLES_PER_GROUP,
    randomRankSource: "sample-key-and-candidate-id-hash",
  },
  generationAudit: generatedPopulation.audit,
  selectedRuleIds: options.ruleIds,
  timing: {
    elapsedMs,
    elapsedSeconds: elapsedMs / 1_000,
    averageMsPerPuzzle: elapsedMs / options.sampleCount,
  },
  reference: {
    sourceProblemId: reference.sourceProblemId,
    metrics: reference.metrics,
  },
  overallClassificationCounts,
  overallClassificationRates: toClassificationRates(
    overallClassificationCounts,
    options.sampleCount,
  ),
  classificationPolicyChange: {
    previousPolicyId: "onaji-no-tsunagi.difficulty-selection.v2",
    currentPolicyId: "onaji-no-tsunagi.difficulty-selection.v3",
    previousClassificationCounts: previousPolicyClassificationCounts,
    currentClassificationCounts: overallClassificationCounts,
    transitions: classificationPolicyTransitions,
  },
  allFiltersPassed: {
    count: allFiltersPassedCount,
    rate: allFiltersPassedCount / options.sampleCount,
    classificationCounts: passedClassificationCounts,
    classificationRates: toClassificationRates(
      passedClassificationCounts,
      allFiltersPassedCount,
    ),
  },
  rejectedByAnyFilter: {
    count: rejectedCandidates.length,
    rate: rejectedCandidates.length / options.sampleCount,
    classificationCounts: rejectedClassificationCounts,
    classificationRates: toClassificationRates(
      rejectedClassificationCounts,
      rejectedCandidates.length,
    ),
  },
  conditionViolations,
  failureCombinations,
  metricComparison: {
    overall: {
      referencePercentiles: calculateReferencePercentiles(
        reference,
        classifiedCandidates,
      ),
      distributions: summarizeCandidateMetrics(classifiedCandidates),
      indicatorDirections: summarizeIndicatorDirections(
        classifiedCandidates,
      ),
    },
    passed: {
      referencePercentiles: calculateReferencePercentiles(
        reference,
        passedCandidates,
      ),
      distributions: summarizeCandidateMetrics(passedCandidates),
      indicatorDirections: summarizeIndicatorDirections(passedCandidates),
    },
  },
  filterAudit: {
    classificationGroups: CLASSIFICATION_GROUPS,
  },
  byProfile: {
    "filter適用前": {
      cohortLabel:
        `${formatGeneratedCoverLabel(options)}で生成した全${
          formatNumber(options.sampleCount)
        }問`,
      reference,
      ...overallSummary,
    },
    "全filter通過": {
      cohortLabel:
        `${formatNumber(options.ruleIds.length)}条件をすべて通過した`
        + `${formatNumber(allFiltersPassedCount)}問`,
      reference,
      showReferenceCard: false,
      ...passedSummary,
    },
  },
};
report.integrityChecks = verifyReport(report, classifiedCandidates);

await mkdir(dirname(options.outputPrefix), {recursive: true});
const outputWrites = [
  writeFile(
    `${options.outputPrefix}.json`,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  ),
];
if (options.writeHtml) {
  outputWrites.push(writeFile(
    `${options.outputPrefix}.html`,
    renderDifficultyAuditHtml(report),
    "utf8",
  ));
}
await Promise.all(outputWrites);

console.log(JSON.stringify({
  jsonPath: `${options.outputPrefix}.json`,
  htmlPath: options.writeHtml ? `${options.outputPrefix}.html` : null,
  timing: report.timing,
  overallClassificationCounts,
  allFiltersPassed: report.allFiltersPassed,
  rejectedByAnyFilter: report.rejectedByAnyFilter,
  conditionViolations: report.conditionViolations.map(condition => ({
    label: condition.label,
    violationCount: condition.violationCount,
    violationRate: condition.violationRate,
    exclusiveViolationCount: condition.exclusiveViolationCount,
    ifRemovedPassedCount: condition.ifRemoved.passedCount,
    classificationCounts: condition.classificationCounts,
  })),
  integrityChecks: report.integrityChecks,
}, null, 2));

function generateAuditPopulation(generationOptions) {
  if (generationOptions.generationMode === "ordinary") {
    return generateOrdinaryPopulation(generationOptions);
  }
  if (generationOptions.generationMode === "rust-prototype") {
    return generateRustPrototypePopulation(generationOptions);
  }
  return generatePartialCoverPopulation(generationOptions);
}

function generateOrdinaryPopulation(generationOptions) {
  const candidates = [];
  for (let index = 0; index < generationOptions.sampleCount; index += 1) {
    const seed = `${generationOptions.seedPrefix}-${index}`;
    const generated = generateWorksheetForProfile(
      {
        difficulty: PROFILE_DIFFICULTY,
        puzzleCount: 1,
        seed,
      },
      PROFILE_ID,
    ).puzzles[0];
    assert.ok(generated, `${seed}: 問題が生成されませんでした。`);
    assert.equal(generated.provenance.profileId, PROFILE_ID);
    candidates.push(toDifficultyCandidate(seed, generated));
  }
  return {
    candidates,
    audit: {
      mode: "ordinary_full_cover",
      generatedCandidateCount: candidates.length,
      usedCellCountRange: {minimum: 36, maximum: 36},
    },
  };
}

function generateRustPrototypePopulation(generationOptions) {
  const rust = spawnSync(
    generationOptions.rustBinaryPath,
    [
      "--seed-prefix",
      generationOptions.seedPrefix,
      "--accepted-count",
      String(generationOptions.sampleCount),
      "--maximum-base-count",
      String(generationOptions.maximumBaseCount),
      "--variants-per-base",
      String(generationOptions.variantsPerBase),
      "--jobs",
      String(generationOptions.rustJobs),
    ],
    {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
    },
  );
  if (rust.error !== undefined) {
    throw rust.error;
  }
  assert.equal(
    rust.status,
    0,
    `Rust batch generation failed:\n${rust.stderr}`,
  );
  const rows = rust.stdout
    .trim()
    .split("\n")
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line));
  assert.equal(rows.length, generationOptions.sampleCount);
  const summaryLines = rust.stderr
    .trim()
    .split("\n")
    .filter(line => line.startsWith("{"));
  const rustSummary = JSON.parse(summaryLines.at(-1) ?? "{}");
  assert.equal(
    rustSummary.selectedCandidateCount,
    generationOptions.sampleCount,
  );

  const profile = getUniquePathCoverProfile(PROFILE_ID);
  const entryCriteria = {
    terminalPattern: "4-4-4",
    terminalCount: 12,
    symbolPathCounts: SYMBOL_PATH_COUNTS,
    minimumForcedExitCount: 0,
    maximumForcedExitCount: 12,
    maximumLineConcentration: 6,
  };
  const topologyHashes = new Set();
  const candidates = rows.map(row => {
    assert.equal(row.trimCount, 5);
    assert.ok(!topologyHashes.has(row.topologyHash));
    topologyHashes.add(row.topologyHash);
    const solved = solvePuzzle(row.puzzle, {
      solutionLimit: 2,
      stateBudget: generationOptions.solverStateBudget,
    });
    assert.equal(solved.status, "solved", `${row.seed}: TypeScript parity`);
    assert.deepEqual(
      solved.solutionCount,
      {kind: "exact", count: 1},
      `${row.seed}: TypeScript parity solution count`,
    );
    assert.equal(
      solutionHash(solved.canonicalSolution, row.puzzle.width),
      row.canonicalSolutionHash,
      `${row.seed}: canonical solution hash`,
    );
    assert.deepEqual(
      solved.metrics,
      row.solverMetrics,
      `${row.seed}: Rust/TypeScript solver metrics`,
    );
    const rematerialized = materializePathPlan(
      solved.canonicalSolution.paths.map((path, pathIndex) => ({
        role:
          pathIndex === 0
            ? "thread"
            : pathIndex === 1
              ? "spine"
              : "scaffold",
        symbol: path.symbol,
        cells: path.cells,
      })),
      row.puzzle.width,
      row.puzzle.height,
      `${row.seed}::typescript-parity`,
    );
    assert.equal(
      rematerialized.topologyHash,
      row.topologyHash,
      `${row.seed}: topology hash`,
    );
    const coverage = analyzeSolutionCoverage(
      row.puzzle,
      row.canonicalSolution,
    );
    assert.equal(coverage.usedCellCount, 31);
    const geometry = analyzeSolutionGeometry(
      row.puzzle,
      row.canonicalSolution,
    );
    assert.equal(geometry.unexplainedUnitBayCount, 0);
    const straightPathCounts = countStraightPathsByAxis(
      row.canonicalSolution,
    );
    const selectionFilterEvaluation = evaluatePuzzleSelectionFilters(
      row.puzzle,
      profile.puzzleSelectionPolicy.filterRuleIds,
      row.canonicalSolution,
    );
    assert.equal(
      selectionFilterEvaluation.allConfiguredFiltersPassed,
      true,
      `${row.seed}: profile selection policy`,
    );
    const entryResult = analyzeUniquePathCoverEntry(
      row.puzzle,
      entryCriteria,
    );
    assert.equal(entryResult.status, "candidate");
    return {
      id: `${PROFILE_ID}:${row.seed}`,
      seed: row.seed,
      profileId: PROFILE_ID,
      puzzle: row.puzzle,
      canonicalSolution: row.canonicalSolution,
      provenance: {
        implementation: "rust-prototype-builder-and-solver",
        baseSeed: row.baseSeed,
        baseIndex: row.baseIndex,
        variant: row.variant,
        trimCount: row.trimCount,
        topologyHash: row.topologyHash,
        pathLengthProfile: row.pathLengthProfile,
        constructionStateCount: row.constructionStateCount,
      },
      metrics: {
        entryHypothesisCount:
          entryResult.analysis.naturalHypothesisCount,
        forcedExitCount:
          entryResult.analysis.forcedExitTerminalIds.length,
        solverStateCount: row.solverMetrics.exploredStateCount,
        solverBacktrackCount: row.solverMetrics.backtrackCount,
        totalTurnCount: geometry.totalTurnCount,
        ...straightPathCounts,
        usedCellCount: coverage.usedCellCount,
        maximumLineConcentration:
          entryResult.analysis.maximumLineConcentration,
        pairingChoiceCount: entryResult.analysis.pairingChoiceCount,
      },
    };
  });
  return {
    candidates,
    audit: {
      mode: "rust_prototype_trimmed_partial_cover",
      implementation: {
        builder: "rust-prototype",
        solver: "rust-prototype",
        analysisAndReport: "typescript",
      },
      generatedCandidateCount: candidates.length,
      usedCellCountRange: {minimum: 31, maximum: 31},
      usedCellCountCounts: {"31": candidates.length},
      trimCountRange: {minimum: 5, maximum: 5},
      trimCountCounts: {"5": candidates.length},
      variantsPerBase: generationOptions.variantsPerBase,
      maximumBaseCount: generationOptions.maximumBaseCount,
      solverStateBudget: generationOptions.solverStateBudget,
      rustJobs: generationOptions.rustJobs,
      rustBinaryPath: generationOptions.rustBinaryPath,
      acceptanceGates: [
        "rust-solution-first-base",
        "trim-five-endpoint-cells",
        "rust-independent-exact-1",
        "used-cell-count-31-to-31",
        "no-unexplained-unit-bay",
        "profile-puzzle-selection-policy",
        "unique-topology-hash",
        "typescript-full-population-parity",
      ],
      counters: {
        ...rustSummary.counters,
        rawAcceptedCandidateCount:
          rustSummary.counters.acceptedCandidateCount,
        baseAttemptCount: rustSummary.maximumBaseCount,
        baseAcceptedCount: rustSummary.baseAcceptedCount,
        duplicateTopologyCount: rustSummary.duplicateTopologyCount,
        uniqueTopologyCount: rustSummary.uniqueTopologyCount,
        selectedCandidateCount: rustSummary.selectedCandidateCount,
        acceptedCandidateCount: candidates.length,
      },
      rustTiming: {
        elapsedMs: rustSummary.elapsedMillis,
      },
      crossLanguageParity: {
        checkedCandidateCount: candidates.length,
        status: "passed",
        comparedFields: [
          "solution-count",
          "canonical-solution-hash",
          "solver-metrics",
          "topology-hash",
          "profile-selection-policy",
        ],
      },
    },
  };
}

function generatePartialCoverPopulation(generationOptions) {
  const candidates = [];
  const attemptedTopologyHashes = new Set();
  const topologyHashes = new Set();
  const counters = {
    basePuzzleCount: 0,
    transformationAttemptCount: 0,
    entryRejectedCount: 0,
    solverBudgetExhaustedCount: 0,
    nonUniqueCount: 0,
    coverageRejectedCount: 0,
    unitBayRejectedCount: 0,
    puzzleSelectionRejectedCount: 0,
    duplicateTransformationCount: 0,
    duplicateTopologyCount: 0,
  };
  const profile = getUniquePathCoverProfile(PROFILE_ID);
  const trimCounts = createPartialCoverTrimCounts(generationOptions);
  const entryCriteria = {
    terminalPattern: "4-4-4",
    terminalCount: 12,
    symbolPathCounts: SYMBOL_PATH_COUNTS,
    minimumForcedExitCount: 0,
    maximumForcedExitCount: 12,
    maximumLineConcentration: 6,
  };

  for (
    let baseIndex = 0;
    baseIndex < generationOptions.maximumBaseCount
      && candidates.length < generationOptions.sampleCount;
    baseIndex += 1
  ) {
    const baseSeed = `${generationOptions.seedPrefix}-base-${baseIndex}`;
    const basePuzzle = generateWorksheetForProfile(
      {
        difficulty: PROFILE_DIFFICULTY,
        puzzleCount: 1,
        seed: baseSeed,
      },
      PROFILE_ID,
    ).puzzles[0];
    assert.ok(basePuzzle, `${baseSeed}: 基盤問題が生成されませんでした。`);
    counters.basePuzzleCount += 1;

    for (
      let variant = 0;
      variant < generationOptions.variantsPerBase
        && candidates.length < generationOptions.sampleCount;
      variant += 1
    ) {
      counters.transformationAttemptCount += 1;
      const trimCount = trimCounts[variant % trimCounts.length];
      const seed = `${baseSeed}::trim-${variant + 1}`;
      const trimmedPaths = trimPaths(
        basePuzzle.canonicalSolution.paths,
        trimCount,
        createSeededRandom(seed),
      );
      assert.ok(trimmedPaths, `${seed}: 経路を短縮できませんでした。`);
      const plan = materializePathPlan(
        trimmedPaths.map((path, pathIndex) => ({
          role:
            pathIndex === 0
              ? "thread"
              : pathIndex === 1
                ? "spine"
                : "scaffold",
          symbol: path.symbol,
          cells: path.cells,
        })),
        6,
        6,
        seed,
      );
      if (attemptedTopologyHashes.has(plan.topologyHash)) {
        counters.duplicateTransformationCount += 1;
        continue;
      }
      attemptedTopologyHashes.add(plan.topologyHash);
      const entryResult = analyzeUniquePathCoverEntry(
        plan.puzzle,
        entryCriteria,
      );
      if (entryResult.status !== "candidate") {
        counters.entryRejectedCount += 1;
        continue;
      }
      const solved = solvePuzzle(plan.puzzle, {
        solutionLimit: 2,
        stateBudget: generationOptions.solverStateBudget,
      });
      if (solved.status === "budget_exhausted") {
        counters.solverBudgetExhaustedCount += 1;
        continue;
      }
      if (
        solved.status !== "solved"
        || solved.solutionCount.kind !== "exact"
        || solved.solutionCount.count !== 1
      ) {
        counters.nonUniqueCount += 1;
        continue;
      }
      const coverage = analyzeSolutionCoverage(
        plan.puzzle,
        solved.canonicalSolution,
      );
      if (
        coverage.usedCellCount
          < generationOptions.minimumUsedCellCount
        || coverage.usedCellCount
          > generationOptions.maximumUsedCellCount
      ) {
        counters.coverageRejectedCount += 1;
        continue;
      }
      const geometry = analyzeSolutionGeometry(
        plan.puzzle,
        solved.canonicalSolution,
      );
      const straightPathCounts = countStraightPathsByAxis(
        solved.canonicalSolution,
      );
      if (geometry.unexplainedUnitBayCount > 0) {
        counters.unitBayRejectedCount += 1;
        continue;
      }
      const selectionFilterEvaluation = evaluatePuzzleSelectionFilters(
        plan.puzzle,
        profile.puzzleSelectionPolicy.filterRuleIds,
        solved.canonicalSolution,
      );
      if (!selectionFilterEvaluation.allConfiguredFiltersPassed) {
        counters.puzzleSelectionRejectedCount += 1;
        continue;
      }
      if (topologyHashes.has(plan.topologyHash)) {
        counters.duplicateTopologyCount += 1;
        continue;
      }
      topologyHashes.add(plan.topologyHash);
      candidates.push({
        id: `${PROFILE_ID}:${seed}`,
        seed,
        profileId: PROFILE_ID,
        puzzle: plan.puzzle,
        canonicalSolution: solved.canonicalSolution,
        provenance: {
          baseSeed,
          trimCount,
          topologyHash: plan.topologyHash,
        },
        metrics: {
          entryHypothesisCount:
            entryResult.analysis.naturalHypothesisCount,
          forcedExitCount:
            entryResult.analysis.forcedExitTerminalIds.length,
          solverStateCount: solved.metrics.exploredStateCount,
          solverBacktrackCount: solved.metrics.backtrackCount,
          totalTurnCount: geometry.totalTurnCount,
          ...straightPathCounts,
          usedCellCount: coverage.usedCellCount,
          maximumLineConcentration:
            entryResult.analysis.maximumLineConcentration,
          pairingChoiceCount: entryResult.analysis.pairingChoiceCount,
        },
      });
    }
    if ((baseIndex + 1) % 100 === 0) {
      console.error(
        `[partial-cover-generation] base ${baseIndex + 1}, `
        + `accepted ${candidates.length}/${generationOptions.sampleCount}`,
      );
    }
  }

  assert.equal(
    candidates.length,
    generationOptions.sampleCount,
    `${generationOptions.maximumBaseCount}基盤までに`
      + `${generationOptions.sampleCount}問を生成できませんでした。`,
  );
  assert.equal(topologyHashes.size, candidates.length);
  return {
    candidates,
    audit: {
      mode: "trimmed_partial_cover",
      generatedCandidateCount: candidates.length,
      usedCellCountRange: {
        minimum: generationOptions.minimumUsedCellCount,
        maximum: generationOptions.maximumUsedCellCount,
      },
      usedCellCountCounts: Object.fromEntries(
        Array.from(
          {
            length:
              generationOptions.maximumUsedCellCount
              - generationOptions.minimumUsedCellCount
              + 1,
          },
          (_, index) => {
            const usedCellCount =
              generationOptions.minimumUsedCellCount + index;
            return [
              String(usedCellCount),
              candidates.filter(
                candidate =>
                  candidate.metrics.usedCellCount === usedCellCount,
              ).length,
            ];
          },
        ),
      ),
      trimCountRange: {
        minimum: Math.min(...trimCounts),
        maximum: Math.max(...trimCounts),
      },
      trimCountCounts: Object.fromEntries(
        trimCounts.map(trimCount => {
          return [
            String(trimCount),
            candidates.filter(
              candidate => candidate.provenance.trimCount === trimCount,
            ).length,
          ];
        }),
      ),
      variantsPerBase: generationOptions.variantsPerBase,
      maximumBaseCount: generationOptions.maximumBaseCount,
      solverStateBudget: generationOptions.solverStateBudget,
      acceptanceGates: [
        "entry-candidate",
        "independent-exact-1",
        `used-cell-count-${generationOptions.minimumUsedCellCount}`
          + `-to-${generationOptions.maximumUsedCellCount}`,
        "no-unexplained-unit-bay",
        "profile-puzzle-selection-policy",
        "unique-topology-hash",
      ],
      counters: {
        ...counters,
        acceptedCandidateCount: candidates.length,
      },
    },
  };
}

function trimPaths(paths, trimCount, random) {
  const result = paths.map(path => ({
    symbol: path.symbol,
    cells: [...path.cells],
  }));
  for (let index = 0; index < trimCount; index += 1) {
    const options = result.flatMap((path, pathIndex) =>
      path.cells.length > 3
        ? [
            {pathIndex, fromStart: true},
            {pathIndex, fromStart: false},
          ]
        : []
    );
    if (options.length === 0) {
      return null;
    }
    const selected = options[random.integer(0, options.length - 1)];
    const path = result[selected.pathIndex];
    if (selected.fromStart) {
      path.cells.shift();
    } else {
      path.cells.pop();
    }
  }
  return result;
}

function createReportLead(reportOptions) {
  if (reportOptions.generationMode === "ordinary") {
    return `6x6-4-4-4を固定seed系列で36マスcover生成した${
      formatNumber(reportOptions.sampleCount)
    }問だけを母集団とし、filter適用前、全条件通過後、条件ごとの違反群を`
      + "同じ難易度分類で比較します。変形候補や別seed系列は混ぜていません。";
  }
  if (reportOptions.generationMode === "rust-prototype") {
    return `Rust prototypeのbuilderで36マス基盤を作り、経路端を5マス短縮し、`
      + `Rust prototype solverで唯一解を再証明した31マスcover ${
        formatNumber(reportOptions.sampleCount)
      }問を母集団とします。TypeScriptは全問の解数・canonical hash・`
      + "solver metrics・topology hashを照合した後、分類と表示JSONだけを"
      + "担当します。";
  }
  const trimCounts = createPartialCoverTrimCounts(reportOptions);
  const trimDescription =
    trimCounts.length === 1
      ? `${trimCounts[0]}マス`
      : `${Math.min(...trimCounts)}〜${Math.max(...trimCounts)}マス`;
  return `固定seed系列の36マス唯一解から経路端を${trimDescription}短縮し、`
    + `独立solverで唯一解を再証明した${
      formatGeneratedCoverLabel(reportOptions)
    } ${
      formatNumber(reportOptions.sampleCount)
    }問を母集団とします。profile組み込み済みの後段採用gateは短縮後の`
    + "canonical solutionへ再適用し、残る条件を同じ難易度分類で集計します。";
}

function createSamplingDescription(reportOptions) {
  const baseProfile = getUniquePathCoverProfile(PROFILE_ID);
  const basePuzzleSelectionPolicy = {
    policyId: baseProfile.puzzleSelectionPolicy.policyId,
    filterRuleIds: [...baseProfile.puzzleSelectionPolicy.filterRuleIds],
  };
  if (reportOptions.generationMode === "ordinary") {
    return {
      profileSelection: "forced_by_audit_option",
      generationMode: "ordinary_full_cover",
      placementFiltersAppliedDuringGeneration: [],
      puzzleSelectionPolicyAppliedDuringGeneration:
        basePuzzleSelectionPolicy,
      ordinaryGeneratorQualityGatesEnabled: true,
      countUnit: "generated_puzzle",
    };
  }
  if (reportOptions.generationMode === "rust-prototype") {
    return {
      profileSelection: "forced_by_audit_option",
      generationMode: "rust_prototype_trimmed_partial_cover",
      baseGenerationMode: "rust_prototype_solution_first_full_cover",
      builderImplementation: "rust-prototype",
      uniquenessSolverImplementation: "rust-prototype",
      analysisImplementation: "typescript",
      placementFiltersAppliedDuringGeneration: [],
      basePuzzleSelectionPolicyAppliedDuringGeneration:
        basePuzzleSelectionPolicy,
      transformedPuzzleSelectionPolicyAppliedBeforeAcceptance:
        basePuzzleSelectionPolicy,
      independentUniquenessProofRequired: true,
      fullPopulationTypeScriptParityRequired: true,
      topologyDeduplicationEnabled: true,
      countUnit: "accepted_unique_puzzle",
    };
  }
  return {
    profileSelection: "forced_by_audit_option",
    generationMode: "trimmed_partial_cover",
    baseGenerationMode: "ordinary_full_cover",
    placementFiltersAppliedDuringGeneration: [],
    basePuzzleSelectionPolicyAppliedDuringGeneration:
      basePuzzleSelectionPolicy,
    transformedPuzzleSelectionPolicyAppliedBeforeAcceptance:
      basePuzzleSelectionPolicy,
    independentUniquenessProofRequired: true,
    topologyDeduplicationEnabled: true,
    countUnit: "accepted_unique_puzzle",
  };
}

function createPartialCoverTrimCounts(reportOptions) {
  const minimumTrimCount = 36 - reportOptions.maximumUsedCellCount;
  const maximumTrimCount = 36 - reportOptions.minimumUsedCellCount;
  return Array.from(
    {length: maximumTrimCount - minimumTrimCount + 1},
    (_, index) => minimumTrimCount + index,
  );
}

function formatGeneratedCoverLabel(reportOptions) {
  if (reportOptions.generationMode === "ordinary") {
    return "36マスcover";
  }
  return reportOptions.minimumUsedCellCount
      === reportOptions.maximumUsedCellCount
    ? `${reportOptions.minimumUsedCellCount}マスcover`
    : `${reportOptions.minimumUsedCellCount}〜${
      reportOptions.maximumUsedCellCount
    }マスcover`;
}

function formatGenerationStorageKey(reportOptions) {
  if (reportOptions.generationMode === "ordinary") {
    return "ordinary";
  }
  if (reportOptions.generationMode === "rust-prototype") {
    return `rust-prototype-partial-cover-${
      reportOptions.minimumUsedCellCount
    }-to-${reportOptions.maximumUsedCellCount}`;
  }
  return `partial-cover-${reportOptions.minimumUsedCellCount}-to-${
    reportOptions.maximumUsedCellCount
  }`;
}

function parseOptions(arguments_) {
  const defaults = {
    generationMode: "ordinary",
    sampleCount: 2_000,
    ruleIds: DEFAULT_ACTIVE_RULE_IDS,
    seedPrefix: null,
    referenceCorpusPath:
      "/Users/hino/worktrees/kazuno-kaidan/onaji-no-tsunagi/ref/onaji-no-tsunagi-source-corpus.json",
    outputPrefix: null,
    reviewSamplesPerCategory: 4,
    variantsPerBase: 10,
    maximumBaseCount: 10_000,
    solverStateBudget: 500_000,
    minimumUsedCellCount: 31,
    maximumUsedCellCount: 35,
    writeHtml: true,
    rustBinaryPath:
      "generators/onaji-no-tsunagi/rust-prototype/target/release/"
      + "build_trimmed_batch",
    rustJobs: 8,
  };
  const options = {...defaults};
  for (const argument of arguments_) {
    const [name, value] = argument.split("=", 2);
    if (value === undefined) {
      throw new TypeError(`option requires a value: ${argument}`);
    }
    switch (name) {
      case "--generation-mode":
        if (
          !["ordinary", "partial-cover", "rust-prototype"].includes(value)
        ) {
          throw new RangeError(
            "--generation-mode must be ordinary, partial-cover, "
              + "or rust-prototype",
          );
        }
        options.generationMode = value;
        break;
      case "--sample-count":
        options.sampleCount = parsePositiveInteger(name, value);
        break;
      case "--rule-ids":
        options.ruleIds = parseRuleIds(value);
        break;
      case "--seed-prefix":
        options.seedPrefix = value;
        break;
      case "--reference-corpus":
        options.referenceCorpusPath = value;
        break;
      case "--output-prefix":
        options.outputPrefix = value;
        break;
      case "--review-samples":
        options.reviewSamplesPerCategory = parsePositiveInteger(name, value);
        break;
      case "--variants-per-base":
        options.variantsPerBase = parsePositiveInteger(name, value);
        break;
      case "--maximum-base-count":
        options.maximumBaseCount = parsePositiveInteger(name, value);
        break;
      case "--solver-state-budget":
        options.solverStateBudget = parsePositiveInteger(name, value);
        break;
      case "--minimum-used-cell-count":
        options.minimumUsedCellCount = parsePositiveInteger(name, value);
        break;
      case "--maximum-used-cell-count":
        options.maximumUsedCellCount = parsePositiveInteger(name, value);
        break;
      case "--write-html":
        options.writeHtml = parseBoolean(name, value);
        break;
      case "--rust-binary":
        options.rustBinaryPath = value;
        break;
      case "--rust-jobs":
        options.rustJobs = parsePositiveInteger(name, value);
        break;
      default:
        throw new TypeError(`unknown option: ${name}`);
    }
  }
  if (
    options.minimumUsedCellCount < 31
    || options.maximumUsedCellCount > 35
    || options.minimumUsedCellCount > options.maximumUsedCellCount
  ) {
    throw new RangeError(
      "partial cover used-cell range must be within 31 to 35",
    );
  }
  options.seedPrefix ??=
    options.generationMode === "ordinary"
      ? "terminal-filter-audit-v34-6x6-4-4-4"
      : options.generationMode === "rust-prototype"
        ? "rust-31-cell-filter-audit-v1-6x6-4-4-4"
      : options.minimumUsedCellCount === 31
          && options.maximumUsedCellCount === 35
        ? "partial-cover-filter-audit-v34-6x6-4-4-4"
        : `partial-cover-${options.minimumUsedCellCount}-to-${
          options.maximumUsedCellCount
        }-filter-audit-v34-6x6-4-4-4`;
  options.outputPrefix ??=
    options.generationMode === "ordinary"
      ? "/private/tmp/onaji-no-tsunagi-v34-6x6-4-4-4-"
        + "filter-classification-audit-2000-2026-07-26"
      : options.generationMode === "rust-prototype"
        ? "/private/tmp/onaji-no-tsunagi-rust-prototype-6x6-4-4-4-"
          + "31-cell-filter-classification-audit-1000"
      : options.minimumUsedCellCount === 31
          && options.maximumUsedCellCount === 35
        ? "/private/tmp/onaji-no-tsunagi-v34-6x6-4-4-4-"
          + "partial-cover-filter-classification-audit-2000-2026-07-26"
        : "/private/tmp/onaji-no-tsunagi-v34-6x6-4-4-4-"
          + `partial-cover-${options.minimumUsedCellCount}-to-${
            options.maximumUsedCellCount
          }-filter-classification-audit-2000-2026-07-27`;
  return options;
}

function parsePositiveInteger(name, value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseBoolean(name, value) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new RangeError(`${name} must be true or false`);
}

function parseRuleIds(value) {
  const ruleIds = value === ""
    ? []
    : value.split(",").map(ruleId => ruleId.trim());
  if (ruleIds.some(ruleId => ruleId === "")) {
    throw new TypeError("--rule-ids contains an empty rule id");
  }
  if (new Set(ruleIds).size !== ruleIds.length) {
    throw new TypeError("--rule-ids contains duplicate rule ids");
  }
  return ruleIds;
}

function createClassificationCounts() {
  return Object.fromEntries(
    CLASSIFICATION_GROUPS.map(group => [group.id, 0]),
  );
}

function countClassifications(candidates) {
  const counts = createClassificationCounts();
  for (const candidate of candidates) {
    counts[toClassificationGroupId(candidate)] += 1;
  }
  return counts;
}

function addClassificationCounts(left, right) {
  return Object.fromEntries(
    CLASSIFICATION_GROUPS.map(group => [
      group.id,
      left[group.id] + right[group.id],
    ]),
  );
}

function toClassificationRates(counts, total) {
  return Object.fromEntries(
    CLASSIFICATION_GROUPS.map(group => [
      group.id,
      divideOrZero(counts[group.id], total),
    ]),
  );
}

function toClassificationGroupId(candidate) {
  if (candidate.classification !== "mixed") {
    return candidate.classification;
  }
  return candidate.directionScore < 0 ? "mixed_easier" : "mixed_harder";
}

function toPreviousPolicyClassificationGroupId(candidate) {
  const directions = Object.values(candidate.indicatorDirections);
  const comparableCount = directions.filter(
    direction => direction === "comparable",
  ).length;
  const easierCount = directions.filter(
    direction => direction === "easier",
  ).length;
  const harderCount = directions.filter(
    direction => direction === "harder",
  ).length;
  if (comparableCount >= 3) {
    return "reference_like";
  }
  if (
    easierCount >= 2
    && harderCount <= 1
    && easierCount > harderCount
  ) {
    return "clearly_easier";
  }
  if (harderCount >= 2 && easierCount === 0) {
    return "clearly_harder";
  }
  return candidate.directionScore < 0 ? "mixed_easier" : "mixed_harder";
}

function countPreviousPolicyClassifications(candidates) {
  const counts = createClassificationCounts();
  for (const candidate of candidates) {
    counts[toPreviousPolicyClassificationGroupId(candidate)] += 1;
  }
  return counts;
}

function summarizeClassificationPolicyTransitions(candidates) {
  const transitions = new Map();
  for (const candidate of candidates) {
    const previous = toPreviousPolicyClassificationGroupId(candidate);
    const current = toClassificationGroupId(candidate);
    const key = `${previous}->${current}`;
    transitions.set(key, (transitions.get(key) ?? 0) + 1);
  }
  return [...transitions.entries()]
    .map(([key, count]) => {
      const [previous, current] = key.split("->");
      return {previous, current, count};
    })
    .toSorted((left, right) =>
      right.count - left.count
      || left.previous.localeCompare(right.previous)
      || left.current.localeCompare(right.current)
    );
}

function summarizeFailureCombinations(candidates, sampleCount) {
  const byKey = new Map();
  for (const candidate of candidates) {
    const ids = candidate.filterEvaluation.failedRules.map(rule => rule.id);
    const key = ids.join("|");
    const current = byKey.get(key) ?? {
      ruleIds: ids,
      ruleLabels: candidate.filterEvaluation.failedRules.map(
        rule => rule.label,
      ),
      candidates: [],
    };
    current.candidates.push(candidate);
    byKey.set(key, current);
  }
  return [...byKey.values()]
    .map(combination => ({
      ruleIds: combination.ruleIds,
      ruleLabels: combination.ruleLabels,
      count: combination.candidates.length,
      rate: combination.candidates.length / sampleCount,
      classificationCounts: countClassifications(combination.candidates),
    }))
    .toSorted((left, right) => right.count - left.count);
}

function summarizeIndicatorDirections(candidates) {
  const indicators = [
    "entryHypotheses",
    "solverStates",
    "forcedExits",
    "solutionTurns",
  ];
  return Object.fromEntries(indicators.map(indicator => {
    const counts = {
      easier: 0,
      comparable: 0,
      harder: 0,
    };
    for (const candidate of candidates) {
      counts[candidate.indicatorDirections[indicator]] += 1;
    }
    return [indicator, {
      counts,
      rates: Object.fromEntries(
        Object.entries(counts).map(([direction, count]) => [
          direction,
          divideOrZero(count, candidates.length),
        ]),
      ),
    }];
  }));
}

function verifyReport(reportValue, candidates) {
  const checks = [
    "generated-candidate-count",
    "overall-classification-sum",
    "passed-plus-rejected-sum",
    "condition-classification-sums",
    "single-rule-removal-arithmetic",
    "review-candidate-membership",
  ];
  const sumCounts = counts =>
    Object.values(counts).reduce((sum, count) => sum + count, 0);
  assert.equal(
    candidates.length,
    reportValue.sampleCount,
    "生成候補数がsampleCountと一致しません。",
  );
  assert.equal(
    sumCounts(reportValue.overallClassificationCounts),
    reportValue.sampleCount,
    "filter前の分類合計がsampleCountと一致しません。",
  );
  assert.equal(
    sumCounts(
      reportValue.classificationPolicyChange.previousClassificationCounts,
    ),
    reportValue.sampleCount,
    "旧policyの分類合計がsampleCountと一致しません。",
  );
  assert.equal(
    reportValue.classificationPolicyChange.transitions.reduce(
      (sum, transition) => sum + transition.count,
      0,
    ),
    reportValue.sampleCount,
    "分類policy遷移の合計がsampleCountと一致しません。",
  );
  assert.deepEqual(
    reportValue.classificationPolicyChange.currentClassificationCounts,
    reportValue.overallClassificationCounts,
    "新policyの分類集計が全体集計と一致しません。",
  );
  checks.push("classification-policy-transition-sum");
  assert.equal(
    reportValue.allFiltersPassed.count
      + reportValue.rejectedByAnyFilter.count,
    reportValue.sampleCount,
    "通過数と却下数の合計がsampleCountと一致しません。",
  );
  for (const condition of reportValue.conditionViolations) {
    assert.equal(
      sumCounts(condition.classificationCounts),
      condition.violationCount,
      `${condition.id}: 違反群の分類合計が一致しません。`,
    );
    assert.equal(
      condition.ifRemoved.passedCount,
      reportValue.allFiltersPassed.count
        + condition.exclusiveViolationCount,
      `${condition.id}: 単独解除後の通過数が一致しません。`,
    );
    assert.equal(
      condition.referenceLikeViolationCount,
      condition.classificationCounts.reference_like,
      `${condition.id}: 原本近傍違反数が一致しません。`,
    );
    assert.ok(
      condition.referenceLikeReviewCandidates.length
        <= MAX_REVIEW_SAMPLES_PER_GROUP,
    );
    for (const candidate of condition.referenceLikeReviewCandidates) {
      assert.equal(candidate.classification, "reference_like");
      assert.ok(
        candidate.filterEvaluation.failedRules.some(
          rule => rule.id === condition.id,
        ),
        `${candidate.id}: ${condition.id}の違反標本ではありません。`,
      );
    }
  }
  checks.push("condition-reference-like-review-samples");
  const candidateIds = new Set(candidates.map(candidate => candidate.id));
  for (const summary of Object.values(reportValue.byProfile)) {
    for (const group of Object.values(summary.reviewCandidates)) {
      for (const candidate of group) {
        assert.ok(
          candidateIds.has(candidate.id),
          `${candidate.id}: 掲載候補が2,000問の母集団にありません。`,
        );
      }
    }
  }
  if (
    [
      "trimmed_partial_cover",
      "rust_prototype_trimmed_partial_cover",
    ].includes(reportValue.sampling.generationMode)
  ) {
    const topologyHashes = new Set();
    const usedCellCountRange =
      reportValue.generationAudit.usedCellCountRange;
    const trimCountRange = reportValue.generationAudit.trimCountRange;
    const transformedSelectionPolicy =
      reportValue.sampling
        .transformedPuzzleSelectionPolicyAppliedBeforeAcceptance;
    for (const candidate of candidates) {
      assert.ok(
        candidate.metrics.usedCellCount
          >= usedCellCountRange.minimum
          && candidate.metrics.usedCellCount
            <= usedCellCountRange.maximum,
        `${candidate.id}: 使用マス数が監査範囲外です。`,
      );
      assert.ok(
        candidate.provenance.trimCount >= trimCountRange.minimum
          && candidate.provenance.trimCount <= trimCountRange.maximum,
        `${candidate.id}: 短縮数が監査範囲外です。`,
      );
      assert.ok(
        !topologyHashes.has(candidate.provenance.topologyHash),
        `${candidate.id}: topologyが重複しています。`,
      );
      topologyHashes.add(candidate.provenance.topologyHash);
    }
    for (const ruleId of transformedSelectionPolicy.filterRuleIds) {
      const reportRule = reportValue.conditionViolations.find(
        condition => condition.resultKey
          === FILTER_RULE_BY_SELECTION_RULE_ID.get(ruleId)?.resultKey,
      );
      assert.ok(
        reportRule,
        `${ruleId}: 31マス採用gateに対応する監査条件がありません。`,
      );
      assert.equal(
        reportRule.violationCount,
        0,
        `${ruleId}: 31マス採用後の母集団に違反が残っています。`,
      );
    }
    assert.equal(
      reportValue.generationAudit.counters.acceptedCandidateCount,
      candidates.length,
    );
    checks.push(
      "partial-cover-used-cell-count-in-requested-range",
      "partial-cover-trim-count-in-requested-range",
      "partial-cover-unique-topology",
      "partial-cover-independent-exact-1",
      "partial-cover-profile-selection-policy",
    );
  }
  if (
    reportValue.sampling.generationMode
      === "rust_prototype_trimmed_partial_cover"
  ) {
    assert.equal(reportValue.sampling.builderImplementation, "rust-prototype");
    assert.equal(
      reportValue.sampling.uniquenessSolverImplementation,
      "rust-prototype",
    );
    assert.equal(
      reportValue.generationAudit.crossLanguageParity.status,
      "passed",
    );
    assert.equal(
      reportValue.generationAudit.crossLanguageParity
        .checkedCandidateCount,
      candidates.length,
    );
    checks.push(
      "rust-builder-and-solver-used",
      "rust-typescript-full-population-parity",
    );
  }
  return {
    status: "passed",
    checks,
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat("ja-JP").format(value);
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function divideOrZero(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}
