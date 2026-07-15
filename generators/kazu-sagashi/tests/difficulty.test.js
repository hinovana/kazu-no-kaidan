import assert from "node:assert/strict";
import { buildProblem } from "../src/generator.js";
import {
  evaluateProblemDifficulty,
  probabilityGreater,
  quantile,
  summarizeLevel,
} from "../src/difficulty-solvers.js";

function testAllLevelsProduceComparableResults() {
  for (let level = 1; level <= 7; level += 1) {
    const problem = buildProblem(level, "difficulty-test");
    const result = evaluateProblemDifficulty(problem);
    assert.equal(result.level, level);
    assert.ok(result.solvers.length >= 3, `level ${level} should have multiple solvers`);
    assert.ok(result.bestExpectedCost > 0);
    assert.ok(result.bestExpectedRank >= 1);
    assert.ok(result.visualExpectedRank >= 1);
    if (level === 7) {
      assert.ok(result.visualExpectedRank >= 3);
      assert.equal(result.solvers.filter((solver) => solver.id.startsWith("visual-")).length, 4);
      assert.equal(result.visualExpectedRank, problem.metrics.visualMinimumExpectedRank);
    }
    assert.deepEqual(result.solution, problem.answer);
    for (const solver of result.solvers) {
      assert.ok(solver.bestRank <= solver.expectedRank);
      assert.ok(solver.expectedRank <= solver.worstRank);
      assert.ok(solver.operations.windowsChecked > 0);
    }
  }
}

function testAnswerMetadataIsNotSolverInput() {
  const original = buildProblem(7, "answer-independence");
  const tampered = structuredClone(original);
  tampered.answer = { row: (original.answer.row + 1) % 8, col: (original.answer.col + 3) % 8 };
  tampered.problemId = "tampered-id";
  const expected = evaluateProblemDifficulty(original);
  const actual = evaluateProblemDifficulty(tampered);
  assert.deepEqual(actual.solution, expected.solution);
  assert.equal(actual.bestSolverId, expected.bestSolverId);
  assert.equal(actual.bestExpectedCost, expected.bestExpectedCost);
  assert.deepEqual(actual.solvers, expected.solvers);
}

function testTieRanksAreAnalyticAndDeterministic() {
  const problem = buildProblem(7, "tie-rank");
  const first = evaluateProblemDifficulty(problem);
  const second = evaluateProblemDifficulty(problem);
  const visual = first.solvers.find((solver) => solver.id === "visual-combined");
  assert.deepEqual(first, second);
  assert.equal(visual.expectedRank, visual.bestRank + (visual.worstRank - visual.bestRank) / 2);
}

function testAggregates() {
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.deepEqual(probabilityGreater([2, 3], [1, 2]), { greater: 0.75, tied: 0.25 });
  const summary = summarizeLevel([
    record(1, 10, 2, 1, "A", 4),
    record(1, 20, 4, 3, "A", 8),
    record(1, 30, 6, 5, "B", 12),
  ]);
  assert.equal(summary.costMedian, 20);
  assert.equal(summary.rankMedian, 4);
  assert.equal(summary.visualRank1Rate, 1 / 3);
  assert.equal(summary.winnerLabel, "A");
  assert.equal(summary.generationP95Ms, 11.6);
}

function record(level, cost, rank, visualRank, bestSolverLabel, generationMs) {
  return {
    level,
    levelLabel: String(level),
    bestExpectedCost: cost,
    bestExpectedRank: rank,
    visualExpectedRank: visualRank,
    bestSolverLabel,
    generationMs,
  };
}

testAllLevelsProduceComparableResults();
testAnswerMetadataIsNotSolverInput();
testTieRanksAreAnalyticAndDeterministic();
testAggregates();
console.log("difficulty tests passed");
