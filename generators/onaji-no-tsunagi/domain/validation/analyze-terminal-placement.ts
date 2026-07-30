/**
 * 端点の座標配置と記号配置を分析し、生成policyと監査で共有する。
 *
 * 配置条件と体感難易度の因果関係は保証せず、座標から再現可能な統計と
 * boolean判定だけを返す。
 *
 * @packageDocumentation
 */

import type {Cell, Puzzle, SymbolId, Terminal} from '../types/puzzle.ts';

const SYMBOLS: readonly SymbolId[] = ['circle', 'square', 'triangle'];
const CENTRAL_TERMINAL_MINIMUM = 4;
const CENTRAL_TERMINAL_MAXIMUM = 6;
const CENTRAL_BOUNDARY_ADJACENCY_MAXIMUM = 2;
const ORTHOGONAL_EDGE_PAIR_MAXIMUM = 2;
const ORTHOGONALLY_CONNECTED_TERMINAL_MAXIMUM = 3;
const constraintMasksByGeometry = new Map<string, TerminalConstraintMasks>();

interface TerminalConstraintMasks {
  readonly outerAdjacentPairMasks: readonly bigint[];
  readonly centralAdjacentPairMasks: readonly bigint[];
  readonly straightRunMasks: readonly bigint[];
  readonly twoByTwoMasks: readonly bigint[];
}

interface CellPair {
  readonly first: Cell;
  readonly second: Cell;
}

interface AdjacentTerminalPair {
  readonly symbols: readonly [SymbolId, SymbolId];
  readonly terminalIds: readonly [string, string];
}

interface TerminalCluster {
  readonly terminalIds: readonly string[];
  readonly symbols: readonly SymbolId[];
}

/** 端点IDを必要としない、記号付きの端点セル。 */
export interface SymbolTerminalCell extends Cell {
  readonly symbol: SymbolId;
}

/** 記号配置だけに依存する生成制約の分析。 */
export interface TerminalSymbolPlacementAnalysis {
  readonly centralSymbolCounts: Readonly<Record<SymbolId, number>>;
  readonly missingSymbols: readonly SymbolId[];
  readonly adjacentSameSymbolEdgePairCount: number;
  readonly satisfiesCentralSymbolCoverage: boolean;
  readonly satisfiesDifferentSymbolEdgeAdjacency: boolean;
}

interface TerminalRuns {
  readonly horizontal: readonly (readonly Cell[])[];
  readonly vertical: readonly (readonly Cell[])[];
}

interface OrthogonalEdgePairs {
  readonly top: readonly CellPair[];
  readonly right: readonly CellPair[];
  readonly bottom: readonly CellPair[];
  readonly left: readonly CellPair[];
}

/** 記号を考慮しない端点座標の配置分析。 */
export interface TerminalCellPlacementAnalysis {
  readonly centralTerminalCount: number;
  readonly outerRingTerminalCount: number;
  readonly adjacentEdgeCellPairs: readonly CellPair[];
  readonly adjacentCentralCellPairs: readonly CellPair[];
  readonly centralBoundaryAdjacentCellPairs: readonly CellPair[];
  readonly threeTerminalRuns: TerminalRuns;
  readonly filledTwoByTwoTerminalBlocks: readonly (readonly Cell[])[];
  readonly lShapedThreeTerminalBlocks: readonly (readonly Cell[])[];
  readonly orthogonalEdgeCellPairsBySide: OrthogonalEdgePairs;
  readonly maximumAdjacentTerminalClusterSize: number;
  /** 縦横隣接だけでたどれる各端点連結成分が3端点以下ならtrue。 */
  readonly satisfiesNoFourOrMoreOrthogonallyConnectedTerminals: boolean;
}

/** 生成探索中に利用する、単調な配置条件と完成時L字条件の最小分析。 */
export interface TerminalGeometryConstraintAnalysis {
  readonly adjacentEdgeTerminalPairCount: number;
  readonly adjacentCentralTerminalPairCount: number;
  readonly hasStraightTerminalRun: boolean;
  readonly hasLShapedTerminalTriple: boolean;
}

/** 記号を含む完成Puzzleの端点配置分析。 */
export interface TerminalPlacementAnalysis {
  readonly satisfiesCentralSymbolCoverage: boolean;
  readonly satisfiesCentralTerminalCountRange: boolean;
  readonly satisfiesBoundedCentralPlacement: boolean;
  readonly satisfiesEdgeAdjacencyPairLimit: boolean;
  readonly satisfiesDifferentSymbolEdgeAdjacency: boolean;
  readonly satisfiesLimitedEdgeAdjacency: boolean;
  readonly satisfiesLimitedCentralAdjacency: boolean;
  readonly satisfiesNoStraightTerminalRun: boolean;
  readonly satisfiesNoFilledTwoByTwoTerminalBlock: boolean;
  readonly satisfiesNoLShapedTerminalTriple: boolean;
  readonly satisfiesTerminalRunAndBlockRule: boolean;
  readonly satisfiesLimitedCentralBoundaryAdjacency: boolean;
  readonly satisfiesNoConcentratedOrthogonalEdgePairs: boolean;
  /** 縦横隣接だけでたどれる各端点連結成分が3端点以下ならtrue。 */
  readonly satisfiesNoFourOrMoreOrthogonallyConnectedTerminals: boolean;
  readonly satisfiesPreviousCombinedHypothesis: boolean;
  readonly satisfiesBoundedCentralAndEdgeHypothesis: boolean;
  readonly satisfiesCombinedHypothesis: boolean;
  readonly satisfiesFinalHypothesis: boolean;
  readonly requiredSymbols: readonly SymbolId[];
  readonly missingSymbols: readonly SymbolId[];
  readonly centralSymbolCounts: Readonly<Record<SymbolId, number>>;
  readonly centralTerminalCount: number;
  readonly outerRingTerminalCount: number;
  readonly adjacentEdgeTerminalPairCount: number;
  readonly adjacentSameSymbolEdgePairCount: number;
  readonly adjacentEdgeTerminalPairs: readonly AdjacentTerminalPair[];
  readonly adjacentCentralTerminalPairCount: number;
  readonly adjacentCentralTerminalPairs: readonly AdjacentTerminalPair[];
  readonly centralBoundaryAdjacentTerminalPairCount: number;
  readonly centralBoundaryAdjacentTerminalPairs: readonly AdjacentTerminalPair[];
  readonly horizontalThreeTerminalRunCount: number;
  readonly verticalThreeTerminalRunCount: number;
  readonly threeTerminalRuns: TerminalRuns;
  readonly filledTwoByTwoTerminalBlockCount: number;
  readonly filledTwoByTwoTerminalBlocks: readonly (readonly Cell[])[];
  readonly lShapedThreeTerminalBlockCount: number;
  readonly lShapedThreeTerminalBlocks: readonly (readonly Cell[])[];
  readonly orthogonalEdgeTerminalPairCounts: Readonly<
    Record<keyof OrthogonalEdgePairs, number>
  >;
  readonly orthogonalEdgeTerminalPairsBySide: Readonly<
    Record<keyof OrthogonalEdgePairs, readonly AdjacentTerminalPair[]>
  >;
  readonly maximumOrthogonalEdgeTerminalPairCount: number;
  readonly maximumAdjacentTerminalClusterSize: number;
  readonly adjacentTerminalClusters: readonly TerminalCluster[];
}

/**
 * 記号を考慮せず、端点セルの隣接、連続、2×2配置を分析する。
 *
 * @remarks
 * 部分探索にも利用できるが、L字型3連は4個目の端点で解消し得るため、
 * 完成配置以外での棄却条件には使わない。
 */
export function analyzeTerminalCells(
  cells: readonly Cell[],
  width: number,
  height: number,
): TerminalCellPlacementAnalysis {
  const centralCells = cells.filter(cell =>
    isInsideCentralRegion(cell, width, height),
  );
  const adjacentCellPairs = findAdjacentCellPairs(cells, () => true);
  const adjacentEdgeCellPairs = findAdjacentCellPairs(cells, cell =>
    isOnOuterRing(cell, width, height),
  );
  const adjacentCentralCellPairs = findAdjacentCellPairs(cells, cell =>
    isInsideCentralRegion(cell, width, height),
  );
  const centralBoundaryAdjacentCellPairs = adjacentCellPairs.filter(
    pair =>
      isInsideCentralRegion(pair.first, width, height) !==
      isInsideCentralRegion(pair.second, width, height),
  );
  const adjacentClusters = findAdjacentCellClusters(cells);
  const maximumAdjacentTerminalClusterSize = Math.max(
    0,
    ...adjacentClusters.map(cluster => cluster.length),
  );
  return {
    centralTerminalCount: centralCells.length,
    outerRingTerminalCount: cells.length - centralCells.length,
    adjacentEdgeCellPairs,
    adjacentCentralCellPairs,
    centralBoundaryAdjacentCellPairs,
    threeTerminalRuns: findThreeTerminalRuns(cells, width, height),
    filledTwoByTwoTerminalBlocks: findTwoByTwoBlocks(cells, width, height, 4),
    lShapedThreeTerminalBlocks: findTwoByTwoBlocks(cells, width, height, 3),
    orthogonalEdgeCellPairsBySide: findOrthogonalEdgeCellPairsBySide(
      cells,
      width,
      height,
    ),
    maximumAdjacentTerminalClusterSize,
    satisfiesNoFourOrMoreOrthogonallyConnectedTerminals:
      maximumAdjacentTerminalClusterSize <=
      ORTHOGONALLY_CONNECTED_TERMINAL_MAXIMUM,
  };
}

/**
 * row-majorの端点bitmaskから、生成探索に必要な配置条件だけを分析する。
 *
 * @remarks
 * 6×6は36bitを使うため、JavaScriptの32bit bitwise演算ではなくBigIntを
 * 入力とする。
 *
 * @internal
 */
export function analyzeTerminalMask(
  terminalMask: bigint,
  width: number,
  height: number,
): TerminalGeometryConstraintAnalysis {
  const masks = terminalConstraintMasks(width, height);
  return {
    adjacentEdgeTerminalPairCount: countContainedMasks(
      terminalMask,
      masks.outerAdjacentPairMasks,
    ),
    adjacentCentralTerminalPairCount: countContainedMasks(
      terminalMask,
      masks.centralAdjacentPairMasks,
    ),
    hasStraightTerminalRun: masks.straightRunMasks.some(
      mask => (terminalMask & mask) === mask,
    ),
    hasLShapedTerminalTriple: masks.twoByTwoMasks.some(
      mask => countMaskBits(terminalMask & mask) === 3,
    ),
  };
}

/**
 * 中央領域の記号網羅と、外周隣接pairの同記号有無を分析する。
 */
export function analyzeTerminalSymbols(
  terminals: readonly SymbolTerminalCell[],
  width: number,
  height: number,
): TerminalSymbolPlacementAnalysis {
  const geometry = analyzeTerminalCells(terminals, width, height);
  const symbolsByCoordinate = new Map(
    terminals.map(terminal => [cellKey(terminal), terminal.symbol] as const),
  );
  const centralSymbolCounts = Object.fromEntries(
    SYMBOLS.map(symbol => [
      symbol,
      terminals.filter(
        terminal =>
          terminal.symbol === symbol &&
          isInsideCentralRegion(terminal, width, height),
      ).length,
    ]),
  ) as Record<SymbolId, number>;
  const missingSymbols = SYMBOLS.filter(
    symbol => centralSymbolCounts[symbol] === 0,
  );
  const adjacentSameSymbolEdgePairCount = geometry.adjacentEdgeCellPairs.filter(
    pair => {
      const firstSymbol = symbolsByCoordinate.get(cellKey(pair.first));
      const secondSymbol = symbolsByCoordinate.get(cellKey(pair.second));
      return firstSymbol !== undefined && firstSymbol === secondSymbol;
    },
  ).length;
  return {
    centralSymbolCounts,
    missingSymbols,
    adjacentSameSymbolEdgePairCount,
    satisfiesCentralSymbolCoverage: missingSymbols.length === 0,
    satisfiesDifferentSymbolEdgeAdjacency:
      adjacentSameSymbolEdgePairCount === 0,
  };
}

/**
 * 完成Puzzleの端点配置を、生成policyと監査で使う共通形式へ分析する。
 */
export function analyzeTerminalPlacement(
  puzzle: Puzzle,
): TerminalPlacementAnalysis {
  const geometry = analyzeTerminalCells(
    puzzle.terminals,
    puzzle.width,
    puzzle.height,
  );
  const terminalsByCoordinate = new Map(
    puzzle.terminals.map(terminal => [cellKey(terminal), terminal] as const),
  );
  const symbolPlacement = analyzeTerminalSymbols(
    puzzle.terminals,
    puzzle.width,
    puzzle.height,
  );
  const adjacentEdgeTerminalPairs = toTerminalPairs(
    geometry.adjacentEdgeCellPairs,
    terminalsByCoordinate,
  );
  const adjacentCentralTerminalPairs = toTerminalPairs(
    geometry.adjacentCentralCellPairs,
    terminalsByCoordinate,
  );
  const centralBoundaryAdjacentTerminalPairs = toTerminalPairs(
    geometry.centralBoundaryAdjacentCellPairs,
    terminalsByCoordinate,
  );
  const orthogonalEdgeTerminalPairsBySide = {
    top: toTerminalPairs(
      geometry.orthogonalEdgeCellPairsBySide.top,
      terminalsByCoordinate,
    ),
    right: toTerminalPairs(
      geometry.orthogonalEdgeCellPairsBySide.right,
      terminalsByCoordinate,
    ),
    bottom: toTerminalPairs(
      geometry.orthogonalEdgeCellPairsBySide.bottom,
      terminalsByCoordinate,
    ),
    left: toTerminalPairs(
      geometry.orthogonalEdgeCellPairsBySide.left,
      terminalsByCoordinate,
    ),
  };
  const orthogonalEdgeTerminalPairCounts = {
    top: orthogonalEdgeTerminalPairsBySide.top.length,
    right: orthogonalEdgeTerminalPairsBySide.right.length,
    bottom: orthogonalEdgeTerminalPairsBySide.bottom.length,
    left: orthogonalEdgeTerminalPairsBySide.left.length,
  };
  const maximumOrthogonalEdgeTerminalPairCount = Math.max(
    ...Object.values(orthogonalEdgeTerminalPairCounts),
  );
  const satisfiesCentralSymbolCoverage =
    symbolPlacement.satisfiesCentralSymbolCoverage;
  const satisfiesCentralTerminalCountRange =
    geometry.centralTerminalCount >= CENTRAL_TERMINAL_MINIMUM &&
    geometry.centralTerminalCount <= CENTRAL_TERMINAL_MAXIMUM;
  const satisfiesBoundedCentralPlacement =
    satisfiesCentralSymbolCoverage && satisfiesCentralTerminalCountRange;
  const satisfiesEdgeAdjacencyPairLimit = adjacentEdgeTerminalPairs.length <= 1;
  const satisfiesDifferentSymbolEdgeAdjacency =
    symbolPlacement.satisfiesDifferentSymbolEdgeAdjacency;
  const satisfiesLimitedEdgeAdjacency =
    satisfiesEdgeAdjacencyPairLimit && satisfiesDifferentSymbolEdgeAdjacency;
  const satisfiesLimitedCentralAdjacency =
    adjacentCentralTerminalPairs.length <= 1;
  const satisfiesNoStraightTerminalRun =
    geometry.threeTerminalRuns.horizontal.length === 0 &&
    geometry.threeTerminalRuns.vertical.length === 0;
  const satisfiesNoFilledTwoByTwoTerminalBlock =
    geometry.filledTwoByTwoTerminalBlocks.length === 0;
  const satisfiesNoLShapedTerminalTriple =
    geometry.lShapedThreeTerminalBlocks.length === 0;
  const satisfiesTerminalRunAndBlockRule =
    satisfiesNoStraightTerminalRun &&
    satisfiesNoFilledTwoByTwoTerminalBlock &&
    satisfiesNoLShapedTerminalTriple;
  const satisfiesLimitedCentralBoundaryAdjacency =
    centralBoundaryAdjacentTerminalPairs.length <=
    CENTRAL_BOUNDARY_ADJACENCY_MAXIMUM;
  const satisfiesNoConcentratedOrthogonalEdgePairs =
    maximumOrthogonalEdgeTerminalPairCount <= ORTHOGONAL_EDGE_PAIR_MAXIMUM;
  const satisfiesNoFourOrMoreOrthogonallyConnectedTerminals =
    geometry.satisfiesNoFourOrMoreOrthogonallyConnectedTerminals;
  const satisfiesPreviousCombinedHypothesis =
    satisfiesCentralSymbolCoverage && satisfiesLimitedEdgeAdjacency;
  const satisfiesBoundedCentralAndEdgeHypothesis =
    satisfiesBoundedCentralPlacement && satisfiesLimitedEdgeAdjacency;

  return {
    satisfiesCentralSymbolCoverage,
    satisfiesCentralTerminalCountRange,
    satisfiesBoundedCentralPlacement,
    satisfiesEdgeAdjacencyPairLimit,
    satisfiesDifferentSymbolEdgeAdjacency,
    satisfiesLimitedEdgeAdjacency,
    satisfiesLimitedCentralAdjacency,
    satisfiesNoStraightTerminalRun,
    satisfiesNoFilledTwoByTwoTerminalBlock,
    satisfiesNoLShapedTerminalTriple,
    satisfiesTerminalRunAndBlockRule,
    satisfiesLimitedCentralBoundaryAdjacency,
    satisfiesNoConcentratedOrthogonalEdgePairs,
    satisfiesNoFourOrMoreOrthogonallyConnectedTerminals,
    satisfiesPreviousCombinedHypothesis,
    satisfiesBoundedCentralAndEdgeHypothesis,
    satisfiesCombinedHypothesis:
      satisfiesBoundedCentralAndEdgeHypothesis &&
      satisfiesLimitedCentralAdjacency,
    satisfiesFinalHypothesis:
      satisfiesBoundedCentralAndEdgeHypothesis &&
      satisfiesLimitedCentralAdjacency &&
      satisfiesTerminalRunAndBlockRule &&
      satisfiesLimitedCentralBoundaryAdjacency &&
      satisfiesNoConcentratedOrthogonalEdgePairs,
    requiredSymbols: SYMBOLS,
    missingSymbols: symbolPlacement.missingSymbols,
    centralSymbolCounts: symbolPlacement.centralSymbolCounts,
    centralTerminalCount: geometry.centralTerminalCount,
    outerRingTerminalCount: geometry.outerRingTerminalCount,
    adjacentEdgeTerminalPairCount: adjacentEdgeTerminalPairs.length,
    adjacentSameSymbolEdgePairCount:
      symbolPlacement.adjacentSameSymbolEdgePairCount,
    adjacentEdgeTerminalPairs,
    adjacentCentralTerminalPairCount: adjacentCentralTerminalPairs.length,
    adjacentCentralTerminalPairs,
    centralBoundaryAdjacentTerminalPairCount:
      centralBoundaryAdjacentTerminalPairs.length,
    centralBoundaryAdjacentTerminalPairs,
    horizontalThreeTerminalRunCount:
      geometry.threeTerminalRuns.horizontal.length,
    verticalThreeTerminalRunCount: geometry.threeTerminalRuns.vertical.length,
    threeTerminalRuns: geometry.threeTerminalRuns,
    filledTwoByTwoTerminalBlockCount:
      geometry.filledTwoByTwoTerminalBlocks.length,
    filledTwoByTwoTerminalBlocks: geometry.filledTwoByTwoTerminalBlocks,
    lShapedThreeTerminalBlockCount: geometry.lShapedThreeTerminalBlocks.length,
    lShapedThreeTerminalBlocks: geometry.lShapedThreeTerminalBlocks,
    orthogonalEdgeTerminalPairCounts,
    orthogonalEdgeTerminalPairsBySide,
    maximumOrthogonalEdgeTerminalPairCount,
    maximumAdjacentTerminalClusterSize:
      geometry.maximumAdjacentTerminalClusterSize,
    adjacentTerminalClusters: findAdjacentTerminalClusters(puzzle.terminals),
  };
}

function findAdjacentCellPairs(
  cells: readonly Cell[],
  isInRegion: (cell: Cell) => boolean,
): readonly CellPair[] {
  const cellsByCoordinate = new Map(
    cells.map(cell => [cellKey(cell), cell] as const),
  );
  const pairs: CellPair[] = [];
  for (const cell of cells) {
    if (!isInRegion(cell)) {
      continue;
    }
    for (const [rowOffset, columnOffset] of [
      [0, 1],
      [1, 0],
    ] as const) {
      const neighbor = cellsByCoordinate.get(
        `${cell.row + rowOffset},${cell.column + columnOffset}`,
      );
      if (neighbor !== undefined && isInRegion(neighbor)) {
        pairs.push({first: cell, second: neighbor});
      }
    }
  }
  return pairs;
}

function terminalConstraintMasks(
  width: number,
  height: number,
): TerminalConstraintMasks {
  const cacheKey = `${width}x${height}`;
  const cached = constraintMasksByGeometry.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const outerAdjacentPairMasks: bigint[] = [];
  const centralAdjacentPairMasks: bigint[] = [];
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const first = {row, column};
      for (const second of [
        column + 1 < width ? {row, column: column + 1} : undefined,
        row + 1 < height ? {row: row + 1, column} : undefined,
      ]) {
        if (second === undefined) {
          continue;
        }
        const pairMask = maskForCell(first, width) | maskForCell(second, width);
        if (
          isOnOuterRing(first, width, height) &&
          isOnOuterRing(second, width, height)
        ) {
          outerAdjacentPairMasks.push(pairMask);
        }
        if (
          isInsideCentralRegion(first, width, height) &&
          isInsideCentralRegion(second, width, height)
        ) {
          centralAdjacentPairMasks.push(pairMask);
        }
      }
    }
  }
  const straightRunMasks: bigint[] = [];
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column <= width - 3; column += 1) {
      straightRunMasks.push(
        maskForCell({row, column}, width) |
          maskForCell({row, column: column + 1}, width) |
          maskForCell({row, column: column + 2}, width),
      );
    }
  }
  for (let row = 0; row <= height - 3; row += 1) {
    for (let column = 0; column < width; column += 1) {
      straightRunMasks.push(
        maskForCell({row, column}, width) |
          maskForCell({row: row + 1, column}, width) |
          maskForCell({row: row + 2, column}, width),
      );
    }
  }
  const twoByTwoMasks: bigint[] = [];
  for (let row = 0; row < height - 1; row += 1) {
    for (let column = 0; column < width - 1; column += 1) {
      twoByTwoMasks.push(
        maskForCell({row, column}, width) |
          maskForCell({row, column: column + 1}, width) |
          maskForCell({row: row + 1, column}, width) |
          maskForCell({row: row + 1, column: column + 1}, width),
      );
    }
  }
  const created = {
    outerAdjacentPairMasks,
    centralAdjacentPairMasks,
    straightRunMasks,
    twoByTwoMasks,
  };
  constraintMasksByGeometry.set(cacheKey, created);
  return created;
}

function countContainedMasks(
  terminalMask: bigint,
  masks: readonly bigint[],
): number {
  return masks.filter(mask => (terminalMask & mask) === mask).length;
}

function countMaskBits(mask: bigint): number {
  let count = 0;
  let remaining = mask;
  while (remaining !== 0n) {
    remaining &= remaining - 1n;
    count += 1;
  }
  return count;
}

function maskForCell(cell: Cell, width: number): bigint {
  return 1n << BigInt(cell.row * width + cell.column);
}

function findThreeTerminalRuns(
  cells: readonly Cell[],
  width: number,
  height: number,
): TerminalRuns {
  const occupiedCoordinates = new Set(cells.map(cellKey));
  const horizontal: Cell[][] = [];
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column <= width - 3; column += 1) {
      const run = [0, 1, 2].map(offset => ({
        row,
        column: column + offset,
      }));
      if (run.every(cell => occupiedCoordinates.has(cellKey(cell)))) {
        horizontal.push(run);
      }
    }
  }
  const vertical: Cell[][] = [];
  for (let row = 0; row <= height - 3; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const run = [0, 1, 2].map(offset => ({
        row: row + offset,
        column,
      }));
      if (run.every(cell => occupiedCoordinates.has(cellKey(cell)))) {
        vertical.push(run);
      }
    }
  }
  return {horizontal, vertical};
}

function findTwoByTwoBlocks(
  cells: readonly Cell[],
  width: number,
  height: number,
  occupiedCellCount: 3 | 4,
): readonly (readonly Cell[])[] {
  const occupiedCoordinates = new Set(cells.map(cellKey));
  const blocks: Cell[][] = [];
  for (let row = 0; row < height - 1; row += 1) {
    for (let column = 0; column < width - 1; column += 1) {
      const coordinates = [
        {row, column},
        {row, column: column + 1},
        {row: row + 1, column},
        {row: row + 1, column: column + 1},
      ];
      const occupied = coordinates.filter(cell =>
        occupiedCoordinates.has(cellKey(cell)),
      );
      if (occupied.length === occupiedCellCount) {
        blocks.push(occupied);
      }
    }
  }
  return blocks;
}

function findOrthogonalEdgeCellPairsBySide(
  cells: readonly Cell[],
  width: number,
  height: number,
): OrthogonalEdgePairs {
  const cellsByCoordinate = new Map(
    cells.map(cell => [cellKey(cell), cell] as const),
  );
  const pairsBySide: {
    top: CellPair[];
    right: CellPair[];
    bottom: CellPair[];
    left: CellPair[];
  } = {top: [], right: [], bottom: [], left: []};
  for (let column = 0; column < width; column += 1) {
    appendCellPair(
      pairsBySide.top,
      cellsByCoordinate.get(`0,${column}`),
      cellsByCoordinate.get(`1,${column}`),
    );
    appendCellPair(
      pairsBySide.bottom,
      cellsByCoordinate.get(`${height - 1},${column}`),
      cellsByCoordinate.get(`${height - 2},${column}`),
    );
  }
  for (let row = 0; row < height; row += 1) {
    appendCellPair(
      pairsBySide.left,
      cellsByCoordinate.get(`${row},0`),
      cellsByCoordinate.get(`${row},1`),
    );
    appendCellPair(
      pairsBySide.right,
      cellsByCoordinate.get(`${row},${width - 1}`),
      cellsByCoordinate.get(`${row},${width - 2}`),
    );
  }
  return pairsBySide;
}

function appendCellPair(
  pairs: CellPair[],
  first: Cell | undefined,
  second: Cell | undefined,
): void {
  if (first !== undefined && second !== undefined) {
    pairs.push({first, second});
  }
}

function findAdjacentCellClusters(
  cells: readonly Cell[],
): readonly (readonly Cell[])[] {
  const cellsByCoordinate = new Map(
    cells.map(cell => [cellKey(cell), cell] as const),
  );
  const visited = new Set<string>();
  const clusters: Cell[][] = [];
  for (const cell of cells) {
    if (visited.has(cellKey(cell))) {
      continue;
    }
    const pending = [cell];
    const cluster: Cell[] = [];
    visited.add(cellKey(cell));
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) {
        continue;
      }
      cluster.push(current);
      for (const [rowOffset, columnOffset] of [
        [-1, 0],
        [0, -1],
        [0, 1],
        [1, 0],
      ] as const) {
        const neighbor = cellsByCoordinate.get(
          `${current.row + rowOffset},${current.column + columnOffset}`,
        );
        if (neighbor === undefined || visited.has(cellKey(neighbor))) {
          continue;
        }
        visited.add(cellKey(neighbor));
        pending.push(neighbor);
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function findAdjacentTerminalClusters(
  terminals: readonly Terminal[],
): readonly TerminalCluster[] {
  return findAdjacentCellClusters(terminals).map(cluster => {
    const clusterTerminals = cluster as readonly Terminal[];
    return {
      terminalIds: clusterTerminals.map(terminal => terminal.terminalId),
      symbols: clusterTerminals.map(terminal => terminal.symbol),
    };
  });
}

function toTerminalPairs(
  cellPairs: readonly CellPair[],
  terminalsByCoordinate: ReadonlyMap<string, Terminal>,
): readonly AdjacentTerminalPair[] {
  return cellPairs.map(pair => {
    const first = terminalsByCoordinate.get(cellKey(pair.first));
    const second = terminalsByCoordinate.get(cellKey(pair.second));
    if (first === undefined || second === undefined) {
      throw new TypeError('terminal pair coordinate is missing');
    }
    return {
      symbols: [first.symbol, second.symbol],
      terminalIds: [first.terminalId, second.terminalId],
    };
  });
}

function isInsideCentralRegion(
  cell: Cell,
  width: number,
  height: number,
): boolean {
  return (
    cell.row > 0 &&
    cell.row < height - 1 &&
    cell.column > 0 &&
    cell.column < width - 1
  );
}

function isOnOuterRing(cell: Cell, width: number, height: number): boolean {
  return (
    cell.row === 0 ||
    cell.row === height - 1 ||
    cell.column === 0 ||
    cell.column === width - 1
  );
}

function cellKey(cell: Cell): string {
  return `${cell.row},${cell.column}`;
}
