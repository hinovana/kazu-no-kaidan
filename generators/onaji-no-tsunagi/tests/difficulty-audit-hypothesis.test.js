import assert from "node:assert/strict";

import {
  analyzeTerminalPlacementHypotheses,
  TERMINAL_PLACEMENT_GATE_RULES,
} from "./difficulty-audit-hypothesis.mjs";

const satisfies = analyzeTerminalPlacementHypotheses(puzzle([
  terminal("circle", 1, 1),
  terminal("circle", 1, 3),
  terminal("triangle", 2, 2),
  terminal("square", 4, 4),
  terminal("circle", 0, 0),
]));
assert.equal(satisfies.satisfiesCentralSymbolCoverage, true);
assert.equal(satisfies.satisfiesCentralTerminalCountRange, true);
assert.equal(satisfies.satisfiesBoundedCentralPlacement, true);
assert.equal(satisfies.satisfiesLimitedCentralAdjacency, true);
assert.equal(satisfies.satisfiesCombinedHypothesis, true);
assert.equal(satisfies.satisfiesNoStraightTerminalRun, true);
assert.equal(satisfies.satisfiesNoFilledTwoByTwoTerminalBlock, true);
assert.equal(satisfies.satisfiesNoLShapedTerminalTriple, true);
assert.equal(satisfies.satisfiesTerminalRunAndBlockRule, true);
assert.equal(satisfies.satisfiesLimitedCentralBoundaryAdjacency, true);
assert.equal(satisfies.satisfiesNoConcentratedOrthogonalEdgePairs, true);
assert.equal(satisfies.satisfiesFinalHypothesis, true);
assert.equal(satisfies.centralTerminalCount, 4);
assert.equal(satisfies.outerRingTerminalCount, 1);
assert.equal(satisfies.adjacentEdgeTerminalPairCount, 0);
assert.equal(satisfies.adjacentCentralTerminalPairCount, 0);
assert.equal(satisfies.centralBoundaryAdjacentTerminalPairCount, 0);
assert.equal(satisfies.horizontalThreeTerminalRunCount, 0);
assert.equal(satisfies.verticalThreeTerminalRunCount, 0);
assert.equal(satisfies.filledTwoByTwoTerminalBlockCount, 0);
assert.equal(satisfies.lShapedThreeTerminalBlockCount, 0);
assert.equal(satisfies.maximumOrthogonalEdgeTerminalPairCount, 0);
assert.equal(satisfies.maximumAdjacentTerminalClusterSize, 1);
assert.deepEqual(satisfies.missingSymbols, []);
for (const rule of TERMINAL_PLACEMENT_GATE_RULES) {
  assert.equal(
    typeof satisfies[rule.resultKey],
    "boolean",
    `${rule.id}の結果がbooleanではありません。`,
  );
}

const missingTriangle = analyzeTerminalPlacementHypotheses(puzzle([
  terminal("circle", 1, 1),
  terminal("square", 4, 4),
  terminal("triangle", 0, 2),
  terminal("circle", 5, 5),
]));
assert.equal(missingTriangle.satisfiesCentralSymbolCoverage, false);
assert.deepEqual(missingTriangle.missingSymbols, ["triangle"]);
assert.deepEqual(missingTriangle.centralSymbolCounts, {
  circle: 1,
  square: 1,
  triangle: 0,
});

const threeCentralTerminals = analyzeTerminalPlacementHypotheses(puzzle([
  terminal("circle", 1, 1),
  terminal("triangle", 2, 2),
  terminal("square", 4, 4),
]));
assert.equal(threeCentralTerminals.satisfiesCentralSymbolCoverage, true);
assert.equal(threeCentralTerminals.satisfiesCentralTerminalCountRange, false);
assert.equal(threeCentralTerminals.satisfiesBoundedCentralPlacement, false);
assert.equal(threeCentralTerminals.centralTerminalCount, 3);

const sixCentralTerminals = analyzeTerminalPlacementHypotheses(puzzle([
  terminal("circle", 1, 1),
  terminal("triangle", 1, 3),
  terminal("square", 2, 2),
  terminal("circle", 2, 4),
  terminal("triangle", 3, 1),
  terminal("square", 4, 4),
]));
assert.equal(sixCentralTerminals.satisfiesCentralSymbolCoverage, true);
assert.equal(sixCentralTerminals.satisfiesCentralTerminalCountRange, true);
assert.equal(sixCentralTerminals.satisfiesBoundedCentralPlacement, true);
assert.equal(sixCentralTerminals.satisfiesCombinedHypothesis, true);
assert.equal(sixCentralTerminals.centralTerminalCount, 6);

const sevenCentralTerminals = analyzeTerminalPlacementHypotheses(puzzle([
  terminal("circle", 1, 1),
  terminal("triangle", 1, 3),
  terminal("square", 2, 2),
  terminal("circle", 2, 4),
  terminal("triangle", 3, 1),
  terminal("square", 4, 4),
  terminal("circle", 3, 3),
]));
assert.equal(sevenCentralTerminals.satisfiesCentralTerminalCountRange, false);
assert.equal(sevenCentralTerminals.centralTerminalCount, 7);

const adjacentSameSymbol = analyzeTerminalPlacementHypotheses(puzzle([
  terminal("circle", 1, 1),
  terminal("triangle", 2, 2),
  terminal("square", 4, 4),
  terminal("circle", 1, 4),
  terminal("circle", 0, 2),
  terminal("circle", 0, 3),
]));
assert.equal(adjacentSameSymbol.satisfiesCentralSymbolCoverage, true);
assert.equal(adjacentSameSymbol.satisfiesEdgeAdjacencyPairLimit, true);
assert.equal(adjacentSameSymbol.satisfiesDifferentSymbolEdgeAdjacency, false);
assert.equal(adjacentSameSymbol.satisfiesLimitedEdgeAdjacency, false);
assert.equal(adjacentSameSymbol.satisfiesCombinedHypothesis, false);
assert.equal(adjacentSameSymbol.adjacentEdgeTerminalPairCount, 1);
assert.equal(adjacentSameSymbol.adjacentSameSymbolEdgePairCount, 1);
assert.deepEqual(adjacentSameSymbol.adjacentEdgeTerminalPairs, [{
  symbols: ["circle", "circle"],
  terminalIds: ["circle-0-2", "circle-0-3"],
}]);

const oneDifferentSymbolPairIsAllowed =
  analyzeTerminalPlacementHypotheses(puzzle([
  terminal("circle", 1, 1),
  terminal("triangle", 2, 2),
  terminal("square", 4, 4),
  terminal("circle", 1, 4),
  terminal("circle", 0, 2),
  terminal("triangle", 0, 3),
]));
assert.equal(
  oneDifferentSymbolPairIsAllowed.satisfiesCombinedHypothesis,
  true,
);
assert.equal(
  oneDifferentSymbolPairIsAllowed.adjacentEdgeTerminalPairCount,
  1,
);
assert.equal(
  oneDifferentSymbolPairIsAllowed.adjacentSameSymbolEdgePairCount,
  0,
);
assert.equal(
  oneDifferentSymbolPairIsAllowed.satisfiesDifferentSymbolEdgeAdjacency,
  true,
);

const oneCentralPairIsAllowed =
  analyzeTerminalPlacementHypotheses(puzzle([
    terminal("circle", 1, 1),
    terminal("triangle", 1, 2),
    terminal("square", 3, 3),
    terminal("circle", 4, 4),
  ]));
assert.equal(oneCentralPairIsAllowed.satisfiesLimitedCentralAdjacency, true);
assert.equal(oneCentralPairIsAllowed.satisfiesCombinedHypothesis, true);
assert.equal(oneCentralPairIsAllowed.adjacentCentralTerminalPairCount, 1);
assert.deepEqual(oneCentralPairIsAllowed.adjacentCentralTerminalPairs, [{
  symbols: ["circle", "triangle"],
  terminalIds: ["circle-1-1", "triangle-1-2"],
}]);

const twoCentralPairsAreRejected =
  analyzeTerminalPlacementHypotheses(puzzle([
    terminal("circle", 1, 1),
    terminal("triangle", 1, 2),
    terminal("square", 3, 3),
    terminal("circle", 3, 4),
  ]));
assert.equal(
  twoCentralPairsAreRejected.satisfiesLimitedCentralAdjacency,
  false,
);
assert.equal(twoCentralPairsAreRejected.satisfiesCombinedHypothesis, false);
assert.equal(
  twoCentralPairsAreRejected.adjacentCentralTerminalPairCount,
  2,
);

const straightThreeTerminalCluster =
  analyzeTerminalPlacementHypotheses(puzzle([
    terminal("circle", 0, 2),
    terminal("triangle", 1, 2),
    terminal("circle", 2, 2),
    terminal("square", 4, 1),
    terminal("circle", 4, 4),
  ]));
assert.equal(straightThreeTerminalCluster.satisfiesCombinedHypothesis, true);
assert.equal(
  straightThreeTerminalCluster.satisfiesTerminalRunAndBlockRule,
  false,
);
assert.equal(
  straightThreeTerminalCluster.satisfiesNoStraightTerminalRun,
  false,
);
assert.equal(straightThreeTerminalCluster.satisfiesFinalHypothesis, false);
assert.equal(
  straightThreeTerminalCluster.maximumAdjacentTerminalClusterSize,
  3,
);
assert.equal(straightThreeTerminalCluster.horizontalThreeTerminalRunCount, 0);
assert.equal(straightThreeTerminalCluster.verticalThreeTerminalRunCount, 1);

const lShapedThreeTerminalCluster =
  analyzeTerminalPlacementHypotheses(puzzle([
    terminal("circle", 0, 1),
    terminal("triangle", 1, 1),
    terminal("circle", 1, 2),
    terminal("square", 4, 4),
    terminal("circle", 3, 3),
  ]));
assert.equal(lShapedThreeTerminalCluster.satisfiesCombinedHypothesis, true);
assert.equal(
  lShapedThreeTerminalCluster.satisfiesTerminalRunAndBlockRule,
  false,
);
assert.equal(
  lShapedThreeTerminalCluster.satisfiesNoLShapedTerminalTriple,
  false,
);
assert.equal(lShapedThreeTerminalCluster.satisfiesFinalHypothesis, false);
assert.equal(lShapedThreeTerminalCluster.lShapedThreeTerminalBlockCount, 1);
assert.equal(
  lShapedThreeTerminalCluster.maximumAdjacentTerminalClusterSize,
  3,
);
assert.equal(
  lShapedThreeTerminalCluster.centralBoundaryAdjacentTerminalPairCount,
  1,
);

const connectedTerminalFilterExamples = [
  {
    label: "例1: 横一列の4端点",
    expectedMaximum: 4,
    expectedSatisfies: false,
    terminals: [
      terminal("circle", 1, 0),
      terminal("triangle", 1, 1),
      terminal("square", 1, 2),
      terminal("circle", 1, 3),
    ],
  },
  {
    label: "例2: L字の4端点",
    expectedMaximum: 4,
    expectedSatisfies: false,
    terminals: [
      terminal("circle", 0, 1),
      terminal("triangle", 1, 1),
      terminal("square", 2, 1),
      terminal("circle", 2, 2),
    ],
  },
  {
    label: "例3: 階段状の5端点",
    expectedMaximum: 5,
    expectedSatisfies: false,
    terminals: [
      terminal("circle", 0, 0),
      terminal("triangle", 0, 1),
      terminal("square", 1, 1),
      terminal("circle", 1, 2),
      terminal("triangle", 2, 2),
    ],
  },
  {
    label: "例4: 斜めの4端点",
    expectedMaximum: 1,
    expectedSatisfies: true,
    terminals: [
      terminal("circle", 0, 0),
      terminal("triangle", 1, 1),
      terminal("square", 2, 2),
      terminal("circle", 3, 3),
    ],
  },
  {
    label: "例5: 3端点と孤立1端点",
    expectedMaximum: 3,
    expectedSatisfies: true,
    terminals: [
      terminal("circle", 1, 0),
      terminal("triangle", 1, 1),
      terminal("square", 1, 2),
      terminal("circle", 4, 4),
    ],
  },
  {
    label: "例6: 離れた2端点組が2つ",
    expectedMaximum: 2,
    expectedSatisfies: true,
    terminals: [
      terminal("circle", 0, 0),
      terminal("triangle", 0, 1),
      terminal("square", 4, 3),
      terminal("circle", 4, 4),
    ],
  },
];
for (const example of connectedTerminalFilterExamples) {
  const analysis = analyzeTerminalPlacementHypotheses(
    puzzle(example.terminals),
  );
  assert.equal(
    analysis.maximumAdjacentTerminalClusterSize,
    example.expectedMaximum,
    `${example.label}の最大連結端点数が不正です。`,
  );
  assert.equal(
    analysis.satisfiesNoFourOrMoreOrthogonallyConnectedTerminals,
    example.expectedSatisfies,
    `${example.label}のfilter判定が不正です。`,
  );
}

const twoSeparatePairsAreAllowed =
  analyzeTerminalPlacementHypotheses(puzzle([
    terminal("circle", 1, 1),
    terminal("triangle", 1, 2),
    terminal("square", 4, 1),
    terminal("circle", 3, 4),
    terminal("circle", 5, 4),
    terminal("square", 5, 5),
  ]));
assert.equal(twoSeparatePairsAreAllowed.satisfiesCombinedHypothesis, true);
assert.equal(twoSeparatePairsAreAllowed.satisfiesFinalHypothesis, true);
assert.equal(twoSeparatePairsAreAllowed.maximumAdjacentTerminalClusterSize, 2);

const filledTwoByTwoBlockIsRejected =
  analyzeTerminalPlacementHypotheses(puzzle([
    terminal("circle", 0, 1),
    terminal("triangle", 0, 2),
    terminal("triangle", 1, 1),
    terminal("circle", 1, 2),
    terminal("square", 4, 4),
    terminal("circle", 3, 3),
  ]));
assert.equal(filledTwoByTwoBlockIsRejected.satisfiesCombinedHypothesis, true);
assert.equal(
  filledTwoByTwoBlockIsRejected.satisfiesLimitedCentralBoundaryAdjacency,
  true,
);
assert.equal(
  filledTwoByTwoBlockIsRejected.satisfiesTerminalRunAndBlockRule,
  false,
);
assert.equal(
  filledTwoByTwoBlockIsRejected.satisfiesNoFilledTwoByTwoTerminalBlock,
  false,
);
assert.equal(filledTwoByTwoBlockIsRejected.satisfiesFinalHypothesis, false);
assert.equal(filledTwoByTwoBlockIsRejected.filledTwoByTwoTerminalBlockCount, 1);
assert.equal(
  filledTwoByTwoBlockIsRejected.centralBoundaryAdjacentTerminalPairCount,
  2,
);

const threeCentralBoundaryPairsAreRejected =
  analyzeTerminalPlacementHypotheses(puzzle([
    terminal("circle", 0, 2),
    terminal("circle", 1, 2),
    terminal("triangle", 4, 2),
    terminal("triangle", 5, 2),
    terminal("square", 3, 0),
    terminal("square", 3, 1),
    terminal("circle", 2, 4),
  ]));
assert.equal(
  threeCentralBoundaryPairsAreRejected.satisfiesCombinedHypothesis,
  true,
);
assert.equal(
  threeCentralBoundaryPairsAreRejected.satisfiesTerminalRunAndBlockRule,
  true,
);
assert.equal(
  threeCentralBoundaryPairsAreRejected
    .satisfiesLimitedCentralBoundaryAdjacency,
  false,
);
assert.equal(
  threeCentralBoundaryPairsAreRejected
    .centralBoundaryAdjacentTerminalPairCount,
  3,
);
assert.equal(
  threeCentralBoundaryPairsAreRejected.satisfiesFinalHypothesis,
  false,
);

const twoDifferentSymbolPairsAreRejected =
  analyzeTerminalPlacementHypotheses(puzzle([
    terminal("circle", 1, 1),
    terminal("triangle", 2, 2),
    terminal("square", 4, 4),
    terminal("circle", 0, 0),
    terminal("triangle", 0, 1),
    terminal("circle", 5, 4),
    terminal("square", 5, 5),
  ]));
assert.equal(
  twoDifferentSymbolPairsAreRejected.satisfiesCombinedHypothesis,
  false,
);
assert.equal(
  twoDifferentSymbolPairsAreRejected.adjacentEdgeTerminalPairCount,
  2,
);
assert.equal(
  twoDifferentSymbolPairsAreRejected.satisfiesEdgeAdjacencyPairLimit,
  false,
);

for (const [side, terminals] of Object.entries({
  top: [
    terminal("circle", 0, 0),
    terminal("triangle", 1, 0),
    terminal("square", 0, 2),
    terminal("circle", 1, 2),
    terminal("triangle", 0, 4),
    terminal("square", 1, 4),
  ],
  right: [
    terminal("circle", 0, 5),
    terminal("triangle", 0, 4),
    terminal("square", 2, 5),
    terminal("circle", 2, 4),
    terminal("triangle", 4, 5),
    terminal("square", 4, 4),
  ],
  bottom: [
    terminal("circle", 5, 0),
    terminal("triangle", 4, 0),
    terminal("square", 5, 2),
    terminal("circle", 4, 2),
    terminal("triangle", 5, 4),
    terminal("square", 4, 4),
  ],
  left: [
    terminal("circle", 0, 0),
    terminal("triangle", 0, 1),
    terminal("square", 2, 0),
    terminal("circle", 2, 1),
    terminal("triangle", 4, 0),
    terminal("square", 4, 1),
  ],
})) {
  const threePairsOnOneSide =
    analyzeTerminalPlacementHypotheses(puzzle(terminals));
  assert.equal(
    threePairsOnOneSide.satisfiesNoConcentratedOrthogonalEdgePairs,
    false,
    `${side}辺の外周一辺集中型を却下できませんでした。`,
  );
  assert.equal(
    threePairsOnOneSide.orthogonalEdgeTerminalPairCounts[side],
    3,
  );
  assert.equal(
    threePairsOnOneSide.maximumOrthogonalEdgeTerminalPairCount,
    3,
  );
}

const twoOrthogonalPairsOnOneSideAreAllowed =
  analyzeTerminalPlacementHypotheses(puzzle([
    terminal("circle", 0, 0),
    terminal("triangle", 1, 0),
    terminal("square", 0, 3),
    terminal("circle", 1, 3),
  ]));
assert.equal(
  twoOrthogonalPairsOnOneSideAreAllowed
    .satisfiesNoConcentratedOrthogonalEdgePairs,
  true,
);
assert.equal(
  twoOrthogonalPairsOnOneSideAreAllowed
    .maximumOrthogonalEdgeTerminalPairCount,
  2,
);

console.log("onaji-no-tsunagi difficulty hypothesis tests passed");

function puzzle(terminals) {
  return {
    width: 6,
    height: 6,
    terminals,
  };
}

function terminal(symbol, row, column) {
  return {
    terminalId: `${symbol}-${row}-${column}`,
    symbol,
    row,
    column,
  };
}
