/**
 * 6x6-4-4-4の通常生成問題を、配置条件違反と難易度分類のクロス表にする。
 *
 * 後段の配置filterを適用しない通常生成2,000問を母集団とし、各条件に違反した
 * 問題数と、その違反問題に占める5難易度区分の割合をHTMLとJSONへ出力する。
 * 条件間の違反重複は許容し、一つの問題を複数条件の行へ数える。
 */

import assert from "node:assert/strict";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname} from "node:path";
import {performance} from "node:perf_hooks";

import {decodeReferenceCorpusJson} from "../application/decode-reference-corpus.ts";
import {generateWorksheetForProfile} from "../domain/generation/generate-worksheet.ts";
import {
  analyzeDifficultyReferences,
  toDifficultyCandidate,
} from "./difficulty-audit-analysis.mjs";
import {
  CLASSIFICATION_POLICY,
  calculateReferencePercentiles,
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
import {classifyCandidate} from "./difficulty-audit-policy.mjs";

const PROFILE_ID = "6x6-4-4-4";
const PROFILE_DIFFICULTY = 2;
const DEFAULT_ACTIVE_RULE_IDS = [
  "central-4x4-all-symbols",
  "central-4x4-three-to-five-terminals",
  "reject-same-symbol-edge-adjacency",
  "reject-filled-two-by-two-terminal-blocks",
  "at-most-two-central-boundary-adjacencies",
  "reject-three-orthogonal-pairs-on-one-outer-side",
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
  TERMINAL_PLACEMENT_GATE_RULES.map(rule => [rule.id, rule]),
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

for (let index = 0; index < options.sampleCount; index += 1) {
  const seed = `${options.seedPrefix}-${index}`;
  const worksheet = generateWorksheetForProfile(
    {
      difficulty: PROFILE_DIFFICULTY,
      puzzleCount: 1,
      seed,
    },
    PROFILE_ID,
  );
  const generated = worksheet.puzzles[0];
  assert.ok(generated, `${seed}: 問題が生成されませんでした。`);
  assert.equal(generated.provenance.profileId, PROFILE_ID);
  const placement = analyzeTerminalPlacementHypotheses(generated.puzzle);
  const failedRules = [];
  for (const counter of ruleCounters) {
    if (placement[counter.resultKey] === true) {
      continue;
    }
    failedRules.push({
      id: counter.id,
      label: counter.label,
    });
  }
  const classified = {
    ...classifyCandidate(
      toDifficultyCandidate(seed, generated),
      reference,
    ),
    placement,
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
      `[filter-classification-audit] ${index + 1}/${options.sampleCount}`,
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
const conditionViolations = ruleCounters.map(counter => {
  const violationCandidates = classifiedCandidates.filter(candidate =>
    candidate.filterEvaluation.failedRules.some(rule => rule.id === counter.id)
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
    "onaji-no-tsunagi.six-by-six-filter-classification-audit.v3",
  generatedAt: new Date().toISOString(),
  generatorTrack: "v3.4-draft.3",
  reportTitle:
    `おなじのつなぎ 6x6-4-4-4・通常生成${
      formatNumber(options.sampleCount)
    }問 統合監査`,
  toolbarSummary:
    `同一母集団 ${formatNumber(options.sampleCount)}問 / ${
      formatNumber(options.ruleIds.length)
    }条件`,
  lead:
    `6x6-4-4-4を固定seed系列で通常生成した${
      formatNumber(options.sampleCount)
    }問だけを母集団とし、`
    + "filter適用前、全条件通過後、条件ごとの違反群を同じ難易度分類で"
    + "比較します。変形候補や別seed系列は一切混ぜていません。",
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
    "onaji-no-tsunagi-v34-6x6-4-4-4-filter-audit-review-v3",
  reviewExportFileName:
    "onaji-no-tsunagi-v34-6x6-4-4-4-filter-audit-human-review.json",
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
  sampling: {
    profileSelection: "forced_by_audit_option",
    placementFiltersAppliedDuringGeneration: [],
    ordinaryGeneratorQualityGatesEnabled: true,
    countUnit: "generated_puzzle",
  },
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
      cohortLabel: `通常生成した全${formatNumber(options.sampleCount)}問`,
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
await Promise.all([
  writeFile(
    `${options.outputPrefix}.json`,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    `${options.outputPrefix}.html`,
    renderDifficultyAuditHtml(report),
    "utf8",
  ),
]);

console.log(JSON.stringify({
  jsonPath: `${options.outputPrefix}.json`,
  htmlPath: `${options.outputPrefix}.html`,
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

function parseOptions(arguments_) {
  const defaults = {
    sampleCount: 2_000,
    ruleIds: DEFAULT_ACTIVE_RULE_IDS,
    seedPrefix: "terminal-filter-audit-v34-6x6-4-4-4",
    referenceCorpusPath:
      "/Users/hino/worktrees/kazuno-kaidan/onaji-no-tsunagi/ref/onaji-no-tsunagi-source-corpus.json",
    outputPrefix:
      "/private/tmp/onaji-no-tsunagi-v34-6x6-4-4-4-filter-classification-audit-2000-2026-07-26",
    reviewSamplesPerCategory: 4,
  };
  const options = {...defaults};
  for (const argument of arguments_) {
    const [name, value] = argument.split("=", 2);
    if (value === undefined) {
      throw new TypeError(`option requires a value: ${argument}`);
    }
    switch (name) {
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
      default:
        throw new TypeError(`unknown option: ${name}`);
    }
  }
  return options;
}

function parsePositiveInteger(name, value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return parsed;
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
  }
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
  return {
    status: "passed",
    checks: [
      "generated-candidate-count",
      "overall-classification-sum",
      "passed-plus-rejected-sum",
      "condition-classification-sums",
      "single-rule-removal-arithmetic",
      "review-candidate-membership",
    ],
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
