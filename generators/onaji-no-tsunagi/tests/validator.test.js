import assert from "node:assert/strict";
import {
  countStraightPathsByAxis,
} from "../domain/validation/analyze-solution-geometry.ts";
import { validatePuzzle } from "../domain/validation/validate-puzzle.ts";
import { validateSolution } from "../domain/validation/validate-solution.ts";

const puzzle = {
  schemaVersion: "onaji-no-tsunagi.puzzle.v1",
  puzzleId: "validator-fixture",
  width: 3,
  height: 3,
  terminals: [
    { terminalId: "a", symbol: "circle", row: 0, column: 0 },
    { terminalId: "b", symbol: "circle", row: 0, column: 2 },
    { terminalId: "c", symbol: "circle", row: 2, column: 0 },
    { terminalId: "d", symbol: "circle", row: 2, column: 2 },
  ],
};

assert.deepEqual(validatePuzzle(puzzle), { valid: true });

const alternativePairing = {
  paths: [
    {
      symbol: "circle",
      cells: [
        { row: 0, column: 0 },
        { row: 1, column: 0 },
        { row: 2, column: 0 },
      ],
    },
    {
      symbol: "circle",
      cells: [
        { row: 0, column: 2 },
        { row: 1, column: 2 },
        { row: 2, column: 2 },
      ],
    },
  ],
};
assert.deepEqual(validateSolution(puzzle, alternativePairing), { valid: true });
assert.deepEqual(countStraightPathsByAxis(alternativePairing), {
  horizontalStraightPathCount: 0,
  verticalStraightPathCount: 2,
});
assert.deepEqual(countStraightPathsByAxis({
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
      symbol: "square",
      cells: [
        { row: 1, column: 0 },
        { row: 1, column: 1 },
        { row: 2, column: 1 },
      ],
    },
  ],
}), {
  horizontalStraightPathCount: 1,
  verticalStraightPathCount: 0,
});

const diagonal = {
  paths: [
    {
      symbol: "circle",
      cells: [
        { row: 0, column: 0 },
        { row: 1, column: 1 },
        { row: 2, column: 2 },
      ],
    },
    {
      symbol: "circle",
      cells: [
        { row: 0, column: 2 },
        { row: 1, column: 2 },
        { row: 2, column: 2 },
      ],
    },
  ],
};
const diagonalResult = validateSolution(puzzle, diagonal);
assert.equal(diagonalResult.valid, false);
assert.ok(diagonalResult.issues.some((issue) => issue.code === "path_continuity"));

const oddTerminals = {
  ...puzzle,
  terminals: puzzle.terminals.slice(0, 3),
};
const oddResult = validatePuzzle(oddTerminals);
assert.equal(oddResult.valid, false);
assert.ok(oddResult.issues.some((issue) => issue.code === "terminal_evenness"));

const transitPuzzle = {
  schemaVersion: "onaji-no-tsunagi.puzzle.v1",
  puzzleId: "transit-fixture",
  width: 3,
  height: 2,
  terminals: [
    { terminalId: "a", symbol: "circle", row: 0, column: 0 },
    { terminalId: "b", symbol: "circle", row: 0, column: 2 },
    { terminalId: "c", symbol: "square", row: 0, column: 1 },
    { terminalId: "d", symbol: "square", row: 1, column: 1 },
  ],
};
const transit = validateSolution(transitPuzzle, {
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
      symbol: "square",
      cells: [
        { row: 0, column: 1 },
        { row: 1, column: 1 },
      ],
    },
  ],
});
assert.equal(transit.valid, false);
assert.ok(transit.issues.some((issue) => issue.code === "terminal_transit"));
assert.ok(transit.issues.some((issue) => issue.code === "path_overlap"));

console.log("onaji-no-tsunagi validator tests passed");
