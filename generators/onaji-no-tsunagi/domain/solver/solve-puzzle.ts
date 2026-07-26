/**
 * Puzzleの端点情報だけから、partner選択を含む全ての有効解を探索する。
 *
 * 解数のexact/at-leastと探索予算超過を区別し、唯一解主張の証拠を提供する。
 *
 * @packageDocumentation
 */

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
import {
  listSameSymbolPartners,
  terminalPairKey,
} from "./enumerate-pairings.ts";
import { normalizeSolution, solutionHash } from "./normalize-solution.ts";
import { isBitSet, isReachable, setBit } from "./residual-reachability.ts";
import {
  allTerminalsHaveReachablePartners,
  canEnterPathCell,
  createTerminalIndexSet,
  hasEvenSymbolParityInEveryComponent,
  sortTerminals,
  terminalSearchStateKey,
} from "./search-grid.ts";

/**
 * 独立solverの探索上限、補助制約、枝刈り設定。
 *
 * `requiredTerminalPairs`と`pathEdgeLimits`は反例・補助検査用に問題を狭める。
 * generatorの唯一性証明では指定せず、端点だけから全partnerと全経路を調べる。
 */
export interface SolverOptions {
  /** 探索状態の上限。超過時は`budget_exhausted`を返す。 */
  readonly stateBudget?: number;
  /**
   * 正規化した異なる解をこの数だけ見つけたら打ち切る。
   * 打ち切り時の解数は`at-least`になる。
   */
  readonly solutionLimit?: number;
  /** 指定した端点pair以外を認めない補助制約。 */
  readonly requiredTerminalPairs?: readonly (readonly [string, string])[];
  /** 指定した端点pairに許す最大辺数。 */
  readonly pathEdgeLimits?: readonly {
    readonly terminalIds: readonly [string, string];
    readonly maximumEdgeCount: number;
  }[];
  /** 新しい正規化解を見つけるたびに呼ぶ診断用callback。 */
  readonly solutionObserver?: (solution: Solution) => void;
  /** 連結成分ごとの記号偶奇によるsoundな枝刈り。既定値は`true`。 */
  readonly useComponentParity?: boolean;
  /** 解へ到達しなかった状態のmemo化。既定値は`true`。 */
  readonly useFailureMemo?: boolean;
}

interface MutableMetrics {
  exploredStateCount: number;
  backtrackCount: number;
  maximumDecisionDepth: number;
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

/**
 * 端点だけのPuzzleから、partnerの組み方を含む全ての有効解を探索する。
 *
 * @remarks
 * 経路の向きと列挙順だけが異なる解は正規化して一つと数える。
 * `solutionLimit`で打ち切った`at-least`と、探索木を完走した`exact`を区別する。
 * `budget_exhausted`は解なしや唯一解の証明ではない。
 *
 * @throws `TypeError`
 * Puzzle、指定pair、または辺数制約が不正な場合。
 */
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
    terminalIndices: createTerminalIndexSet(puzzle),
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

  const stateKey = terminalSearchStateKey(occupied, remainingTerminals);
  if (context.useFailureMemo && context.failedStates.has(stateKey)) {
    context.metrics.memoizedFailurePruneCount += 1;
    return false;
  }
  if (
    context.useComponentParity
    && !hasEvenSymbolParityInEveryComponent(
      context.puzzle,
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
      .filter((nextIndex) => canEnterPathCell(
        context.terminalIndices,
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

    if (candidates.length === 0) {
      context.metrics.backtrackCount += 1;
    }

    for (const nextIndex of candidates) {
      const nextVisited = setBit(visited, nextIndex);
      const nextOccupied = occupied | nextVisited;
      if (
        nextIndex !== targetIndex
        && path.length % 3 === 0
        && !allTerminalsHaveReachablePartners(
          context.puzzle,
          context.terminalIndices,
          remainingTerminals,
          nextOccupied,
          context.requiredPartnerByTerminalId,
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

function shouldStop(context: SearchContext): boolean {
  return context.budgetExhausted || context.stoppedAtLimit;
}

function createMutableMetrics(): MutableMetrics {
  return {
    exploredStateCount: 0,
    backtrackCount: 0,
    maximumDecisionDepth: 0,
    pairingCountTried: 0,
    residualReachabilityPruneCount: 0,
    componentParityPruneCount: 0,
    memoizedFailurePruneCount: 0,
  };
}

function freezeMetrics(metrics: MutableMetrics): SolverMetrics {
  return { ...metrics };
}
