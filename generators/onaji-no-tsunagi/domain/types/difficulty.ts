/**
 * 問題構造から求める難易度レベルと、その分析根拠の型を定義する。
 *
 * 児童利用による校正済み難易度を表す型ではない。
 *
 * @packageDocumentation
 */

/**
 * 画面へ表示する構造帯。児童データで校正された体感難易度ではない。
 */
export type DifficultyLevel = 1 | 2 | 3 | 4;

/**
 * 問題の構造帯と、独立solverが記録した探索量の診断値。
 *
 * @remarks
 * 探索状態数や枝刈り回数を、そのまま児童の難易度や学習効果へ換算しては
 * ならない。
 */
export interface DifficultyAnalysis {
  readonly analyzerVersion:
    | "onaji-no-tsunagi-difficulty.v3.3"
    | "onaji-no-tsunagi-difficulty.v3.4-draft";
  /** 利用者が生成条件として指定した構造帯。 */
  readonly requestedLevel: DifficultyLevel;
  /** 盤面profileから決定した未校正の構造帯。 */
  readonly measuredBand: DifficultyLevel;
  readonly exploredStateCount: number;
  readonly backtrackCount: number;
  readonly maximumDecisionDepth: number;
  readonly pairingChoiceCount: number;
  readonly residualReachabilityPruneCount: number;
  readonly componentParityPruneCount: number;
  readonly memoizedFailurePruneCount: number;
}
