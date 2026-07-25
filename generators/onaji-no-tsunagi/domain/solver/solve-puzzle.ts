import { adjacentIndices } from "../grid/adjacency.ts";
import { cellIndex, indexToCell, manhattanDistance } from "../grid/coordinates.ts";
import type { Puzzle, Terminal } from "../types/puzzle.ts";
import type {
  PathSolution,
  Solution,
  SolveResult,
  SolverMetrics,
} from "../types/solution.ts";
import { validatePuzzle } from "../validation/validate-puzzle.ts";
import { listSameSymbolPartners } from "./enumerate-pairings.ts";
import { normalizeSolution, solutionHash } from "./normalize-solution.ts";
import { isBitSet, isReachable, setBit } from "./residual-reachability.ts";

export interface SolverOptions {
  readonly stateBudget?: number;
  readonly solutionLimit?: number;
  readonly requiredTerminalPairs?: readonly (readonly [string, string])[];
  readonly pathEdgeLimits?: readonly {
    readonly terminalIds: readonly [string, string];
    readonly maximumEdgeCount: number;
  }[];
  readonly solutionObserver?: (solution: Solution) => void;
  readonly useComponentParity?: boolean;
  readonly useFailureMemo?: boolean;
}

interface MutableMetrics {
  exploredStateCount: number;
  backtrackCount: number;
  maximumDecisionDepth: number;
  forcedMoveCount: number;
  decisionPointCount: number;
  pairingCountTried: number;
  residualReachabilityPruneCount: number;
  componentParityPruneCount: number;
  memoizedFailurePruneCount: number;
}

interface SearchContext {
  readonly puzzle: Puzzle;
  readonly terminalIndices: ReadonlySet<number>;
  readonly requiredPartnerByTerminalId: ReadonlyMap<string, string>;
  readonly pathEdgeLimitByPair: ReadonlyMap<string, number>;
  readonly solutionObserver: ((solution: Solution) => void) | null;
  readonly useComponentParity: boolean;
  readonly useFailureMemo: boolean;
  readonly solutionLimit: number;
  readonly stateBudget: number;
  readonly solutions: Map<string, Solution>;
  readonly failedStates: Set<string>;
  readonly metrics: MutableMetrics;
  budgetExhausted: boolean;
  stoppedAtLimit: boolean;
}

interface TerminalSelection {
  readonly terminal: Terminal;
  readonly partners: readonly Terminal[];
  readonly freeExitCount: number;
  readonly hasPathEdgeLimit: boolean;
}

export function solvePuzzle(puzzle: Puzzle, options: SolverOptions = {}): SolveResult {
  const validation = validatePuzzle(puzzle);
  if (!validation.valid) {
    throw new TypeError(validation.issues.map((issue) => issue.message).join("\n"));
  }
  const requiredPartnerByTerminalId = buildRequiredPartnerMap(
    puzzle,
    options.requiredTerminalPairs ?? [],
  );
  const pathEdgeLimitByPair = buildPathEdgeLimitMap(
    puzzle,
    options.pathEdgeLimits ?? [],
  );
  const context: SearchContext = {
    puzzle,
    terminalIndices: new Set(puzzle.terminals.map((terminal) => cellIndex(terminal, puzzle.width))),
    requiredPartnerByTerminalId,
    pathEdgeLimitByPair,
    solutionObserver: options.solutionObserver ?? null,
    useComponentParity: options.useComponentParity ?? true,
    useFailureMemo: options.useFailureMemo ?? true,
    solutionLimit: Math.max(1, Math.floor(options.solutionLimit ?? 2)),
    stateBudget: Math.max(1, Math.floor(options.stateBudget ?? 200_000)),
    solutions: new Map(),
    failedStates: new Set(),
    metrics: createMutableMetrics(),
    budgetExhausted: false,
    stoppedAtLimit: false,
  };

  searchTerminals(
    context,
    sortTerminals(puzzle.terminals, puzzle.width),
    0n,
    [],
    0,
  );

  const metrics = freezeMetrics(context.metrics);
  if (context.budgetExhausted) {
    return {
      status: "budget_exhausted",
      partialSolutionCount: context.solutions.size,
      metrics,
    };
  }
  const canonicalSolution = context.solutions.values().next().value as Solution | undefined;
  if (canonicalSolution === undefined) {
    return { status: "unsatisfiable", metrics };
  }
  return {
    status: "solved",
    canonicalSolution,
    solutionCount: context.stoppedAtLimit
      ? { kind: "at-least", count: context.solutions.size }
      : { kind: "exact", count: context.solutions.size },
    metrics,
  };
}

function searchTerminals(
  context: SearchContext,
  remainingTerminals: readonly Terminal[],
  occupied: bigint,
  paths: readonly PathSolution[],
  depth: number,
): boolean {
  if (shouldStop(context)) {
    return false;
  }
  context.metrics.maximumDecisionDepth = Math.max(
    context.metrics.maximumDecisionDepth,
    depth,
  );
  if (remainingTerminals.length === 0) {
    const solution = normalizeSolution({ paths }, context.puzzle.width);
    context.solutions.set(solutionHash(solution, context.puzzle.width), solution);
    context.solutionObserver?.(solution);
    if (context.solutions.size >= context.solutionLimit) {
      context.stoppedAtLimit = true;
    }
    return true;
  }

  const stateKey = searchStateKey(occupied, remainingTerminals);
  if (context.useFailureMemo && context.failedStates.has(stateKey)) {
    context.metrics.memoizedFailurePruneCount += 1;
    return false;
  }
  if (
    context.useComponentParity
    && !hasEvenSymbolParityInEveryComponent(
      context,
      remainingTerminals,
      occupied,
    )
  ) {
    context.metrics.componentParityPruneCount += 1;
    if (context.useFailureMemo) {
      context.failedStates.add(stateKey);
    }
    return false;
  }

  const selection = selectMostConstrainedTerminal(
    context,
    remainingTerminals,
    occupied,
  );
  if (selection === null || selection.partners.length === 0) {
    context.metrics.residualReachabilityPruneCount += 1;
    context.metrics.backtrackCount += 1;
    if (context.useFailureMemo) {
      context.failedStates.add(stateKey);
    }
    return false;
  }

  let found = false;
  for (const partner of selection.partners) {
    if (shouldStop(context)) {
      break;
    }
    context.metrics.pairingCountTried += 1;
    const nextRemaining = remainingTerminals.filter((terminal) => (
      terminal.terminalId !== selection.terminal.terminalId
      && terminal.terminalId !== partner.terminalId
    ));
    found = enumeratePaths(
      context,
      selection.terminal,
      partner,
      nextRemaining,
      occupied,
      paths,
      depth,
    ) || found;
  }
  if (!found && !shouldStop(context) && context.useFailureMemo) {
    context.failedStates.add(stateKey);
  }
  return found;
}

function selectMostConstrainedTerminal(
  context: SearchContext,
  terminals: readonly Terminal[],
  occupied: bigint,
): TerminalSelection | null {
  let selected: TerminalSelection | null = null;
  for (const terminal of terminals) {
    const requiredPartnerId = context.requiredPartnerByTerminalId.get(
      terminal.terminalId,
    );
    const partners = listSameSymbolPartners(terminal, terminals)
      .filter((candidate) => (
        requiredPartnerId === undefined
        || candidate.terminalId === requiredPartnerId
      ))
      .filter((candidate) => isReachable({
        width: context.puzzle.width,
        height: context.puzzle.height,
        occupied,
        terminalIndices: context.terminalIndices,
      }, cellIndex(terminal, context.puzzle.width), cellIndex(candidate, context.puzzle.width)));
    const freeExitCount = adjacentIndices(
      cellIndex(terminal, context.puzzle.width),
      context.puzzle.width,
      context.puzzle.height,
    ).filter((index) => !isBitSet(occupied, index)).length;
    const hasPathEdgeLimit = partners.some((partner) => (
      context.pathEdgeLimitByPair.has(terminalPairKey(
        terminal.terminalId,
        partner.terminalId,
      ))
    ));
    const candidate = {
      terminal,
      partners,
      freeExitCount,
      hasPathEdgeLimit,
    };
    if (
      selected === null
      || (candidate.hasPathEdgeLimit && !selected.hasPathEdgeLimit)
      || (
        candidate.hasPathEdgeLimit === selected.hasPathEdgeLimit
        && candidate.partners.length < selected.partners.length
      )
      || (
        candidate.hasPathEdgeLimit === selected.hasPathEdgeLimit
        && candidate.partners.length === selected.partners.length
        && candidate.freeExitCount < selected.freeExitCount
      )
      || (
        candidate.hasPathEdgeLimit === selected.hasPathEdgeLimit
        && candidate.partners.length === selected.partners.length
        && candidate.freeExitCount === selected.freeExitCount
        && candidate.terminal.terminalId.localeCompare(
          selected.terminal.terminalId,
        ) < 0
      )
    ) {
      selected = candidate;
    }
  }
  return selected;
}

function enumeratePaths(
  context: SearchContext,
  first: Terminal,
  second: Terminal,
  remainingTerminals: readonly Terminal[],
  occupied: bigint,
  completedPaths: readonly PathSolution[],
  depth: number,
): boolean {
  const startIndex = cellIndex(first, context.puzzle.width);
  const targetIndex = cellIndex(second, context.puzzle.width);
  const maximumEdgeCount = context.pathEdgeLimitByPair.get(
    terminalPairKey(first.terminalId, second.terminalId),
  ) ?? Number.POSITIVE_INFINITY;
  const initialVisited = setBit(0n, startIndex);
  let found = false;
  walk(startIndex, initialVisited, [startIndex]);
  return found;

  function walk(
    currentIndex: number,
    visited: bigint,
    path: readonly number[],
  ): void {
    if (shouldStop(context)) {
      return;
    }
    context.metrics.exploredStateCount += 1;
    if (context.metrics.exploredStateCount > context.stateBudget) {
      context.budgetExhausted = true;
      return;
    }
    if (currentIndex === targetIndex) {
      const nextOccupied = occupied | visited;
      found = searchTerminals(
        context,
        remainingTerminals,
        nextOccupied,
        [...completedPaths, {
          symbol: first.symbol,
          cells: path.map((index) => indexToCell(index, context.puzzle.width)),
        }],
        depth + 1,
      ) || found;
      return;
    }
    if (path.length - 1 >= maximumEdgeCount) {
      context.metrics.backtrackCount += 1;
      return;
    }

    const candidates = adjacentIndices(
      currentIndex,
      context.puzzle.width,
      context.puzzle.height,
    )
      .filter((nextIndex) => canEnter(
        context,
        nextIndex,
        targetIndex,
        occupied,
        visited,
      ))
      .toSorted((left, right) => (
        distanceToTarget(left, targetIndex, context.puzzle.width)
          - distanceToTarget(right, targetIndex, context.puzzle.width)
        || left - right
      ));

    if (candidates.length === 1) {
      context.metrics.forcedMoveCount += 1;
    } else if (candidates.length > 1) {
      context.metrics.decisionPointCount += 1;
    } else {
      context.metrics.backtrackCount += 1;
    }

    for (const nextIndex of candidates) {
      const nextVisited = setBit(visited, nextIndex);
      const nextOccupied = occupied | nextVisited;
      if (
        nextIndex !== targetIndex
        && path.length % 3 === 0
        && !remainingTerminalsHaveReachablePartners(
          context,
          remainingTerminals,
          nextOccupied,
        )
      ) {
        context.metrics.residualReachabilityPruneCount += 1;
        context.metrics.backtrackCount += 1;
        continue;
      }
      walk(nextIndex, nextVisited, [...path, nextIndex]);
      if (shouldStop(context)) {
        return;
      }
      context.metrics.backtrackCount += 1;
    }
  }
}

function remainingTerminalsHaveReachablePartners(
  context: SearchContext,
  terminals: readonly Terminal[],
  occupied: bigint,
): boolean {
  return terminals.every((terminal) => {
    const requiredPartnerId = context.requiredPartnerByTerminalId.get(
      terminal.terminalId,
    );
    return terminals.some((candidate) => (
      candidate.terminalId !== terminal.terminalId
      && candidate.symbol === terminal.symbol
      && (requiredPartnerId === undefined || candidate.terminalId === requiredPartnerId)
      && isReachable({
        width: context.puzzle.width,
        height: context.puzzle.height,
        occupied,
        terminalIndices: context.terminalIndices,
      }, cellIndex(terminal, context.puzzle.width), cellIndex(candidate, context.puzzle.width))
    ));
  });
}

function hasEvenSymbolParityInEveryComponent(
  context: SearchContext,
  terminals: readonly Terminal[],
  occupied: bigint,
): boolean {
  const componentByIndex = new Int16Array(
    context.puzzle.width * context.puzzle.height,
  );
  componentByIndex.fill(-1);
  let component = 0;
  for (let index = 0; index < componentByIndex.length; index += 1) {
    if (componentByIndex[index] !== -1 || isBitSet(occupied, index)) {
      continue;
    }
    const queue = [index];
    componentByIndex[index] = component;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      if (current === undefined) {
        continue;
      }
      for (const neighbor of adjacentIndices(
        current,
        context.puzzle.width,
        context.puzzle.height,
      )) {
        if (
          componentByIndex[neighbor] === -1
          && !isBitSet(occupied, neighbor)
        ) {
          componentByIndex[neighbor] = component;
          queue.push(neighbor);
        }
      }
    }
    component += 1;
  }
  const counts = new Map<string, number>();
  for (const terminal of terminals) {
    const index = cellIndex(terminal, context.puzzle.width);
    const componentId = componentByIndex[index];
    const key = `${componentId}:${terminal.symbol}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].every((count) => count % 2 === 0);
}

function canEnter(
  context: SearchContext,
  index: number,
  targetIndex: number,
  occupied: bigint,
  visited: bigint,
): boolean {
  if (isBitSet(occupied, index) || isBitSet(visited, index)) {
    return false;
  }
  return index === targetIndex || !context.terminalIndices.has(index);
}

function distanceToTarget(
  index: number,
  targetIndex: number,
  width: number,
): number {
  return manhattanDistance(
    indexToCell(index, width),
    indexToCell(targetIndex, width),
  );
}

function searchStateKey(
  occupied: bigint,
  remainingTerminals: readonly Terminal[],
): string {
  return `${occupied.toString(16)}|${remainingTerminals
    .map((terminal) => terminal.terminalId)
    .toSorted()
    .join(",")}`;
}

function sortTerminals(
  terminals: readonly Terminal[],
  width: number,
): readonly Terminal[] {
  return terminals.toSorted((left, right) => (
    cellIndex(left, width) - cellIndex(right, width)
    || left.terminalId.localeCompare(right.terminalId)
  ));
}

function buildRequiredPartnerMap(
  puzzle: Puzzle,
  pairs: readonly (readonly [string, string])[],
): ReadonlyMap<string, string> {
  const terminalById = new Map(
    puzzle.terminals.map((terminal) => [terminal.terminalId, terminal] as const),
  );
  const result = new Map<string, string>();
  for (const [firstId, secondId] of pairs) {
    const first = terminalById.get(firstId);
    const second = terminalById.get(secondId);
    if (first === undefined || second === undefined) {
      throw new TypeError("required terminal pair contains an unknown terminal");
    }
    if (first.symbol !== second.symbol || firstId === secondId) {
      throw new TypeError("required terminal pair must contain two terminals of one symbol");
    }
    if (result.has(firstId) || result.has(secondId)) {
      throw new TypeError("required terminal pair reuses a terminal");
    }
    result.set(firstId, secondId);
    result.set(secondId, firstId);
  }
  return result;
}

function buildPathEdgeLimitMap(
  puzzle: Puzzle,
  limits: readonly {
    readonly terminalIds: readonly [string, string];
    readonly maximumEdgeCount: number;
  }[],
): ReadonlyMap<string, number> {
  const terminalById = new Map(
    puzzle.terminals.map((terminal) => [terminal.terminalId, terminal] as const),
  );
  const result = new Map<string, number>();
  for (const { terminalIds: [firstId, secondId], maximumEdgeCount } of limits) {
    const first = terminalById.get(firstId);
    const second = terminalById.get(secondId);
    if (first === undefined || second === undefined) {
      throw new TypeError("path edge limit contains an unknown terminal");
    }
    if (first.symbol !== second.symbol || firstId === secondId) {
      throw new TypeError(
        "path edge limit must contain two terminals of one symbol",
      );
    }
    if (!Number.isInteger(maximumEdgeCount) || maximumEdgeCount < 1) {
      throw new TypeError("path edge limit must be a positive integer");
    }
    const key = terminalPairKey(firstId, secondId);
    if (result.has(key)) {
      throw new TypeError("path edge limit duplicates a terminal pair");
    }
    result.set(key, maximumEdgeCount);
  }
  return result;
}

function terminalPairKey(first: string, second: string): string {
  return first.localeCompare(second) <= 0
    ? `${first}|${second}`
    : `${second}|${first}`;
}

function shouldStop(context: SearchContext): boolean {
  return context.budgetExhausted || context.stoppedAtLimit;
}

function createMutableMetrics(): MutableMetrics {
  return {
    exploredStateCount: 0,
    backtrackCount: 0,
    maximumDecisionDepth: 0,
    forcedMoveCount: 0,
    decisionPointCount: 0,
    pairingCountTried: 0,
    residualReachabilityPruneCount: 0,
    componentParityPruneCount: 0,
    memoizedFailurePruneCount: 0,
  };
}

function freezeMetrics(metrics: MutableMetrics): SolverMetrics {
  return { ...metrics };
}
