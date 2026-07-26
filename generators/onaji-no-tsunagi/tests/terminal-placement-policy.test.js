import assert from "node:assert/strict";

import {
  buildUniquePathCover,
  getUniquePathCoverProfile,
} from "../domain/generation/build-unique-path-cover.ts";
import { createSeededRandom } from "../domain/generation/random.ts";
import {
  createTerminalPlacementSearch,
} from "../domain/generation/terminal-placement-policy.ts";
import {
  enumerateSixBySixPathSymbols,
} from "../domain/generation/path-symbol-assignment.ts";
import {
  analyzeTerminalCells,
  analyzeTerminalPlacement,
  analyzeTerminalSymbols,
} from "../domain/validation/analyze-terminal-placement.ts";

const width = 6;
const height = 6;

const zeroOuterPairs = analyzeTerminalCells([
  cell(0, 0),
  cell(0, 2),
], width, height);
assert.equal(zeroOuterPairs.adjacentEdgeCellPairs.length, 0);

const oneOuterPair = analyzeTerminalCells([
  cell(0, 0),
  cell(0, 1),
], width, height);
assert.equal(oneOuterPair.adjacentEdgeCellPairs.length, 1);

const twoOuterPairs = analyzeTerminalCells([
  cell(0, 0),
  cell(0, 1),
  cell(5, 4),
  cell(5, 5),
], width, height);
assert.equal(twoOuterPairs.adjacentEdgeCellPairs.length, 2);

const zeroCentralPairs = analyzeTerminalCells([
  cell(1, 1),
  cell(3, 3),
], width, height);
assert.equal(zeroCentralPairs.adjacentCentralCellPairs.length, 0);

const oneCentralPair = analyzeTerminalCells([
  cell(1, 1),
  cell(1, 2),
], width, height);
assert.equal(oneCentralPair.adjacentCentralCellPairs.length, 1);

const twoCentralPairs = analyzeTerminalCells([
  cell(1, 1),
  cell(1, 2),
  cell(4, 3),
  cell(4, 4),
], width, height);
assert.equal(twoCentralPairs.adjacentCentralCellPairs.length, 2);

for (const row of [0, 2, 5]) {
  const horizontal = analyzeTerminalCells([
    cell(row, 1),
    cell(row, 2),
    cell(row, 3),
  ], width, height);
  assert.equal(horizontal.threeTerminalRuns.horizontal.length, 1);
}
for (const column of [0, 2, 5]) {
  const vertical = analyzeTerminalCells([
    cell(1, column),
    cell(2, column),
    cell(3, column),
  ], width, height);
  assert.equal(vertical.threeTerminalRuns.vertical.length, 1);
}

const twoByTwo = [
  cell(0, 2),
  cell(0, 3),
  cell(1, 2),
  cell(1, 3),
];
for (let missingIndex = 0; missingIndex < twoByTwo.length; missingIndex += 1) {
  const lShape = analyzeTerminalCells(
    twoByTwo.filter((_, index) => index !== missingIndex),
    width,
    height,
  );
  assert.equal(lShape.lShapedThreeTerminalBlocks.length, 1);
}

const symbolPlacement = analyzeTerminalSymbols([
  symbolCell("circle", 1, 1),
  symbolCell("square", 2, 3),
  symbolCell("triangle", 4, 4),
  symbolCell("circle", 0, 1),
  symbolCell("circle", 0, 2),
], width, height);
assert.equal(symbolPlacement.satisfiesCentralSymbolCoverage, true);
assert.equal(
  symbolPlacement.satisfiesDifferentSymbolEdgeAdjacency,
  false,
);

const differentSymbolOuterPair = analyzeTerminalSymbols([
  symbolCell("circle", 1, 1),
  symbolCell("square", 2, 3),
  symbolCell("triangle", 4, 4),
  symbolCell("circle", 0, 1),
  symbolCell("square", 0, 2),
], width, height);
assert.equal(
  differentSymbolOuterPair.satisfiesDifferentSymbolEdgeAdjacency,
  true,
);

for (const missingSymbol of ["circle", "square", "triangle"]) {
  const presentSymbols = ["circle", "square", "triangle"]
    .filter(symbol => symbol !== missingSymbol);
  const missingSymbolPlacement = analyzeTerminalSymbols(
    presentSymbols.map((symbol, index) =>
      symbolCell(symbol, index + 1, index + 1)),
    width,
    height,
  );
  assert.deepEqual(missingSymbolPlacement.missingSymbols, [missingSymbol]);
  assert.equal(
    missingSymbolPlacement.satisfiesCentralSymbolCoverage,
    false,
  );
}

const asymmetricCells = [
  cell(0, 0),
  cell(0, 1),
  cell(1, 1),
  cell(2, 3),
  cell(4, 4),
  cell(5, 2),
];
const invariantSignature = placementInvariantSignature(
  analyzeTerminalCells(asymmetricCells, width, height),
);
for (const transform of [
  ({row, column}) => ({row: column, column: width - row - 1}),
  ({row, column}) => ({row, column: width - column - 1}),
]) {
  assert.deepEqual(
    placementInvariantSignature(
      analyzeTerminalCells(
        asymmetricCells.map(transform),
        width,
        height,
      ),
    ),
    invariantSignature,
  );
}

const profile = getUniquePathCoverProfile("6x6-4-4-2");
assert.notEqual(profile.terminalPlacementPolicy, null);
assert.equal(
  enumerateSixBySixPathSymbols(
    "terminal-placement-policy-unit",
    profile.symbolPathCounts,
  ).length,
  15,
);
const placementSearch = createTerminalPlacementSearch(
  profile.terminalPlacementPolicy,
  width,
  height,
  profile.symbolPathCounts,
  "terminal-placement-policy-unit",
);
const partialLShapePaths = [
  path(cell(0, 1), cell(5, 0)),
  path(cell(0, 2), cell(3, 4)),
  path(cell(1, 1), cell(5, 5)),
];
assert.equal(
  placementSearch.isPathSelectionAllowed(partialLShapePaths, false),
  true,
  "L字型3連は部分状態で早期棄却してはいけない",
);
assert.equal(
  placementSearch.isPathSelectionAllowed(partialLShapePaths, true),
  false,
  "L字型3連は完成coverで棄却する",
);
assert.equal(
  placementSearch.diagnostics()
    .pathPruningCounts.l_shaped_terminal_triple,
  1,
);

let builtSeed;
let firstBuild;
for (let seedIndex = 0; seedIndex < 50; seedIndex += 1) {
  const seed = `terminal-placement-policy-build-${seedIndex}`;
  const result = buildUniquePathCover(
    seed,
    createSeededRandom(seed),
    "6x6-4-4-2",
  );
  if (result.status === "built") {
    builtSeed = seed;
    firstBuild = result;
    break;
  }
}
assert.ok(builtSeed);
assert.ok(firstBuild);
assertGeneratedPlacement(firstBuild.plan.puzzle);
assert.ok(firstBuild.terminalPlacementDiagnostics);
assert.ok(
  firstBuild.terminalPlacementDiagnostics
    .pathExtensionEvaluationCount > 0,
);
assert.ok(
  firstBuild.terminalPlacementDiagnostics
    .allowedSymbolAssignmentCount > 0,
);
assert.ok(
  firstBuild.terminalPlacementDiagnostics
    .pathPruningCounts.l_shaped_terminal_triple > 0,
  "完成coverのL字配置を棄却した後、別の経路構成へbacktrackする",
);

const allowedAssignmentCount =
  firstBuild.terminalPlacementDiagnostics.allowedSymbolAssignmentCount;
for (
  let variant = 0;
  variant < allowedAssignmentCount;
  variant += 1
) {
  const result = buildUniquePathCover(
    builtSeed,
    createSeededRandom(builtSeed),
    "6x6-4-4-2",
    { symbolAssignmentVariant: variant },
  );
  assert.equal(result.status, "built");
  assertGeneratedPlacement(result.plan.puzzle);
}
const exhaustedAssignment = buildUniquePathCover(
  builtSeed,
  createSeededRandom(builtSeed),
  "6x6-4-4-2",
  { symbolAssignmentVariant: allowedAssignmentCount },
);
assert.equal(
  exhaustedAssignment.status,
  "symbol_assignment_unavailable",
);

for (const profileId of ["6x6-4-4-4", "6x6-6-4-4"]) {
  assert.equal(
    getUniquePathCoverProfile(profileId).terminalPlacementPolicy,
    null,
  );
}

function assertGeneratedPlacement(puzzle) {
  const placement = analyzeTerminalPlacement(puzzle);
  assert.equal(placement.satisfiesEdgeAdjacencyPairLimit, true);
  assert.equal(placement.satisfiesNoLShapedTerminalTriple, true);
  assert.equal(placement.satisfiesNoStraightTerminalRun, true);
  assert.equal(placement.satisfiesLimitedCentralAdjacency, true);
  assert.equal(placement.satisfiesCentralSymbolCoverage, true);
  assert.equal(placement.satisfiesDifferentSymbolEdgeAdjacency, true);
}

function cell(row, column) {
  return { row, column };
}

function symbolCell(symbol, row, column) {
  return { symbol, row, column };
}

function path(first, last) {
  return {
    cells: [
      first.row * width + first.column,
      last.row * width + last.column,
    ],
    occupiedMask: 0n,
  };
}

function placementInvariantSignature(analysis) {
  return {
    centralTerminalCount: analysis.centralTerminalCount,
    outerRingTerminalCount: analysis.outerRingTerminalCount,
    adjacentEdgePairCount: analysis.adjacentEdgeCellPairs.length,
    adjacentCentralPairCount: analysis.adjacentCentralCellPairs.length,
    horizontalOrVerticalRunCount:
      analysis.threeTerminalRuns.horizontal.length +
      analysis.threeTerminalRuns.vertical.length,
    filledTwoByTwoCount: analysis.filledTwoByTwoTerminalBlocks.length,
    lShapedTripleCount: analysis.lShapedThreeTerminalBlocks.length,
    maximumAdjacentTerminalClusterSize:
      analysis.maximumAdjacentTerminalClusterSize,
  };
}

console.log("onaji-no-tsunagi terminal placement policy tests passed");
