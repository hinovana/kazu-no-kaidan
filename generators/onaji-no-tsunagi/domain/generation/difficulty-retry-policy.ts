/**
 * 原本基準分類の連続棄却数を、候補生成のほかの棄却理由と分離して管理する。
 *
 * @packageDocumentation
 */

import type {
  DifficultyClassification,
  DifficultyRejectedCandidate,
} from '../types/generation.ts';

/** 一問分の「明らかに簡単側」連続候補を保持する状態。 */
export interface DifficultyRetryState {
  readonly consecutiveClearlyEasierCandidates: readonly DifficultyRejectedCandidate[];
}

/** 分類まで完了した一候補の観測値。 */
export interface DifficultyRetryObservation {
  readonly classification: DifficultyClassification;
  readonly rejectedCandidate?: DifficultyRejectedCandidate;
}

/** 新しい一問の連続棄却状態を作る。 */
export function createDifficultyRetryState(): DifficultyRetryState {
  return {consecutiveClearlyEasierCandidates: []};
}

/**
 * 分類済み候補を記録し、連続する「明らかに簡単側」の候補だけを保持する。
 *
 * 分類前に別gateで棄却された候補は呼び出し側から渡さない。簡単側以外の
 * 分類済み候補を観測すると連続数を0へ戻す。
 */
export function observeDifficultyRetryCandidate(
  state: DifficultyRetryState,
  observation: DifficultyRetryObservation,
): DifficultyRetryState {
  if (observation.classification !== 'clearly_easier') {
    return createDifficultyRetryState();
  }
  if (observation.rejectedCandidate === undefined) {
    throw new TypeError('clearly easier candidate requires a review record');
  }
  return {
    consecutiveClearlyEasierCandidates: [
      ...state.consecutiveClearlyEasierCandidates,
      observation.rejectedCandidate,
    ],
  };
}
