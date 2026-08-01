/**
 * 原本と生成問題を同じ難易度監査指標へ変換する共通処理を定義する。
 *
 * 原本の座標は呼び出し側から渡されたdecoded corpusだけから読み取り、
 * 生成fixtureやseedへは流用しない。
 */

import assert from "node:assert/strict";

import {
  referenceProblemToPuzzle,
} from "../application/decode-reference-corpus.ts";
import {
  countPerfectMatchings,
} from "../domain/solver/enumerate-pairings.ts";
import { solvePuzzle } from "../domain/solver/solve-puzzle.ts";
import {
  analyzeSolutionGeometry,
  countStraightPathsByAxis,
} from "../domain/validation/analyze-solution-geometry.ts";

export const SIX_BY_SIX_PROFILE_IDS = [
  "6x6-4-4-2",
  "6x6-4-4-4",
  "6x6-6-4-4",
];

const PROFILE_ID_BY_MULTIPLICITY = new Map([
  ["4-4-2", "6x6-4-4-2"],
  ["4-4-4", "6x6-4-4-4"],
  ["6-4-4", "6x6-6-4-4"],
]);

/**
 * 二重照合済みの原本6×6を、profileごとの監査基準点へ変換する。
 *
 * 各問題が現行solverで完全探索の唯一解であることもここで再確認する。
 */
export function analyzeDifficultyReferences(corpus) {
  const sixBySixProblems = corpus.problems.filter(
    problem => problem.board.width === 6 && problem.board.height === 6,
  );
  assert.equal(
    sixBySixProblems.length,
    SIX_BY_SIX_PROFILE_IDS.length,
    "原本6×6は3 profileそれぞれ1問である必要があります。",
  );
  const references = new Map();
  for (const problem of sixBySixProblems) {
    assert.equal(problem.transcription.status, "double-checked");
    const puzzle = referenceProblemToPuzzle(problem);
    const profileId = getDifficultyProfileId(puzzle);
    assert.ok(!references.has(profileId), `${profileId}: 原本問題が重複しています。`);
    const solutionResult = solvePuzzle(puzzle, {
      solutionLimit: 2,
      stateBudget: 5_000_000,
    });
    assert.equal(solutionResult.status, "solved", `${problem.id}: 解けません。`);
    assert.deepEqual(
      solutionResult.solutionCount,
      { kind: "exact", count: 1 },
      `${problem.id}: 現行ルールで唯一解ではありません。`,
    );
    const structure = analyzePuzzleStructure(puzzle);
    const geometry = analyzeSolutionGeometry(
      puzzle,
      solutionResult.canonicalSolution,
    );
    const straightPathCounts = countStraightPathsByAxis(
      solutionResult.canonicalSolution,
    );
    references.set(profileId, {
      sourceProblemId: problem.id,
      source: problem.source,
      profileId,
      puzzle,
      canonicalSolution: solutionResult.canonicalSolution,
      metrics: {
        entryHypothesisCount: structure.entryHypothesisCount,
        forcedExitCount: structure.forcedExitCount,
        solverStateCount: solutionResult.metrics.exploredStateCount,
        solverBacktrackCount: solutionResult.metrics.backtrackCount,
        totalTurnCount: geometry.totalTurnCount,
        ...straightPathCounts,
        usedCellCount:
          geometry.totalEdgeCount + solutionResult.canonicalSolution.paths.length,
        maximumLineConcentration: structure.maximumLineConcentration,
        pairingChoiceCount: structure.pairingChoiceCount,
      },
    });
  }
  for (const profileId of SIX_BY_SIX_PROFILE_IDS) {
    assert.ok(references.has(profileId), `${profileId}: 原本問題がありません。`);
  }
  return references;
}

/**
 * 端点multiplicityから、対応する6×6生成profileのIDを返す。
 */
export function getDifficultyProfileId(puzzle) {
  const counts = new Map();
  for (const terminal of puzzle.terminals) {
    counts.set(terminal.symbol, (counts.get(terminal.symbol) ?? 0) + 1);
  }
  const multiplicity = [...counts.values()]
    .toSorted((left, right) => right - left)
    .join("-");
  const profileId = PROFILE_ID_BY_MULTIPLICITY.get(multiplicity);
  assert.ok(profileId, `未対応の6×6 multiplicityです: ${multiplicity}`);
  return profileId;
}

/**
 * generatorの内部結果を、難易度監査で保存する候補形式へ変換する。
 */
export function toDifficultyCandidate(seed, generated) {
  const straightPathCounts = countStraightPathsByAxis(
    generated.canonicalSolution,
  );
  return {
    id: `${generated.provenance.profileId}:${seed}`,
    seed,
    profileId: generated.provenance.profileId,
    puzzle: generated.puzzle,
    canonicalSolution: generated.canonicalSolution,
    provenance: {
      candidateIndex: generated.provenance.candidateIndex,
      puzzleSeed: generated.provenance.puzzleSeed,
      topologyHash: generated.provenance.topologyHash,
      pathLengthProfile: generated.provenance.pathLengthProfile,
    },
    metrics: {
      entryHypothesisCount: generated.entry.naturalHypothesisCount,
      forcedExitCount: generated.entry.forcedExitTerminalIds.length,
      solverStateCount: generated.uniquenessProof.exploredStateCount,
      solverBacktrackCount: generated.difficulty.backtrackCount,
      totalTurnCount: generated.solutionCost.totalTurnCount,
      ...straightPathCounts,
      usedCellCount: generated.answerCoverage.usedCellCount,
      maximumLineConcentration: generated.entry.maximumLineConcentration,
      pairingChoiceCount: generated.entry.pairingChoiceCount,
    },
  };
}

/**
 * HTMLとJSONに保存する範囲へ、生成profile設定を射影する。
 */
export function summarizeDifficultyProfile(profile) {
  return {
    profileId: profile.profileId,
    terminalPattern: profile.terminalPattern,
    terminalCount: profile.terminalCount,
    pathCount: profile.pathCount,
    maximumTotalTurnCount: profile.maximumTotalTurnCount,
    minimumForcedExitCount: profile.minimumForcedExitCount,
    maximumForcedExitCount: profile.maximumForcedExitCount,
  };
}

function analyzePuzzleStructure(puzzle) {
  const terminalKeys = new Set(
    puzzle.terminals.map(
      terminal => `${terminal.row},${terminal.column}`,
    ),
  );
  const exitCounts = puzzle.terminals.map(terminal => {
    let count = 0;
    for (const [rowOffset, columnOffset] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const row = terminal.row + rowOffset;
      const column = terminal.column + columnOffset;
      if (
        row >= 0
        && row < puzzle.height
        && column >= 0
        && column < puzzle.width
        && !terminalKeys.has(`${row},${column}`)
      ) {
        count += 1;
      }
    }
    return count;
  });
  const symbolCounts = new Map();
  for (const terminal of puzzle.terminals) {
    symbolCounts.set(
      terminal.symbol,
      (symbolCounts.get(terminal.symbol) ?? 0) + 1,
    );
  }
  const pairingChoiceCount = [...symbolCounts.values()].reduce(
    (product, count) => product * countPerfectMatchings(count),
    1,
  );
  const maximumLineConcentration = Math.max(
    ...Array.from(
      { length: puzzle.width },
      (_, column) => puzzle.terminals.filter(
        terminal => terminal.column === column,
      ).length,
    ),
    ...Array.from(
      { length: puzzle.height },
      (_, row) => puzzle.terminals.filter(
        terminal => terminal.row === row,
      ).length,
    ),
  );
  return {
    pairingChoiceCount,
    forcedExitCount: exitCounts.filter(count => count === 1).length,
    entryHypothesisCount: exitCounts.reduce(
      (product, count) => product * count,
      pairingChoiceCount,
    ),
    maximumLineConcentration,
  };
}
