/**
 * solution-first構成で利用する盤面profileと、Worksheet内でのprofile選択規則を管理する。
 *
 * 数値gateはコーパスで固定された版付き設定であり、経路探索の実装から分離して
 * レビュー時に仕様との対応を確認しやすくする。
 *
 * @packageDocumentation
 */

import type {AvailableDifficultyLevel} from '../types/generation.ts';
import type {
  TerminalMultiplicityPattern,
  UniquePathCoverProfileId,
} from '../types/puzzle.ts';
import {createSeededRandom} from './random.ts';

/** profileごとに切り替える、版・seed・記号割当・cover再利用の方針。 */
export interface UniquePathCoverGenerationPolicy {
  readonly versionTrack: 'v3.3-stable' | 'v3.4-draft';
  readonly candidateSeedStrategy:
    'legacy-terminal-pattern' | 'profile-with-symbol-variant';
  readonly symbolAssignmentStrategy:
    'legacy-seeded-shuffle' | 'enumerated-route-variants';
  readonly reuseRouteCoverAcrossSymbolAssignments: boolean;
}

/**
 * solution-first構成と後段の品質検査で共有する、版付き盤面profile。
 *
 * 状態数と形状の上限はprofile別コーパスで固定し、同じversionのまま
 * 黙って緩和しない。
 */
export interface UniquePathCoverProfile {
  readonly profileId: UniquePathCoverProfileId;
  readonly generationPolicy: UniquePathCoverGenerationPolicy;
  readonly width: number;
  readonly height: number;
  readonly terminalPattern: TerminalMultiplicityPattern;
  readonly terminalCount: number;
  readonly symbolPathCounts: readonly [number, number, number];
  readonly pathCount: number;
  readonly pathLengthProfiles: readonly (readonly number[])[];
  readonly maximumPathTurnCount: number;
  readonly minimumUsedCellCount: number;
  readonly maximumUsedCellCount: number;
  readonly maximumTotalTurnCount: number;
  readonly minimumForcedExitCount: number;
  readonly maximumForcedExitCount: number;
  readonly maximumLineConcentration: number;
  readonly maximumCandidateCount: number;
  readonly maximumConstructionStates: number;
  readonly maximumValidityStates: number;
  readonly maximumProofStates: number;
}

const FIVE_BY_FIVE_GENERATION_POLICY = {
  versionTrack: 'v3.3-stable',
  candidateSeedStrategy: 'legacy-terminal-pattern',
  symbolAssignmentStrategy: 'legacy-seeded-shuffle',
  reuseRouteCoverAcrossSymbolAssignments: false,
} as const satisfies UniquePathCoverGenerationPolicy;

const SIX_BY_SIX_GENERATION_POLICY = {
  versionTrack: 'v3.4-draft',
  candidateSeedStrategy: 'profile-with-symbol-variant',
  symbolAssignmentStrategy: 'enumerated-route-variants',
  reuseRouteCoverAcrossSymbolAssignments: true,
} as const satisfies UniquePathCoverGenerationPolicy;

const FIVE_BY_FIVE_PROFILES = {
  '5x5-2-2-2': {
    profileId: '5x5-2-2-2',
    generationPolicy: FIVE_BY_FIVE_GENERATION_POLICY,
    width: 5,
    height: 5,
    terminalPattern: '2-2-2',
    terminalCount: 6,
    pathCount: 3,
    symbolPathCounts: [1, 1, 1],
    pathLengthProfiles: [
      [13, 8, 4],
      [12, 8, 5],
      [13, 7, 5],
      [12, 7, 6],
      [11, 9, 5],
      [10, 9, 6],
      [14, 7, 4],
      [13, 6, 6],
    ],
    maximumPathTurnCount: 4,
    minimumUsedCellCount: 25,
    maximumUsedCellCount: 25,
    maximumTotalTurnCount: 8,
    minimumForcedExitCount: 1,
    maximumForcedExitCount: 4,
    maximumLineConcentration: 3,
    maximumCandidateCount: 30_000,
    maximumConstructionStates: 4_000,
    maximumValidityStates: 500_000,
    maximumProofStates: 500_000,
  },
  '5x5-4-2-2': {
    profileId: '5x5-4-2-2',
    generationPolicy: FIVE_BY_FIVE_GENERATION_POLICY,
    width: 5,
    height: 5,
    terminalPattern: '4-2-2',
    terminalCount: 8,
    pathCount: 4,
    symbolPathCounts: [2, 1, 1],
    pathLengthProfiles: [
      [10, 7, 5, 3],
      [9, 7, 5, 4],
      [8, 7, 6, 4],
      [9, 6, 6, 4],
      [8, 6, 6, 5],
      [10, 6, 5, 4],
    ],
    maximumPathTurnCount: 4,
    minimumUsedCellCount: 25,
    maximumUsedCellCount: 25,
    maximumTotalTurnCount: 9,
    minimumForcedExitCount: 1,
    maximumForcedExitCount: 5,
    maximumLineConcentration: 3,
    maximumCandidateCount: 30_000,
    maximumConstructionStates: 4_000,
    maximumValidityStates: 500_000,
    maximumProofStates: 500_000,
  },
  '5x5-4-4-2': {
    profileId: '5x5-4-4-2',
    generationPolicy: FIVE_BY_FIVE_GENERATION_POLICY,
    width: 5,
    height: 5,
    terminalPattern: '4-4-2',
    terminalCount: 10,
    pathCount: 5,
    symbolPathCounts: [2, 2, 1],
    pathLengthProfiles: [
      [7, 6, 5, 4, 3],
      [8, 5, 5, 4, 3],
      [7, 5, 5, 4, 4],
      [6, 6, 5, 5, 3],
      [6, 5, 5, 5, 4],
    ],
    maximumPathTurnCount: 4,
    minimumUsedCellCount: 25,
    maximumUsedCellCount: 25,
    maximumTotalTurnCount: 10,
    minimumForcedExitCount: 1,
    maximumForcedExitCount: 6,
    maximumLineConcentration: 4,
    maximumCandidateCount: 30_000,
    maximumConstructionStates: 4_000,
    maximumValidityStates: 500_000,
    maximumProofStates: 500_000,
  },
} as const satisfies Readonly<Record<string, UniquePathCoverProfile>>;

const SIX_BY_SIX_PROFILES = {
  '6x6-4-4-2': {
    profileId: '6x6-4-4-2',
    generationPolicy: SIX_BY_SIX_GENERATION_POLICY,
    width: 6,
    height: 6,
    terminalPattern: '4-4-2',
    terminalCount: 10,
    pathCount: 5,
    symbolPathCounts: [2, 2, 1],
    pathLengthProfiles: [
      [10, 8, 7, 6, 5],
      [9, 8, 7, 6, 6],
      [9, 9, 7, 6, 5],
      [8, 8, 7, 7, 6],
    ],
    maximumPathTurnCount: 4,
    minimumUsedCellCount: 36,
    maximumUsedCellCount: 36,
    maximumTotalTurnCount: 14,
    minimumForcedExitCount: 1,
    maximumForcedExitCount: 6,
    maximumLineConcentration: 5,
    maximumCandidateCount: 10_000,
    maximumConstructionStates: 30_000,
    maximumValidityStates: 50_000,
    maximumProofStates: 50_000,
  },
  '6x6-4-4-4': {
    profileId: '6x6-4-4-4',
    generationPolicy: SIX_BY_SIX_GENERATION_POLICY,
    width: 6,
    height: 6,
    terminalPattern: '4-4-4',
    terminalCount: 12,
    pathCount: 6,
    symbolPathCounts: [2, 2, 2],
    pathLengthProfiles: [
      [8, 7, 6, 6, 5, 4],
      [7, 7, 6, 6, 5, 5],
      [8, 6, 6, 6, 5, 5],
      [7, 7, 7, 5, 5, 5],
    ],
    maximumPathTurnCount: 4,
    minimumUsedCellCount: 36,
    maximumUsedCellCount: 36,
    maximumTotalTurnCount: 15,
    minimumForcedExitCount: 1,
    maximumForcedExitCount: 10,
    maximumLineConcentration: 6,
    maximumCandidateCount: 10_000,
    maximumConstructionStates: 30_000,
    maximumValidityStates: 30_000,
    maximumProofStates: 30_000,
  },
  '6x6-6-4-4': {
    profileId: '6x6-6-4-4',
    generationPolicy: SIX_BY_SIX_GENERATION_POLICY,
    width: 6,
    height: 6,
    terminalPattern: '6-4-4',
    terminalCount: 14,
    pathCount: 7,
    symbolPathCounts: [3, 2, 2],
    pathLengthProfiles: [
      [7, 6, 5, 5, 5, 4, 4],
      [6, 6, 6, 5, 5, 4, 4],
      [6, 5, 5, 5, 5, 5, 5],
      [7, 5, 5, 5, 5, 5, 4],
    ],
    maximumPathTurnCount: 4,
    minimumUsedCellCount: 36,
    maximumUsedCellCount: 36,
    maximumTotalTurnCount: 16,
    minimumForcedExitCount: 1,
    maximumForcedExitCount: 10,
    maximumLineConcentration: 6,
    maximumCandidateCount: 10_000,
    maximumConstructionStates: 30_000,
    maximumValidityStates: 10_000,
    maximumProofStates: 10_000,
  },
} as const satisfies Readonly<Record<string, UniquePathCoverProfile>>;

const UNIQUE_PATH_COVER_PROFILES = {
  ...FIVE_BY_FIVE_PROFILES,
  ...SIX_BY_SIX_PROFILES,
} as const satisfies Readonly<
  Record<UniquePathCoverProfileId, UniquePathCoverProfile>
>;

const FIVE_BY_FIVE_PROFILE_SEQUENCES: Readonly<
  Record<number, readonly UniquePathCoverProfileId[]>
> = {
  2: ['5x5-4-2-2', '5x5-4-4-2'],
  3: ['5x5-2-2-2', '5x5-4-2-2', '5x5-4-4-2'],
  4: ['5x5-2-2-2', '5x5-4-2-2', '5x5-4-2-2', '5x5-4-4-2'],
};

const SIX_BY_SIX_LEVEL_TWO_PROFILE_SEQUENCES: Readonly<
  Record<number, readonly UniquePathCoverProfileId[]>
> = {
  2: ['6x6-4-4-2', '6x6-4-4-4'],
  3: ['6x6-4-4-2', '6x6-4-4-4', '6x6-4-4-4'],
  4: ['6x6-4-4-2', '6x6-4-4-4', '6x6-4-4-2', '6x6-4-4-4'],
};

const SINGLE_FIVE_BY_FIVE_PROFILE_CHOICES: readonly UniquePathCoverProfileId[] =
  ['5x5-2-2-2', '5x5-4-2-2', '5x5-4-4-2'];

/**
 * profile IDに対応する読取専用の構成・品質gateを返す。
 *
 * @internal
 */
export function findUniquePathCoverProfile(
  profileId: UniquePathCoverProfileId,
): UniquePathCoverProfile {
  return UNIQUE_PATH_COVER_PROFILES[profileId];
}

/**
 * 難易度、Worksheet内の位置、問題数、request seedからprofileを決定する。
 *
 * @remarks
 * 複数問では仕様で固定した並びを使い、一問だけの場合にseedで候補を選ぶ。
 *
 * @throws `RangeError`
 * `puzzleIndex`がWorksheet範囲外、または未対応の条件の場合。
 *
 * @internal
 */
export function chooseUniquePathCoverProfileId(
  difficulty: AvailableDifficultyLevel,
  requestSeed: string,
  puzzleIndex: number,
  puzzleCount: number,
): UniquePathCoverProfileId {
  if (difficulty === 1) {
    return chooseFiveByFiveProfileId(requestSeed, puzzleIndex, puzzleCount);
  }
  if (difficulty === 2) {
    return chooseLevelTwoProfileId(requestSeed, puzzleIndex, puzzleCount);
  }
  if (difficulty === 3) {
    assertPuzzleIndexIsInWorksheet(puzzleIndex, puzzleCount);
    return '6x6-6-4-4';
  }
  throw new RangeError('unsupported difficulty');
}

function chooseFiveByFiveProfileId(
  requestSeed: string,
  puzzleIndex: number,
  puzzleCount: number,
): UniquePathCoverProfileId {
  const sequencedProfile = selectProfileFromSequence(
    FIVE_BY_FIVE_PROFILE_SEQUENCES,
    puzzleIndex,
    puzzleCount,
  );
  if (sequencedProfile !== undefined) {
    return sequencedProfile;
  }
  assertSinglePuzzleRequest(puzzleIndex, puzzleCount);
  const random = createSeededRandom(`${requestSeed}::terminal-pattern`);
  return (
    SINGLE_FIVE_BY_FIVE_PROFILE_CHOICES[
      random.integer(0, SINGLE_FIVE_BY_FIVE_PROFILE_CHOICES.length - 1)
    ] ?? '5x5-2-2-2'
  );
}

function chooseLevelTwoProfileId(
  requestSeed: string,
  puzzleIndex: number,
  puzzleCount: number,
): UniquePathCoverProfileId {
  const sequencedProfile = selectProfileFromSequence(
    SIX_BY_SIX_LEVEL_TWO_PROFILE_SEQUENCES,
    puzzleIndex,
    puzzleCount,
  );
  if (sequencedProfile !== undefined) {
    return sequencedProfile;
  }
  assertSinglePuzzleRequest(puzzleIndex, puzzleCount);
  const random = createSeededRandom(`${requestSeed}::terminal-profile`);
  return random.integer(0, 1) === 0 ? '6x6-4-4-2' : '6x6-4-4-4';
}

function selectProfileFromSequence(
  sequences: Readonly<Record<number, readonly UniquePathCoverProfileId[]>>,
  puzzleIndex: number,
  puzzleCount: number,
): UniquePathCoverProfileId | undefined {
  const sequence = sequences[puzzleCount];
  if (sequence === undefined) {
    return undefined;
  }
  const selected = sequence[puzzleIndex];
  if (selected === undefined) {
    throw new RangeError('puzzle index is outside the worksheet');
  }
  return selected;
}

function assertSinglePuzzleRequest(
  puzzleIndex: number,
  puzzleCount: number,
): void {
  if (puzzleCount !== 1 || puzzleIndex !== 0) {
    throw new RangeError('unsupported worksheet puzzle count');
  }
}

function assertPuzzleIndexIsInWorksheet(
  puzzleIndex: number,
  puzzleCount: number,
): void {
  if (puzzleIndex < 0 || puzzleIndex >= puzzleCount) {
    throw new RangeError('puzzle index is outside the worksheet');
  }
}
