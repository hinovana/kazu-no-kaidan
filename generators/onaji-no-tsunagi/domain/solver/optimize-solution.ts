import { adjacentIndices } from "../grid/adjacency.ts";
import {
  cellIndex,
  indexToCell,
  manhattanDistance,
} from "../grid/coordinates.ts";
import type { Puzzle, SymbolId, Terminal } from "../types/puzzle.ts";
import type {
  OptimizeSolutionResult,
  PathSolution,
  Solution,
  SolutionCost,
} from "../types/solution.ts";
import {
  calculateSolutionCost,
  compareSolutionCost,
} from "../validation/analyze-solution-geometry.ts";
import { validatePuzzle } from "../validation/validate-puzzle.ts";
import { validateSolution } from "../validation/validate-solution.ts";
import { listSameSymbolPartners } from "./enumerate-pairings.ts";
import { normalizeSolution } from "./normalize-solution.ts";
import {
  isReachable,
  setBit,
  shortestPathDistance,
} from "./residual-reachability.ts";
import {
  allTerminalsHaveReachablePartners,
  canEnterPathCell,
  createTerminalIndexSet,
  hasEvenSymbolParityInEveryComponent,
  sortTerminals,
  terminalSearchStateKey,
} from "./search-grid.ts";

export interface OptimizeSolutionOptions {
  readonly stateBudget?: number;
}

interface PrefixCost {
  readonly totalEdgeCount: number;
  readonly unitBayCount: number;
  readonly totalTurnCount: number;
}

interface OptimizerContext {
  readonly puzzle: Puzzle;
  readonly terminalIndices: ReadonlySet<number>;
  readonly stateBudget: number;
  readonly matchingLowerBoundMemo: Map<string, number>;
  readonly completedPrefixByState: Map<string, PrefixCost>;
  exploredStateCount: number;
  budgetExhausted: boolean;
  bestSolution: Solution;
  bestCost: SolutionCost;
  foundSolution: boolean;
}

interface TerminalSelection {
  readonly terminal: Terminal;
  readonly partners: readonly Terminal[];
}

export function optimizeSolution(
  puzzle: Puzzle,
  plantedSolution: Solution,
  options: OptimizeSolutionOptions = {},
): OptimizeSolutionResult {
  const puzzleValidation = validatePuzzle(puzzle);
  if (!puzzleValidation.valid) {
    throw new TypeError(
      puzzleValidation.issues.map((issue) => issue.message).join("\n"),
    );
  }
  const plantedValidation = validateSolution(puzzle, plantedSolution);
  if (!plantedValidation.valid) {
    throw new TypeError(
      plantedValidation.issues.map((issue) => issue.message).join("\n"),
    );
  }
  const normalizedPlanted = normalizeSolution(plantedSolution, puzzle.width);
  const context: OptimizerContext = {
    puzzle,
    terminalIndices: createTerminalIndexSet(puzzle),
    stateBudget: Math.max(
      1,
      Math.floor(options.stateBudget ?? 2_000_000),
    ),
    matchingLowerBoundMemo: new Map(),
    completedPrefixByState: new Map(),
    exploredStateCount: 0,
    budgetExhausted: false,
    bestSolution: normalizedPlanted,
    bestCost: calculateSolutionCost(puzzle, normalizedPlanted),
    foundSolution: false,
  };
  const terminals = sortTerminals(puzzle.terminals, puzzle.width);
  const lowerBound = minimumMatchingDistance(context, terminals, 0n);
  searchTerminals(context, terminals, 0n, [], emptyPrefix());

  if (context.budgetExhausted) {
    return {
      status: "budget_exhausted",
      incumbent: context.bestSolution,
      incumbentCost: context.bestCost,
      lowerBound,
      exploredStateCount: context.exploredStateCount,
    };
  }
  if (!context.foundSolution) {
    return {
      status: "unsatisfiable",
      exploredStateCount: context.exploredStateCount,
    };
  }
  return {
    status: "optimal",
    solution: context.bestSolution,
    cost: context.bestCost,
    exploredStateCount: context.exploredStateCount,
  };
}

function searchTerminals(
  context: OptimizerContext,
  remainingTerminals: readonly Terminal[],
  occupied: bigint,
  paths: readonly PathSolution[],
  prefix: PrefixCost,
): void {
  if (context.budgetExhausted) {
    return;
  }
  context.exploredStateCount += 1;
  if (context.exploredStateCount > context.stateBudget) {
    context.budgetExhausted = true;
    return;
  }
  if (!canStillImprove(
    prefix,
    minimumMatchingDistance(context, remainingTerminals, occupied),
    context.bestCost,
  )) {
    return;
  }
  if (remainingTerminals.length === 0) {
    considerCompleteSolution(context, { paths });
    return;
  }
  if (!hasEvenSymbolParityInEveryComponent(
    context.puzzle,
    remainingTerminals,
    occupied,
  )) {
    return;
  }

  const stateKey = terminalSearchStateKey(occupied, remainingTerminals);
  const completedPrefix = context.completedPrefixByState.get(stateKey);
  if (
    completedPrefix !== undefined
    && comparePrimaryPrefix(completedPrefix, prefix) < 0
  ) {
    return;
  }
  const selection = selectMostConstrainedTerminal(
    context,
    remainingTerminals,
    occupied,
  );
  if (selection === null || selection.partners.length === 0) {
    return;
  }

  for (const partner of selection.partners) {
    const nextRemaining = remainingTerminals.filter((terminal) => (
      terminal.terminalId !== selection.terminal.terminalId
      && terminal.terminalId !== partner.terminalId
    ));
    enumeratePaths(
      context,
      selection.terminal,
      partner,
      nextRemaining,
      occupied,
      paths,
      prefix,
    );
    if (context.budgetExhausted) {
      return;
    }
  }
  const previous = context.completedPrefixByState.get(stateKey);
  if (previous === undefined || comparePrimaryPrefix(prefix, previous) < 0) {
    context.completedPrefixByState.set(stateKey, prefix);
  }
}

function enumeratePaths(
  context: OptimizerContext,
  first: Terminal,
  second: Terminal,
  remainingTerminals: readonly Terminal[],
  occupied: bigint,
  completedPaths: readonly PathSolution[],
  prefix: PrefixCost,
): void {
  const startIndex = cellIndex(first, context.puzzle.width);
  const targetIndex = cellIndex(second, context.puzzle.width);
  const remainingLowerBound = minimumMatchingDistance(
    context,
    remainingTerminals,
    occupied,
  );
  walk(startIndex, setBit(0n, startIndex), [startIndex], 0, 0);

  function walk(
    currentIndex: number,
    visited: bigint,
    path: readonly number[],
    pathTurnCount: number,
    pathUnitBayCount: number,
  ): void {
    if (context.budgetExhausted) {
      return;
    }
    context.exploredStateCount += 1;
    if (context.exploredStateCount > context.stateBudget) {
      context.budgetExhausted = true;
      return;
    }
    const pathEdgeCount = path.length - 1;
    const optimisticPrefix = {
      totalEdgeCount: prefix.totalEdgeCount + pathEdgeCount,
      unitBayCount: prefix.unitBayCount + pathUnitBayCount,
      totalTurnCount: prefix.totalTurnCount + pathTurnCount,
    };
    const distanceToTarget = manhattanDistance(
      indexToCell(currentIndex, context.puzzle.width),
      second,
    );
    if (!canStillImprove(
      optimisticPrefix,
      distanceToTarget + remainingLowerBound,
      context.bestCost,
    )) {
      return;
    }
    if (currentIndex === targetIndex) {
      searchTerminals(
        context,
        remainingTerminals,
        occupied | visited,
        [...completedPaths, {
          symbol: first.symbol,
          cells: path.map((index) => (
            indexToCell(index, context.puzzle.width)
          )),
        }],
        optimisticPrefix,
      );
      return;
    }

    const candidates = adjacentIndices(
      currentIndex,
      context.puzzle.width,
      context.puzzle.height,
    )
      .filter((nextIndex) => canEnterPathCell(
        context.terminalIndices,
        nextIndex,
        targetIndex,
        occupied,
        visited,
      ))
      .toSorted((left, right) => (
        manhattanDistance(
          indexToCell(left, context.puzzle.width),
          second,
        ) - manhattanDistance(
          indexToCell(right, context.puzzle.width),
          second,
        )
        || left - right
      ));
    for (const nextIndex of candidates) {
      const nextVisited = setBit(visited, nextIndex);
      if (
        nextIndex !== targetIndex
        && path.length % 3 === 0
        && !allTerminalsHaveReachablePartners(
          context.puzzle,
          context.terminalIndices,
          remainingTerminals,
          occupied | nextVisited,
        )
      ) {
        continue;
      }
      walk(
        nextIndex,
        nextVisited,
        [...path, nextIndex],
        pathTurnCount + newTurnCount(path, nextIndex, context.puzzle.width),
        pathUnitBayCount + newUnitBayCount(
          path,
          nextIndex,
          context.puzzle.width,
        ),
      );
      if (context.budgetExhausted) {
        return;
      }
    }
  }
}

function considerCompleteSolution(
  context: OptimizerContext,
  solution: Solution,
): void {
  const normalized = normalizeSolution(solution, context.puzzle.width);
  const cost = calculateSolutionCost(context.puzzle, normalized);
  const primaryComparison = comparePrimaryCost(cost, context.bestCost);
  if (primaryComparison < 0) {
    context.bestSolution = normalized;
    context.bestCost = cost;
    context.foundSolution = true;
    return;
  }
  if (primaryComparison === 0) {
    context.foundSolution = true;
    if (compareSolutionCost(cost, context.bestCost) < 0) {
      context.bestSolution = normalized;
      context.bestCost = cost;
    }
  }
}

function selectMostConstrainedTerminal(
  context: OptimizerContext,
  terminals: readonly Terminal[],
  occupied: bigint,
): TerminalSelection | null {
  let selected: TerminalSelection | null = null;
  for (const terminal of terminals) {
    const partners = listSameSymbolPartners(terminal, terminals)
      .filter((candidate) => isReachable({
        width: context.puzzle.width,
        height: context.puzzle.height,
        occupied,
        terminalIndices: context.terminalIndices,
      }, cellIndex(terminal, context.puzzle.width), cellIndex(candidate, context.puzzle.width)));
    if (
      selected === null
      || partners.length < selected.partners.length
      || (
        partners.length === selected.partners.length
        && terminal.terminalId.localeCompare(
          selected.terminal.terminalId,
        ) < 0
      )
    ) {
      selected = { terminal, partners };
    }
  }
  return selected;
}

function minimumMatchingDistance(
  context: OptimizerContext,
  terminals: readonly Terminal[],
  occupied: bigint,
): number {
  const key = `all:${occupied.toString(16)}:${terminals
    .map((terminal) => terminal.terminalId)
    .toSorted()
    .join(",")}`;
  const cached = context.matchingLowerBoundMemo.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const bySymbol = new Map<SymbolId, Terminal[]>();
  for (const terminal of terminals) {
    const entries = bySymbol.get(terminal.symbol) ?? [];
    entries.push(terminal);
    bySymbol.set(terminal.symbol, entries);
  }
  let total = 0;
  for (const entries of bySymbol.values()) {
    total += minimumSymbolMatchingDistance(context, entries, occupied);
  }
  context.matchingLowerBoundMemo.set(key, total);
  return total;
}

function minimumSymbolMatchingDistance(
  context: OptimizerContext,
  terminals: readonly Terminal[],
  occupied: bigint,
): number {
  const memoKey = `symbol:${occupied.toString(16)}:${terminals
    .map((terminal) => terminal.terminalId)
    .toSorted()
    .join(",")}`;
  const cached = context.matchingLowerBoundMemo.get(memoKey);
  if (cached !== undefined) {
    return cached;
  }
  const first = terminals[0];
  if (first === undefined) {
    return 0;
  }
  let minimum = Number.POSITIVE_INFINITY;
  for (let partnerIndex = 1; partnerIndex < terminals.length; partnerIndex += 1) {
    const partner = terminals[partnerIndex];
    if (partner === undefined) {
      continue;
    }
    minimum = Math.min(
      minimum,
      shortestResidualDistance(context, first, partner, occupied)
        + minimumSymbolMatchingDistance(
        context,
        terminals.filter((_, index) => (
          index !== 0 && index !== partnerIndex
        )),
        occupied,
      ),
    );
  }
  context.matchingLowerBoundMemo.set(memoKey, minimum);
  return minimum;
}

function shortestResidualDistance(
  context: OptimizerContext,
  first: Terminal,
  second: Terminal,
  occupied: bigint,
): number {
  return shortestPathDistance({
    width: context.puzzle.width,
    height: context.puzzle.height,
    occupied,
    terminalIndices: context.terminalIndices,
  }, cellIndex(first, context.puzzle.width), cellIndex(second, context.puzzle.width))
    ?? Number.POSITIVE_INFINITY;
}

function canStillImprove(
  prefix: PrefixCost,
  remainingEdgeLowerBound: number,
  incumbent: SolutionCost,
): boolean {
  const minimumEdgeCount = prefix.totalEdgeCount + remainingEdgeLowerBound;
  if (minimumEdgeCount !== incumbent.totalEdgeCount) {
    return minimumEdgeCount < incumbent.totalEdgeCount;
  }
  if (prefix.unitBayCount !== incumbent.unitBayCount) {
    return prefix.unitBayCount <= incumbent.unitBayCount;
  }
  return prefix.totalTurnCount <= incumbent.totalTurnCount;
}

function newTurnCount(
  path: readonly number[],
  nextIndex: number,
  width: number,
): number {
  const previous = path.at(-1);
  const before = path.at(-2);
  if (previous === undefined || before === undefined) {
    return 0;
  }
  const firstDirection = direction(before, previous, width);
  const secondDirection = direction(previous, nextIndex, width);
  return firstDirection === secondDirection ? 0 : 1;
}

function newUnitBayCount(
  path: readonly number[],
  nextIndex: number,
  width: number,
): number {
  const threeStepsBack = path.at(-3);
  if (threeStepsBack === undefined) {
    return 0;
  }
  return manhattanDistance(
    indexToCell(threeStepsBack, width),
    indexToCell(nextIndex, width),
  ) === 1
    ? 1
    : 0;
}

function direction(
  fromIndex: number,
  toIndex: number,
  width: number,
): string {
  const from = indexToCell(fromIndex, width);
  const to = indexToCell(toIndex, width);
  return `${to.row - from.row},${to.column - from.column}`;
}

function comparePrimaryCost(
  left: SolutionCost,
  right: SolutionCost,
): number {
  return left.totalEdgeCount - right.totalEdgeCount
    || left.unitBayCount - right.unitBayCount
    || left.totalTurnCount - right.totalTurnCount;
}

function comparePrimaryPrefix(
  left: PrefixCost,
  right: PrefixCost,
): number {
  return left.totalEdgeCount - right.totalEdgeCount
    || left.unitBayCount - right.unitBayCount
    || left.totalTurnCount - right.totalTurnCount;
}

function emptyPrefix(): PrefixCost {
  return {
    totalEdgeCount: 0,
    unitBayCount: 0,
    totalTurnCount: 0,
  };
}
