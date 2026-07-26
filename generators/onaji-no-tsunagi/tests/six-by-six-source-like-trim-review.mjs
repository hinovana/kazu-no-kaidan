/**
 * 6x6-4-4-4の唯一解経路を短縮し、原本寄せ候補を人間レビュー用に出力する。
 *
 * この実験は本番profileを変更しない。36マスを使う既存の唯一解から経路端を
 * 0〜5マス短縮し、端点だけから独立solverで唯一解を再証明する。配置6条件と
 * 低曲がり条件を通過した候補を、原本基準の5レビュー区分へ最大20問ずつ出す。
 */

import {readFile, writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';

import {decodeReferenceCorpusJson} from '../application/decode-reference-corpus.ts';
import {generateWorksheetForProfile} from '../domain/generation/generate-worksheet.ts';
import {materializePathPlan} from '../domain/generation/materialize-path-plan.ts';
import {createSeededRandom} from '../domain/generation/random.ts';
import {solvePuzzle} from '../domain/solver/solve-puzzle.ts';
import {analyzeSolutionCoverage} from '../domain/validation/analyze-solution-coverage.ts';
import {analyzeSolutionGeometry} from '../domain/validation/analyze-solution-geometry.ts';
import {analyzeTerminalPlacement} from '../domain/validation/analyze-terminal-placement.ts';
import {analyzeUniquePathCoverEntry} from '../domain/validation/analyze-unique-path-cover-entry.ts';
import {
  analyzeDifficultyReferences,
  toDifficultyCandidate,
} from './difficulty-audit-analysis.mjs';
import {classifyCandidate} from './difficulty-audit-policy.mjs';

const REVIEW_LIMIT_PER_GROUP = 20;
const PROFILE_ID = '6x6-4-4-4';
const PROFILE_DIFFICULTY = 2;
const SYMBOL_PATH_COUNTS = [2, 2, 2];
const ACTIVE_PLACEMENT_RULES = [
  {
    id: 'central-symbol-coverage',
    label: '中央4×4に各記号1個以上',
    resultKey: 'satisfiesCentralSymbolCoverage',
  },
  {
    id: 'central-terminal-count',
    label: '中央4×4は合計3〜5個',
    resultKey: 'satisfiesCentralTerminalCountRange',
  },
  {
    id: 'different-symbol-edge-adjacency',
    label: '外周の同記号隣接を禁止',
    resultKey: 'satisfiesDifferentSymbolEdgeAdjacency',
  },
  {
    id: 'filled-two-by-two-terminal-block',
    label: '端点で埋まる2×2を禁止',
    resultKey: 'satisfiesNoFilledTwoByTwoTerminalBlock',
  },
  {
    id: 'central-boundary-adjacency',
    label: '中央・外周境界は最大2組',
    resultKey: 'satisfiesLimitedCentralBoundaryAdjacency',
  },
  {
    id: 'concentrated-orthogonal-edge-pairs',
    label: '外周一辺集中型3組を禁止',
    resultKey: 'satisfiesNoConcentratedOrthogonalEdgePairs',
  },
];
const REVIEW_GROUPS = [
  {
    id: 'clearly_easier',
    label: '明らかに簡単側',
    description: '4指標のうち2指標以上が簡単側で、難しい側がない候補。',
  },
  {
    id: 'reference_like',
    label: '原本近傍',
    description: '4指標のうち3指標以上が原本許容帯に入る候補。',
  },
  {
    id: 'clearly_harder',
    label: '明らかに難しい側',
    description: '4指標のうち2指標以上が難しい側で、簡単側がない候補。',
  },
  {
    id: 'mixed_easier',
    label: '指標混合: 簡単寄り',
    description: '簡単・難しい方向が混在し、direction scoreが負の候補。',
  },
  {
    id: 'mixed_harder',
    label: '指標混合: 難しい寄り',
    description: '簡単・難しい方向が混在し、direction scoreが正または0の候補。',
  },
];

const options = parseOptions(process.argv.slice(2));
const referenceText = await readFile(options.referenceCorpusPath, 'utf8');
const decodedReference = decodeReferenceCorpusJson(referenceText);
if (!decodedReference.ok) {
  throw new TypeError(decodedReference.errors.join('\n'));
}
const reference = analyzeDifficultyReferences(
  decodedReference.corpus,
).get(PROFILE_ID);
if (reference === undefined) {
  throw new Error(`${PROFILE_ID}: reference problem is missing`);
}

const entryCriteria = {
  terminalPattern: '4-4-4',
  terminalCount: 12,
  symbolPathCounts: SYMBOL_PATH_COUNTS,
  minimumForcedExitCount: 0,
  maximumForcedExitCount: 10,
  maximumLineConcentration: 6,
};
const counters = {
  basePuzzleCount: 0,
  transformationAttemptCount: 0,
  placementRejectedCount: 0,
  entryRejectedCount: 0,
  solverBudgetExhaustedCount: 0,
  nonUniqueCount: 0,
  uniqueCount: 0,
  geometryRejectedCount: 0,
  acceptedBeforeDeduplicationCount: 0,
  duplicateTopologyCount: 0,
};
const placementRuleCounters = ACTIVE_PLACEMENT_RULES.map(rule => ({
  ...rule,
  standaloneRejectedCount: 0,
  sequentialReachedCount: 0,
  sequentialRejectedCount: 0,
  rejectedCandidateOutcomes: createCandidateOutcomeCounts(),
  marginalCandidateOutcomes: createCandidateOutcomeCounts(),
}));
const acceptedByTopology = new Map();
const startedAt = performance.now();
const generatedPuzzleConditionAudit =
  auditGeneratedPuzzleConditionClassifications(
    options.conditionTableSampleCount,
    options.conditionTableSeedPrefix,
    reference,
  );

for (let baseIndex = 0; baseIndex < options.baseCount; baseIndex += 1) {
  const baseSeed = `${options.seedPrefix}-base-${baseIndex}`;
  const basePuzzle = generateWorksheetForProfile(
    {difficulty: PROFILE_DIFFICULTY, puzzleCount: 1, seed: baseSeed},
    PROFILE_ID,
  ).puzzles[0];
  if (basePuzzle === undefined) {
    throw new Error(`${baseSeed}: base puzzle was not generated`);
  }
  counters.basePuzzleCount += 1;

  for (
    let variant = 0;
    variant < options.variantsPerBase;
    variant += 1
  ) {
    counters.transformationAttemptCount += 1;
    const seed = `${baseSeed}::trim-${variant}`;
    const trimCount = variant === 0 ? 0 : 1 + ((variant - 1) % 5);
    const trimmedPaths = trimPaths(
      basePuzzle.canonicalSolution.paths,
      trimCount,
      createSeededRandom(seed),
    );
    if (trimmedPaths === null) {
      throw new Error(`${seed}: paths could not be trimmed`);
    }
    const plan = materializePathPlan(
      trimmedPaths.map((path, pathIndex) => ({
        role:
          pathIndex === 0
            ? 'thread'
            : pathIndex === 1
              ? 'spine'
              : 'scaffold',
        symbol: path.symbol,
        cells: path.cells,
      })),
      6,
      6,
      seed,
    );
    const placement = analyzeTerminalPlacement(plan.puzzle);
    let previousRulesPassed = true;
    const failedRuleCounters = [];
    for (const counter of placementRuleCounters) {
      const passed = placement[counter.resultKey] === true;
      if (!passed) {
        counter.standaloneRejectedCount += 1;
        failedRuleCounters.push(counter);
      }
      if (previousRulesPassed) {
        counter.sequentialReachedCount += 1;
        if (!passed) {
          counter.sequentialRejectedCount += 1;
          previousRulesPassed = false;
        }
      }
    }
    const evaluation = evaluateCandidatePlan({
      plan,
      seed,
      baseSeed,
      trimCount,
      entryCriteria,
      reference,
      options,
    });
    for (const counter of failedRuleCounters) {
      recordCandidateOutcome(counter.rejectedCandidateOutcomes, evaluation);
    }
    if (failedRuleCounters.length === 1) {
      recordCandidateOutcome(
        failedRuleCounters[0].marginalCandidateOutcomes,
        evaluation,
      );
    }
    if (!previousRulesPassed) {
      counters.placementRejectedCount += 1;
      continue;
    }
    if (evaluation.status === 'entry_rejected') {
      counters.entryRejectedCount += 1;
      continue;
    }
    if (evaluation.status === 'solver_budget_exhausted') {
      counters.solverBudgetExhaustedCount += 1;
      continue;
    }
    if (evaluation.status === 'non_unique') {
      counters.nonUniqueCount += 1;
      continue;
    }
    counters.uniqueCount += 1;
    if (evaluation.status === 'geometry_rejected') {
      counters.geometryRejectedCount += 1;
      continue;
    }
    const {candidate, coverage, geometry} = evaluation;
    counters.acceptedBeforeDeduplicationCount += 1;
    if (acceptedByTopology.has(plan.topologyHash)) {
      counters.duplicateTopologyCount += 1;
      continue;
    }
    acceptedByTopology.set(plan.topologyHash, {
      ...candidate,
      coverage,
      geometry,
      placement: summarizePlacement(placement),
    });
  }
  if ((baseIndex + 1) % 25 === 0) {
    console.error(
      `[source-like-trim-review] ${baseIndex + 1}/${options.baseCount}`,
    );
  }
}

const candidates = [...acceptedByTopology.values()];
const classificationCounts = summarizeClassifications(candidates);
const reviewGroups = selectReviewGroups(candidates);
const elapsedMs = Math.round(performance.now() - startedAt);
const report = {
  schemaVersion: 'onaji-no-tsunagi.source-like-trim-review.v2',
  generatedAt: new Date().toISOString(),
  generatorTrack: 'v3.4-draft.3-experiment',
  profileId: PROFILE_ID,
  experiment: {
    method:
      '既存の36マス唯一解から経路端を0〜5マス短縮し、端点だけから唯一解を再証明する。',
    productionBehaviorChanged: false,
    baseCount: options.baseCount,
    variantsPerBase: options.variantsPerBase,
    seedPrefix: options.seedPrefix,
    minimumUsedCellCount: options.minimumUsedCellCount,
    maximumUsedCellCount: options.maximumUsedCellCount,
    maximumTotalTurnCount: options.maximumTotalTurnCount,
    generatedPuzzleConditionAudit,
    activePlacementRules: placementRuleCounters.map(counter => ({
      id: counter.id,
      label: counter.label,
      resultKey: counter.resultKey,
      standaloneRejectedCount: counter.standaloneRejectedCount,
      standaloneRejectionRate:
        counter.standaloneRejectedCount
        / counters.transformationAttemptCount,
      sequentialReachedCount: counter.sequentialReachedCount,
      sequentialRejectedCount: counter.sequentialRejectedCount,
      sequentialRejectionRate:
        counter.sequentialRejectedCount / counter.sequentialReachedCount,
      rejectedCandidateOutcomes: summarizeCandidateOutcomes(
        counter.rejectedCandidateOutcomes,
      ),
      marginalCandidateOutcomes: summarizeCandidateOutcomes(
        counter.marginalCandidateOutcomes,
      ),
    })),
  },
  reference: {
    sourceProblemId: reference.sourceProblemId,
    metrics: reference.metrics,
  },
  timing: {
    elapsedMs,
    elapsedSeconds: elapsedMs / 1_000,
    averageMsPerTransformation:
      elapsedMs / counters.transformationAttemptCount,
  },
  counts: {
    ...counters,
    acceptedTopologyCount: candidates.length,
    classificationCounts,
    displayedReviewCandidateCount: Object.values(reviewGroups).reduce(
      (total, group) => total + group.length,
      0,
    ),
  },
  reviewGroups,
};

await Promise.all([
  writeFile(
    `${options.outputPrefix}.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  ),
  writeFile(`${options.outputPrefix}.html`, renderHtml(report)),
]);

console.log(JSON.stringify({
  jsonPath: `${options.outputPrefix}.json`,
  htmlPath: `${options.outputPrefix}.html`,
  timing: report.timing,
  counts: report.counts,
  displayedByGroup: Object.fromEntries(
    REVIEW_GROUPS.map(group => [
      group.id,
      report.reviewGroups[group.id].length,
    ]),
  ),
}, null, 2));

function parseOptions(arguments_) {
  const defaults = {
    baseCount: 1_500,
    variantsPerBase: 30,
    solverStateBudget: 200_000,
    minimumUsedCellCount: 31,
    maximumUsedCellCount: 36,
    maximumTotalTurnCount: 8,
    conditionTableSampleCount: 2_000,
    conditionTableSeedPrefix:
      'terminal-filter-audit-v34-6x6-4-4-4',
    seedPrefix: 'source-like-trim-review-6x6-4-4-4',
    referenceCorpusPath:
      '/Users/hino/worktrees/kazuno-kaidan/onaji-no-tsunagi/ref/onaji-no-tsunagi-source-corpus.json',
    outputPrefix:
      '/private/tmp/onaji-no-tsunagi-v34-6x6-4-4-4-source-like-trim-review-2026-07-26',
  };
  const options = {...defaults};
  for (const argument of arguments_) {
    const [name, value] = argument.split('=', 2);
    if (value === undefined) {
      throw new TypeError(`option requires a value: ${argument}`);
    }
    switch (name) {
      case '--base-count':
        options.baseCount = parsePositiveInteger(name, value);
        break;
      case '--variants-per-base':
        options.variantsPerBase = parsePositiveInteger(name, value);
        break;
      case '--solver-state-budget':
        options.solverStateBudget = parsePositiveInteger(name, value);
        break;
      case '--condition-table-sample-count':
        options.conditionTableSampleCount =
          parsePositiveInteger(name, value);
        break;
      case '--condition-table-seed-prefix':
        options.conditionTableSeedPrefix = value;
        break;
      case '--seed-prefix':
        options.seedPrefix = value;
        break;
      case '--reference-corpus':
        options.referenceCorpusPath = value;
        break;
      case '--output-prefix':
        options.outputPrefix = value;
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
        : [],
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

function auditGeneratedPuzzleConditionClassifications(
  sampleCount,
  seedPrefix,
  reference,
) {
  const conditionViolations = ACTIVE_PLACEMENT_RULES.map(rule => ({
    ...rule,
    violationCount: 0,
    classificationCounts: createDifficultyClassificationCounts(),
  }));
  const overallClassificationCounts =
    createDifficultyClassificationCounts();
  for (let index = 0; index < sampleCount; index += 1) {
    const seed = `${seedPrefix}-${index}`;
    const generated = generateWorksheetForProfile(
      {
        difficulty: PROFILE_DIFFICULTY,
        puzzleCount: 1,
        seed,
      },
      PROFILE_ID,
    ).puzzles[0];
    if (generated === undefined) {
      throw new Error(`${seed}: condition table puzzle was not generated`);
    }
    const classified = classifyCandidate(
      toDifficultyCandidate(seed, generated),
      reference,
    );
    const classificationId =
      classified.classification === 'mixed'
        ? classified.directionScore < 0
          ? 'mixed_easier'
          : 'mixed_harder'
        : classified.classification;
    overallClassificationCounts[classificationId] += 1;
    const placement = analyzeTerminalPlacement(generated.puzzle);
    for (const condition of conditionViolations) {
      if (placement[condition.resultKey] === true) {
        continue;
      }
      condition.violationCount += 1;
      condition.classificationCounts[classificationId] += 1;
    }
    if ((index + 1) % 100 === 0) {
      console.error(
        `[source-like-condition-table] ${index + 1}/${sampleCount}`,
      );
    }
  }
  return {
    sampleCount,
    seedPrefix,
    countUnit: 'generated_puzzle',
    placementFiltersAppliedDuringGeneration: [],
    overallClassificationCounts,
    conditionViolations: conditionViolations.map(condition => ({
      id: condition.id,
      label: condition.label,
      resultKey: condition.resultKey,
      violationCount: condition.violationCount,
      violationRate: condition.violationCount / sampleCount,
      classificationCounts: condition.classificationCounts,
      classificationRates: Object.fromEntries(
        REVIEW_GROUPS.map(group => [
          group.id,
          divideOrZero(
            condition.classificationCounts[group.id],
            condition.violationCount,
          ),
        ]),
      ),
    })),
  };
}

function createDifficultyClassificationCounts() {
  return Object.fromEntries(
    REVIEW_GROUPS.map(group => [group.id, 0]),
  );
}

function evaluateCandidatePlan({
  plan,
  seed,
  baseSeed,
  trimCount,
  entryCriteria,
  reference,
  options,
}) {
  const entryResult = analyzeUniquePathCoverEntry(
    plan.puzzle,
    entryCriteria,
  );
  if (entryResult.status !== 'candidate') {
    return {status: 'entry_rejected'};
  }
  const solved = solvePuzzle(plan.puzzle, {
    solutionLimit: 2,
    stateBudget: options.solverStateBudget,
  });
  if (solved.status === 'budget_exhausted') {
    return {status: 'solver_budget_exhausted'};
  }
  if (
    solved.status !== 'solved'
    || solved.solutionCount.kind !== 'exact'
    || solved.solutionCount.count !== 1
  ) {
    return {status: 'non_unique'};
  }
  const geometry = analyzeSolutionGeometry(
    plan.puzzle,
    solved.canonicalSolution,
  );
  const coverage = analyzeSolutionCoverage(
    plan.puzzle,
    solved.canonicalSolution,
  );
  if (
    coverage.usedCellCount < options.minimumUsedCellCount
    || coverage.usedCellCount > options.maximumUsedCellCount
    || geometry.totalTurnCount > options.maximumTotalTurnCount
    || geometry.unexplainedUnitBayCount > 0
  ) {
    return {status: 'geometry_rejected'};
  }
  const candidate = classifyCandidate(
    {
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
        usedCellCount: coverage.usedCellCount,
        maximumLineConcentration:
          entryResult.analysis.maximumLineConcentration,
        pairingChoiceCount: entryResult.analysis.pairingChoiceCount,
      },
    },
    reference,
  );
  return {status: 'classifiable', candidate, coverage, geometry};
}

function createCandidateOutcomeCounts() {
  return {
    totalCount: 0,
    entryRejectedCount: 0,
    solverBudgetExhaustedCount: 0,
    nonUniqueCount: 0,
    geometryRejectedCount: 0,
    classifiableCount: 0,
    classificationCounts: {
      clearly_easier: 0,
      reference_like: 0,
      clearly_harder: 0,
      mixed_easier: 0,
      mixed_harder: 0,
    },
  };
}

function recordCandidateOutcome(counts, evaluation) {
  counts.totalCount += 1;
  if (evaluation.status === 'classifiable') {
    counts.classifiableCount += 1;
    const groupId =
      evaluation.candidate.classification === 'mixed'
        ? evaluation.candidate.directionScore < 0
          ? 'mixed_easier'
          : 'mixed_harder'
        : evaluation.candidate.classification;
    counts.classificationCounts[groupId] += 1;
    return;
  }
  counts[`${toCamelCase(evaluation.status)}Count`] += 1;
}

function summarizeCandidateOutcomes(counts) {
  const unclassifiedCount =
    counts.entryRejectedCount
    + counts.solverBudgetExhaustedCount
    + counts.nonUniqueCount
    + counts.geometryRejectedCount;
  if (counts.classifiableCount + unclassifiedCount !== counts.totalCount) {
    throw new Error('candidate outcome counts do not add up');
  }
  return {
    ...counts,
    unclassifiedCount,
    classifiableRate: divideOrZero(
      counts.classifiableCount,
      counts.totalCount,
    ),
  };
}

function toCamelCase(value) {
  return value.replace(/_([a-z])/g, (_match, letter) =>
    letter.toUpperCase(),
  );
}

function divideOrZero(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function summarizePlacement(placement) {
  return {
    centralTerminalCount: placement.centralTerminalCount,
    adjacentCentralTerminalPairCount:
      placement.adjacentCentralTerminalPairCount,
    adjacentEdgeTerminalPairCount:
      placement.adjacentEdgeTerminalPairCount,
    centralBoundaryAdjacentTerminalPairCount:
      placement.centralBoundaryAdjacentTerminalPairCount,
    maximumOrthogonalEdgeTerminalPairCount:
      placement.maximumOrthogonalEdgeTerminalPairCount,
  };
}

function summarizeClassifications(candidates) {
  const counts = {
    clearly_easier: 0,
    reference_like: 0,
    clearly_harder: 0,
    mixed: 0,
    mixed_easier: 0,
    mixed_harder: 0,
  };
  for (const candidate of candidates) {
    counts[candidate.classification] += 1;
    if (candidate.classification === 'mixed') {
      counts[
        candidate.directionScore < 0 ? 'mixed_easier' : 'mixed_harder'
      ] += 1;
    }
  }
  return counts;
}

function selectReviewGroups(candidates) {
  const groups = {
    clearly_easier: candidates
      .filter(candidate => candidate.classification === 'clearly_easier')
      .toSorted(
        (left, right) =>
          left.directionScore - right.directionScore
          || left.referenceDistance - right.referenceDistance,
      ),
    reference_like: candidates
      .filter(candidate => candidate.classification === 'reference_like')
      .toSorted(
        (left, right) =>
          left.referenceDistance - right.referenceDistance
          || Math.abs(left.directionScore) - Math.abs(right.directionScore),
      ),
    clearly_harder: candidates
      .filter(candidate => candidate.classification === 'clearly_harder')
      .toSorted(
        (left, right) =>
          right.directionScore - left.directionScore
          || left.referenceDistance - right.referenceDistance,
      ),
    mixed_easier: candidates
      .filter(
        candidate =>
          candidate.classification === 'mixed'
          && candidate.directionScore < 0,
      )
      .toSorted(
        (left, right) =>
          left.directionScore - right.directionScore
          || left.referenceDistance - right.referenceDistance,
      ),
    mixed_harder: candidates
      .filter(
        candidate =>
          candidate.classification === 'mixed'
          && candidate.directionScore >= 0,
      )
      .toSorted(
        (left, right) =>
          right.directionScore - left.directionScore
          || left.referenceDistance - right.referenceDistance,
      ),
  };
  return Object.fromEntries(
    Object.entries(groups).map(([groupId, group]) => [
      groupId,
      group.slice(0, REVIEW_LIMIT_PER_GROUP),
    ]),
  );
}

function renderHtml(reportValue) {
  const groupSections = REVIEW_GROUPS.map(group => {
    const candidates = reportValue.reviewGroups[group.id];
    const totalCount =
      reportValue.counts.classificationCounts[group.id]
      ?? reportValue.counts.classificationCounts[group.id.replace(
        /^mixed_(easier|harder)$/,
        'mixed',
      )]
      ?? 0;
    const cards = candidates.map((candidate, index) =>
      renderCandidateCard(candidate, group, index),
    ).join('');
    return `<section class="review-section" id="${group.id}">
      <div class="section-head">
        <div><h2>${escapeHtml(group.label)}</h2>
        <p>${escapeHtml(group.description)}</p></div>
        <strong>${formatNumber(candidates.length)}問表示 / ${
          formatNumber(totalCount)
        }問該当</strong>
      </div>
      ${cards.length === 0
        ? '<p class="empty">この実験コーパスでは該当候補がありませんでした。</p>'
        : `<div class="review-grid">${cards}</div>`}
    </section>`;
  }).join('');
  const classificationPanels = REVIEW_GROUPS.map(group => {
    const count = reportValue.counts.classificationCounts[group.id] ?? 0;
    const shown = reportValue.reviewGroups[group.id].length;
    return `<a class="classification-panel" href="#${group.id}">
      <span>${escapeHtml(group.label)}</span>
      <strong>${formatNumber(count)}問</strong>
      <small>最大20問中 ${formatNumber(shown)}問表示</small>
    </a>`;
  }).join('');
  const ruleList = reportValue.experiment.activePlacementRules
    .map(rule => `<li>${escapeHtml(rule.label)}</li>`)
    .join('');
  const conditionOverview = renderConditionOverviewTable(
    reportValue.experiment.generatedPuzzleConditionAudit,
  );
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>6x6-4-4-4 原本寄せ短縮実験レビュー</title>
<style>
  :root { color-scheme: light; font-family: system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef1ed; color: #1e302c; }
  .toolbar { position: sticky; top: 0; z-index: 5; display: flex;
    align-items: center; gap: 16px; min-height: 58px; padding: 8px 16px;
    background: rgba(255,255,252,.97); border-bottom: 1px solid #bac7c2;
    backdrop-filter: blur(8px); }
  .toolbar h1 { margin: 0; font-size: 18px; white-space: nowrap; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px; font-size: 13px; }
  .pill { padding: 5px 9px; border-radius: 999px; background: #e1ebe7; }
  details { margin-left: auto; font-size: 13px; }
  details[open] { position: absolute; right: 12px; top: 52px; width: 440px;
    max-height: 75vh; overflow: auto; padding: 12px 18px; background: #fff;
    border: 1px solid #bac7c2; border-radius: 10px;
    box-shadow: 0 12px 32px #20332f33; }
  .experiment-note { margin: 8px; padding: 12px 14px; background: #fff;
    border: 1px solid #bdc9c5; border-radius: 10px; }
  .experiment-note h2 { margin: 0; font-size: 16px; }
  .experiment-note p { margin: 5px 0 0; font-size: 12px; color: #52635e; }
  .classification-grid { display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px;
    margin: 8px; }
  .classification-panel { display: grid; gap: 2px; padding: 10px;
    border: 1px solid #bdc9c5; border-radius: 8px; background: #fff;
    color: inherit; text-decoration: none; }
  .classification-panel span { font-size: 12px; }
  .classification-panel strong { font-size: 21px; color: #b84f2c; }
  .classification-panel small { color: #61706c; font-size: 10px; }
  .condition-heading { margin: 8px 8px 0; padding: 9px 10px;
    background: #fff; border: 1px solid #bdc9c5; border-bottom: 0;
    border-radius: 10px 10px 0 0; }
  .condition-heading h2 { margin: 0; font-size: 15px; }
  .condition-heading p { margin: 3px 0 0; color: #52635e;
    font-size: 11px; }
  .condition-table-wrap { margin: 0 8px 12px; overflow-x: auto;
    border: 1px solid #bdc9c5; border-radius: 9px; background: #fff; }
  .condition-table { width: 100%; min-width: 1120px;
    border-collapse: separate; border-spacing: 0; font-size: 11px; }
  .condition-table th, .condition-table td { padding: 8px 9px;
    border-top: 1px solid #dce2df; border-left: 1px solid #e3e8e6;
    text-align: right; vertical-align: middle; }
  .condition-table thead th { border-top: 0; color: #52635e;
    background: #f4f7f5; line-height: 1.35; }
  .condition-table th:first-child, .condition-table td:first-child {
    position: sticky; left: 0; z-index: 1; width: 245px;
    border-left: 0; text-align: left; background: #fff; }
  .condition-table thead th:first-child { z-index: 2;
    background: #f4f7f5; }
  .condition-table tbody th { font-size: 12px; }
  .condition-table td strong { display: block; font-size: 15px;
    color: #b84f2c; }
  .condition-table td small { display: block; color: #61706c;
    line-height: 1.35; white-space: nowrap; }
  .review-section { margin: 10px 8px 18px; scroll-margin-top: 70px; }
  .section-head { display: flex; justify-content: space-between; gap: 12px;
    align-items: end; padding: 10px 12px; background: #fff0e8;
    border-left: 5px solid #c65d36; border-radius: 7px; }
  .section-head h2 { margin: 0; font-size: 17px; }
  .section-head p { margin: 3px 0 0; color: #52635e; font-size: 11px; }
  .section-head > strong { white-space: nowrap; font-size: 12px; }
  .review-grid { display: grid;
    grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
    gap: 7px; padding-top: 7px; }
  .candidate-card { min-width: 0; border: 1px solid #c3cdca;
    border-radius: 8px; background: #fff; overflow: hidden; }
  .candidate-button { width: 100%; padding: 6px; border: 0;
    background: none; color: inherit; cursor: zoom-in; text-align: left; }
  .candidate-button:hover { background: #fff8e9; }
  .card-head { display: flex; justify-content: space-between; gap: 5px;
    align-items: center; min-width: 0; font-size: 10px; }
  .card-head strong { font-size: 14px; color: #b84f2c; }
  .card-head code { min-width: 0; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; color: #60706b; }
  .candidate-card svg { display: block; width: 100%; aspect-ratio: 1;
    margin: 3px 0; }
  .metric-row { display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 3px; font-size: 9px; color: #52635e; text-align: center; }
  .empty { margin: 8px 0; padding: 18px; background: #fff;
    border-radius: 8px; color: #61706c; }
  dialog { width: min(920px, 94vw); max-height: 94vh; padding: 18px;
    border: 0; border-radius: 14px; box-shadow: 0 20px 70px #0006; }
  dialog::backdrop { background: #172420b3; }
  .dialog-head { display: flex; justify-content: space-between; gap: 12px;
    align-items: start; }
  .dialog-head h2 { margin: 0 0 4px; }
  .dialog-head code { font-size: 12px; overflow-wrap: anywhere; }
  .dialog-close { padding: 8px 14px; border: 1px solid #9baaa5;
    border-radius: 8px; background: #fff; cursor: pointer; }
  .dialog-boards { display: grid; grid-template-columns: 1fr 1fr;
    gap: 22px; margin-top: 12px; }
  .dialog-boards h3 { margin: 0; text-align: center; }
  .dialog-boards svg { width: 100%; max-height: 52vh; }
  .metric-table { width: 100%; margin-top: 12px; border-collapse: collapse;
    font-size: 13px; }
  .metric-table th, .metric-table td { padding: 6px 8px;
    border-top: 1px solid #dce2df; text-align: right; }
  .metric-table th { text-align: left; }
  @media (max-width: 900px) {
    .classification-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 680px) {
    .toolbar { align-items: start; flex-direction: column; gap: 5px; }
    details { margin-left: 0; }
    .review-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .dialog-boards { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
  <header class="toolbar">
    <h1>6x6-4-4-4・原本寄せ短縮実験</h1>
    <div class="summary">
      <span class="pill">基盤 ${
        formatNumber(reportValue.experiment.baseCount)
      }問</span>
      <span class="pill">変形 ${
        formatNumber(reportValue.counts.transformationAttemptCount)
      }候補</span>
      <span class="pill">採用topology ${
        formatNumber(reportValue.counts.acceptedTopologyCount)
      }問</span>
      <span class="pill">${formatSeconds(
        reportValue.timing.elapsedSeconds,
      )}</span>
    </div>
    <details>
      <summary>実験条件</summary>
      <p>${escapeHtml(reportValue.experiment.method)}</p>
      <p>使用${reportValue.experiment.minimumUsedCellCount}〜${
        reportValue.experiment.maximumUsedCellCount
      }マス、総曲がり${reportValue.experiment.maximumTotalTurnCount}以下。</p>
      <strong>採用した6条件</strong><ul>${ruleList}</ul>
      <p>本番生成器のprofileと通常画面は変更していません。</p>
    </details>
  </header>
  <section class="experiment-note">
    <h2>レビュー対象</h2>
    <p>端点だけから唯一解を完全証明し、6配置条件と低曲がり条件を通過した
    候補です。分類は原本1問との機械指標比較であり、児童の体感難易度を
    確定するものではありません。カードを押すと問題と答えを拡大できます。</p>
  </section>
  <section class="condition-heading">
    <h2>通常生成${
      formatNumber(
        reportValue.experiment.generatedPuzzleConditionAudit.sampleCount,
      )
    }問: 6条件の違反数と難易度分類</h2>
    <p>この表だけは、下の原本寄せ短縮候補とは別の通常生成${
      formatNumber(
        reportValue.experiment.generatedPuzzleConditionAudit.sampleCount,
      )
    }問を母集団にします。各難易度率の分母は、その条件に違反した問題数です。
    一つの問題が複数条件に違反する場合は複数行へ数えます。</p>
  </section>
  ${conditionOverview}
  <nav class="classification-grid">${classificationPanels}</nav>
  ${groupSections}
  <dialog id="candidate-dialog"></dialog>
<script>
  const dialog = document.querySelector('#candidate-dialog');
  document.querySelectorAll('.candidate-button').forEach(button => {
    button.addEventListener('click', () => {
      const template = document.getElementById(button.dataset.template);
      dialog.replaceChildren(template.content.cloneNode(true));
      dialog.querySelector('.dialog-close').addEventListener(
        'click', () => dialog.close()
      );
      dialog.showModal();
    });
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
</script>
</body></html>`;
}

function renderConditionOverviewTable(audit) {
  const rows = audit.conditionViolations.map(condition => {
    const classificationCells = REVIEW_GROUPS.map(group =>
      renderConditionClassificationCell(
        condition.classificationCounts[group.id],
        condition.violationCount,
      ),
    ).join('');
    return `<tr>
      <th>${escapeHtml(condition.label)}</th>
      <td><strong>${formatNumber(condition.violationCount)}問</strong>
        <small>${formatPercent(condition.violationRate)} / ${
          formatNumber(audit.sampleCount)
        }問</small></td>
      ${classificationCells}
    </tr>`;
  }).join('');
  const classificationHeaders = REVIEW_GROUPS.map(group =>
    `<th>${escapeHtml(group.label)}<br>率</th>`,
  ).join('');
  return `<section class="condition-table-wrap">
    <table class="condition-table">
      <thead><tr>
        <th>条件</th>
        <th>${formatNumber(audit.sampleCount)}問中の<br>条件違反問題数</th>
        ${classificationHeaders}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderConditionClassificationCell(count, rejectedCount) {
  return `<td><strong>${
    formatPercent(divideOrZero(count, rejectedCount))
  }</strong><small>${formatNumber(count)}問</small></td>`;
}

function renderCandidateCard(candidate, group, index) {
  const templateId = `${group.id}-${index}`;
  return `<article class="candidate-card">
    <button type="button" class="candidate-button"
      data-template="${templateId}"
      aria-label="${escapeHtml(group.label)}の候補${index + 1}を拡大">
      <div class="card-head"><strong>#${index + 1}</strong>
        <code>${escapeHtml(shortSeed(candidate.seed))}</code></div>
      ${renderBoard(candidate.puzzle)}
      <div class="metric-row">
        <span>使用 ${candidate.metrics.usedCellCount}</span>
        <span>曲がり ${candidate.metrics.totalTurnCount}</span>
        <span>状態 ${formatNumber(candidate.metrics.solverStateCount)}</span>
      </div>
    </button>
    <template id="${templateId}">
      <div class="dialog-head">
        <div><h2>${escapeHtml(group.label)} #${index + 1}</h2>
        <code>${escapeHtml(candidate.seed)}</code></div>
        <button type="button" class="dialog-close">閉じる</button>
      </div>
      <div class="dialog-boards">
        <section><h3>問題</h3>${renderBoard(candidate.puzzle)}</section>
        <section><h3>答え</h3>${
          renderBoard(candidate.puzzle, candidate.canonicalSolution)
        }</section>
      </div>
      ${renderMetrics(candidate)}
    </template>
  </article>`;
}

function renderBoard(puzzle, solution = null) {
  const cellSize = 64;
  const inset = 8;
  const width = puzzle.width * cellSize + inset * 2;
  const height = puzzle.height * cellSize + inset * 2;
  const grid = [];
  for (let column = 0; column <= puzzle.width; column += 1) {
    const x = inset + column * cellSize;
    grid.push(
      `<line x1="${x}" y1="${inset}" x2="${x}" y2="${
        height - inset
      }"/>`,
    );
  }
  for (let row = 0; row <= puzzle.height; row += 1) {
    const y = inset + row * cellSize;
    grid.push(
      `<line x1="${inset}" y1="${y}" x2="${
        width - inset
      }" y2="${y}"/>`,
    );
  }
  const paths = solution === null
    ? ''
    : solution.paths.map(path => {
      const points = path.cells.map(cell => {
        const x = inset + cell.column * cellSize + cellSize / 2;
        const y = inset + cell.row * cellSize + cellSize / 2;
        return `${x},${y}`;
      }).join(' ');
      return `<polyline points="${points}" fill="none" stroke="#263b37"
        stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`;
    }).join('');
  const terminals = puzzle.terminals.map(terminal => {
    const x = inset + terminal.column * cellSize + cellSize / 2;
    const y = inset + terminal.row * cellSize + cellSize / 2;
    if (terminal.symbol === 'circle') {
      return `<circle cx="${x}" cy="${y}" r="18" fill="#fff"
        stroke="#c65d36" stroke-width="6"/>`;
    }
    if (terminal.symbol === 'square') {
      return `<rect x="${x - 18}" y="${y - 18}" width="36" height="36"
        rx="2" fill="#fff" stroke="#c65d36" stroke-width="6"/>`;
    }
    return `<polygon points="${x},${y - 21} ${x - 21},${y + 18} ${
      x + 21
    },${y + 18}" fill="#fff" stroke="#c65d36" stroke-width="6"
      stroke-linejoin="round"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img"
    aria-label="${puzzle.width}×${puzzle.height}、端点${
      puzzle.terminals.length
    }個"><rect x="${inset}" y="${inset}" width="${
      width - inset * 2
    }" height="${height - inset * 2}" fill="#fff"/>
    <g stroke="#9aaaa6" stroke-width="1.5">${grid.join('')}</g>
    ${paths}${terminals}</svg>`;
}

function renderMetrics(candidate) {
  const rows = [
    ['初期選択肢量', candidate.metrics.entryHypothesisCount,
      candidate.indicatorDirections.entryHypotheses],
    ['solver状態', candidate.metrics.solverStateCount,
      candidate.indicatorDirections.solverStates],
    ['強制出口', candidate.metrics.forcedExitCount,
      candidate.indicatorDirections.forcedExits],
    ['総曲がり', candidate.metrics.totalTurnCount,
      candidate.indicatorDirections.solutionTurns],
    ['使用マス', candidate.metrics.usedCellCount, ''],
    ['direction score', candidate.directionScore, ''],
    ['reference distance', candidate.referenceDistance, ''],
  ];
  return `<table class="metric-table"><tbody>${
    rows.map(([label, metric, direction]) => `<tr>
      <th>${escapeHtml(label)}</th><td>${formatNumber(metric)}</td>
      <td>${escapeHtml(direction)}</td></tr>`).join('')
  }</tbody></table>`;
}

function shortSeed(seed) {
  return seed.replace('source-like-trim-review-6x6-4-4-4-', '');
}

function formatNumber(value) {
  return new Intl.NumberFormat('ja-JP', {maximumFractionDigits: 3})
    .format(value);
}

function formatSeconds(value) {
  return `${value.toFixed(2)}秒`;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
