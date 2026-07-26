export type DifficultyLevel = 1 | 2 | 3 | 4;

export interface DifficultyAnalysis {
  readonly analyzerVersion:
    | "onaji-no-tsunagi-difficulty.v3.3"
    | "onaji-no-tsunagi-difficulty.v3.4-draft";
  readonly requestedLevel: DifficultyLevel;
  readonly measuredBand: DifficultyLevel;
  readonly exploredStateCount: number;
  readonly backtrackCount: number;
  readonly maximumDecisionDepth: number;
  readonly pairingChoiceCount: number;
  readonly residualReachabilityPruneCount: number;
  readonly componentParityPruneCount: number;
  readonly memoizedFailurePruneCount: number;
}
