import assert from "node:assert/strict";
import {
  optimizeSolution,
} from "../domain/solver/optimize-solution.ts";
import { solvePuzzle } from "../domain/solver/solve-puzzle.ts";
import {
  calculateSolutionCost,
  compareSolutionCost,
} from "../domain/validation/analyze-solution-geometry.ts";
import { validateSolution } from "../domain/validation/validate-solution.ts";

const multiplePairingPuzzle = {
  schemaVersion: "onaji-no-tsunagi.puzzle.v1",
  puzzleId: "multiple-pairing",
  width: 3,
  height: 3,
  terminals: [
    { terminalId: "a", symbol: "circle", row: 0, column: 0 },
    { terminalId: "b", symbol: "circle", row: 0, column: 2 },
    { terminalId: "c", symbol: "circle", row: 2, column: 0 },
    { terminalId: "d", symbol: "circle", row: 2, column: 2 },
  ],
};
const multipleResult = solvePuzzle(multiplePairingPuzzle, {
  solutionLimit: 2,
  stateBudget: 10_000,
});
assert.equal(multipleResult.status, "solved");
assert.equal(multipleResult.solutionCount.kind, "at-least");
assert.ok(
  validateSolution(
    multiplePairingPuzzle,
    multipleResult.canonicalSolution,
  ).valid,
);

const impossiblePuzzle = {
  schemaVersion: "onaji-no-tsunagi.puzzle.v1",
  puzzleId: "impossible",
  width: 2,
  height: 2,
  terminals: [
    { terminalId: "a", symbol: "circle", row: 0, column: 0 },
    { terminalId: "b", symbol: "circle", row: 1, column: 1 },
    { terminalId: "c", symbol: "square", row: 0, column: 1 },
    { terminalId: "d", symbol: "square", row: 1, column: 0 },
  ],
};
const impossibleResult = solvePuzzle(impossiblePuzzle, {
  stateBudget: 10_000,
});
assert.equal(impossibleResult.status, "unsatisfiable");

const budgetResult = solvePuzzle(multiplePairingPuzzle, {
  solutionLimit: 100,
  stateBudget: 1,
});
assert.equal(budgetResult.status, "budget_exhausted");
assert.notEqual(budgetResult.status, "unsatisfiable");

const referenceSolutions = new Map();
const exhaustiveResult = solvePuzzle(multiplePairingPuzzle, {
  solutionLimit: 10_000,
  stateBudget: 100_000,
  solutionObserver(solution) {
    const cost = calculateSolutionCost(multiplePairingPuzzle, solution);
    referenceSolutions.set(cost.normalizedSolutionHash, solution);
  },
  useComponentParity: false,
  useFailureMemo: false,
});
assert.equal(exhaustiveResult.status, "solved");
assert.equal(exhaustiveResult.solutionCount.kind, "exact");
const referenceBest = [...referenceSolutions.values()]
  .map((solution) => ({
    solution,
    cost: calculateSolutionCost(multiplePairingPuzzle, solution),
  }))
  .toSorted((left, right) => compareSolutionCost(left.cost, right.cost))[0];
assert.ok(referenceBest);
const planted = {
  paths: [
    {
      symbol: "circle",
      cells: [
        { row: 0, column: 0 },
        { row: 0, column: 1 },
        { row: 0, column: 2 },
      ],
    },
    {
      symbol: "circle",
      cells: [
        { row: 2, column: 0 },
        { row: 2, column: 1 },
        { row: 2, column: 2 },
      ],
    },
  ],
};
const optimized = optimizeSolution(
  multiplePairingPuzzle,
  planted,
  { stateBudget: 100_000 },
);
assert.equal(optimized.status, "optimal");
assert.deepEqual(optimized.cost, referenceBest.cost);

const optimizedBudget = optimizeSolution(
  multiplePairingPuzzle,
  planted,
  { stateBudget: 1 },
);
assert.equal(optimizedBudget.status, "budget_exhausted");
assert.ok(optimizedBudget.incumbent);

const inflatedPuzzle = {
  schemaVersion: "onaji-no-tsunagi.puzzle.v1",
  puzzleId: "inflated",
  width: 3,
  height: 3,
  terminals: [
    { terminalId: "a", symbol: "circle", row: 0, column: 0 },
    { terminalId: "b", symbol: "circle", row: 0, column: 2 },
  ],
};
const inflatedPlanted = {
  paths: [{
    symbol: "circle",
    cells: [
      { row: 0, column: 0 },
      { row: 1, column: 0 },
      { row: 1, column: 1 },
      { row: 1, column: 2 },
      { row: 0, column: 2 },
    ],
  }],
};
const shortened = optimizeSolution(
  inflatedPuzzle,
  inflatedPlanted,
  { stateBudget: 100_000 },
);
assert.equal(shortened.status, "optimal");
assert.equal(shortened.cost.totalEdgeCount, 2);
assert.equal(shortened.cost.unitBayCount, 0);
assert.equal(shortened.cost.totalTurnCount, 0);

const pathLimitAllowsShortest = solvePuzzle(inflatedPuzzle, {
  solutionLimit: 1,
  stateBudget: 10_000,
  requiredTerminalPairs: [["a", "b"]],
  pathEdgeLimits: [{
    terminalIds: ["a", "b"],
    maximumEdgeCount: 2,
  }],
});
assert.equal(pathLimitAllowsShortest.status, "solved");

const pathLimitProvesImpossible = solvePuzzle(inflatedPuzzle, {
  solutionLimit: 1,
  stateBudget: 10_000,
  requiredTerminalPairs: [["a", "b"]],
  pathEdgeLimits: [{
    terminalIds: ["a", "b"],
    maximumEdgeCount: 1,
  }],
});
assert.equal(pathLimitProvesImpossible.status, "unsatisfiable");

const pathLimitBudget = solvePuzzle(inflatedPuzzle, {
  solutionLimit: 1,
  stateBudget: 1,
  requiredTerminalPairs: [["a", "b"]],
  pathEdgeLimits: [{
    terminalIds: ["a", "b"],
    maximumEdgeCount: 2,
  }],
});
assert.equal(pathLimitBudget.status, "budget_exhausted");

const toggledResult = solvePuzzle(multiplePairingPuzzle, {
  solutionLimit: 10_000,
  stateBudget: 100_000,
  useComponentParity: true,
  useFailureMemo: true,
});
assert.equal(toggledResult.status, "solved");
assert.deepEqual(
  toggledResult.solutionCount,
  exhaustiveResult.solutionCount,
);

const lazyPairingPuzzle = {
  schemaVersion: "onaji-no-tsunagi.puzzle.v1",
  puzzleId: "lazy-pairing-fourteen-terminals",
  width: 7,
  height: 2,
  terminals: Array.from({ length: 14 }, (_, index) => ({
    terminalId: `terminal-${index + 1}`,
    symbol: "triangle",
    row: Math.floor(index / 7),
    column: index % 7,
  })),
};
const lazyPairingResult = solvePuzzle(lazyPairingPuzzle, {
  solutionLimit: 2,
  stateBudget: 100_000,
});
assert.equal(lazyPairingResult.status, "solved");
assert.ok(lazyPairingResult.metrics.pairingCountTried < 135_135);

console.log("onaji-no-tsunagi solver tests passed");
