import type { Cell, SymbolId } from "./puzzle.ts";

export interface PathSolution {
  readonly symbol: SymbolId;
  readonly cells: readonly Cell[];
}

export interface Solution {
  readonly paths: readonly PathSolution[];
}

export interface SolutionCoverage {
  readonly usedCellCount: number;
  readonly unusedCellCount: number;
  readonly totalCellCount: number;
  readonly coverageRatio: number;
}

export interface SolutionCost {
  readonly totalEdgeCount: number;
  readonly unitBayCount: number;
  readonly totalTurnCount: number;
  readonly normalizedSolutionHash: string;
}

export interface PathGeometryAnalysis {
  readonly edgeCount: number;
}

export interface SolutionGeometryAnalysis {
  readonly totalEdgeCount: number;
  readonly totalTurnCount: number;
  readonly unexplainedUnitBayCount: number;
  readonly unusedComponentCount: number;
  readonly isolatedUnusedCellCount: number;
  readonly paths: readonly PathGeometryAnalysis[];
}

export type SolutionCount =
  | { readonly kind: "exact"; readonly count: number }
  | { readonly kind: "at-least"; readonly count: number };

export interface SolverMetrics {
  readonly exploredStateCount: number;
  readonly backtrackCount: number;
  readonly maximumDecisionDepth: number;
  readonly pairingCountTried: number;
  readonly residualReachabilityPruneCount: number;
  readonly componentParityPruneCount: number;
  readonly memoizedFailurePruneCount: number;
}

export type SolveResult =
  | {
      readonly status: "solved";
      readonly canonicalSolution: Solution;
      readonly solutionCount: SolutionCount;
      readonly metrics: SolverMetrics;
    }
  | {
      readonly status: "unsatisfiable";
      readonly metrics: SolverMetrics;
    }
  | {
      readonly status: "budget_exhausted";
      readonly partialSolutionCount: number;
      readonly metrics: SolverMetrics;
    };

export type OptimizeSolutionResult =
  | {
      readonly status: "optimal";
      readonly solution: Solution;
      readonly cost: SolutionCost;
      readonly exploredStateCount: number;
    }
  | {
      readonly status: "unsatisfiable";
      readonly exploredStateCount: number;
    }
  | {
      readonly status: "budget_exhausted";
      readonly incumbent: Solution;
      readonly incumbentCost: SolutionCost;
      readonly lowerBound: number;
      readonly exploredStateCount: number;
    };
