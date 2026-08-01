/**
 * 解答経路、Solution、solver結果、探索計測値、形状costの型を定義する。
 *
 * 型だけでは解の有効性を保証せず、validation moduleによる検査を前提とする。
 *
 * @packageDocumentation
 */

import type {Cell, SymbolId} from './puzzle.ts';

/**
 * 同じ記号の二端点を結ぶ、向きを持つセル列。
 *
 * 有効性は`validateSolution`で検査し、この型だけでは保証しない。
 */
export interface PathSolution {
  readonly symbol: SymbolId;
  readonly cells: readonly Cell[];
}

/**
 * 全端点を結ぶ経路集合。
 *
 * 経路の列挙順と各経路の向きは、解の同一性へ影響しない。
 */
export interface Solution {
  readonly paths: readonly PathSolution[];
}

/** 盤面のうち解答経路が使用するセル数と比率。 */
export interface SolutionCoverage {
  readonly usedCellCount: number;
  readonly unusedCellCount: number;
  readonly totalCellCount: number;
  readonly coverageRatio: number;
}

/**
 * optimizerが辞書式に比較する解のcost。
 *
 * 比較順は総辺数、一マスU字、総曲がり、正規化hashである。
 */
export interface SolutionCost {
  readonly totalEdgeCount: number;
  readonly unitBayCount: number;
  readonly totalTurnCount: number;
  readonly normalizedSolutionHash: string;
}

/** 一本の経路について品質gateが参照する形状値。 */
export interface PathGeometryAnalysis {
  readonly edgeCount: number;
}

/** 曲がりがない経路を、盤面上の向き別に数えた形状値。 */
export interface StraightPathCounts {
  readonly horizontalStraightPathCount: number;
  readonly verticalStraightPathCount: number;
}

/** canonical solution全体の経路形状と未使用セルの機械分析。 */
export interface SolutionGeometryAnalysis {
  readonly totalEdgeCount: number;
  readonly totalTurnCount: number;
  readonly unexplainedUnitBayCount: number;
  readonly unusedComponentCount: number;
  readonly isolatedUnusedCellCount: number;
  readonly paths: readonly PathGeometryAnalysis[];
}

/**
 * 探索で判明した正規化解数。
 *
 * `exact`は探索木を完走した値、`at-least`は`solutionLimit`で打ち切った
 * 下限である。どちらも探索予算超過を表さない。
 */
export type SolutionCount =
  | {readonly kind: 'exact'; readonly count: number}
  | {readonly kind: 'at-least'; readonly count: number};

/** 独立solverの探索量とsoundな枝刈りの適用回数。 */
export interface SolverMetrics {
  readonly exploredStateCount: number;
  readonly backtrackCount: number;
  readonly maximumDecisionDepth: number;
  readonly pairingCountTried: number;
  readonly residualReachabilityPruneCount: number;
  readonly componentParityPruneCount: number;
  readonly memoizedFailurePruneCount: number;
}

/**
 * 独立solverの探索結果。
 *
 * `solved`でも`solutionCount.kind`が`at-least`なら唯一解証明ではない。
 * `budget_exhausted`は、解なしにも唯一解にも読み替えてはならない。
 */
export type SolveResult =
  | {
      readonly status: 'solved';
      readonly canonicalSolution: Solution;
      readonly solutionCount: SolutionCount;
      readonly metrics: SolverMetrics;
    }
  | {
      readonly status: 'unsatisfiable';
      readonly metrics: SolverMetrics;
    }
  | {
      readonly status: 'budget_exhausted';
      readonly partialSolutionCount: number;
      readonly metrics: SolverMetrics;
    };

/**
 * cost最小化solverの探索結果。
 *
 * `optimal`だけが探索木を完走した最適性証明である。予算超過時の
 * `incumbent`は既知の最良解であり、最適とは限らない。
 */
export type OptimizeSolutionResult =
  | {
      readonly status: 'optimal';
      readonly solution: Solution;
      readonly cost: SolutionCost;
      readonly exploredStateCount: number;
    }
  | {
      readonly status: 'unsatisfiable';
      readonly exploredStateCount: number;
    }
  | {
      readonly status: 'budget_exhausted';
      readonly incumbent: Solution;
      readonly incumbentCost: SolutionCost;
      readonly lowerBound: number;
      readonly exploredStateCount: number;
    };
