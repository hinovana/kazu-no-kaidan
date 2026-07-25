export type DifficultyLevel = 1 | 2 | 3 | 4;

export interface DifficultyAnalysis {
  readonly analyzerVersion: "onaji-no-tsunagi-difficulty.v3.3";
  readonly requestedLevel: DifficultyLevel;
  readonly measuredBand: DifficultyLevel;
  readonly exploredStateCount: number;
  readonly backtrackCount: number;
  readonly maximumDecisionDepth: number;
  readonly forcedMoveRatio: number;
  readonly pairingChoiceCount: number;
  readonly bottleneckInteractionCount: number;
  readonly nearestPairTrap: boolean;
  readonly residualReachabilityPruneCount: number;
  readonly entryClarity: "clear" | "unclear";
  readonly naturalHypothesisCount: number;
  readonly interactionWitnessCount: number;
  readonly requiredPairingRevision: boolean;
  readonly requiredShortestPathRevision: boolean;
  readonly contradictionDepth: number;
  readonly revisionChainLength: number;
}
